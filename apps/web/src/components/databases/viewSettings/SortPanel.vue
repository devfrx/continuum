<script setup lang="ts">
/**
 * SortPanel.vue — "Sort" section of the view-options popover.
 *
 * Lists every configured `SortRule` for the active view and exposes:
 *   – property picker (any non-`button`/`files` property + the title),
 *   – ascending / descending direction toggle,
 *   – remove rule,
 *   – "Add sort" button.
 *
 * Patches are emitted as `patch-config { sort: SortRule[] }` so the
 * parent merges them at the root of `view.config` (sibling to
 * `layout`). Validity is enforced locally: rules whose property no
 * longer exists in the schema are pruned before persisting.
 */
import { computed } from 'vue';
import { Icon, UiSelect, UiButton, UiEmpty, UiSegmented } from '@/components/ui';
import type {
    DatabaseView,
    DatabaseViewConfig,
    FieldRef,
    PropertyDefinition,
    SortRule,
} from '@continuum/shared';
import { describeFields, isSortableType } from '../filtering/operators';
import type { DatabaseFieldDescriptor } from '../filtering/types';
import { CONDITIONAL_COLOR_FIELD_ID, TITLE_FIELD_ID } from '../filtering/types';

const props = defineProps<{
    view: DatabaseView;
    schema: readonly PropertyDefinition[];
}>();

const emit = defineEmits<{
    'patch-config': [patch: Partial<DatabaseViewConfig>];
}>();

// ───────────────── Derived field catalogue ─────────────────

const sortableFields = computed<DatabaseFieldDescriptor[]>(() =>
    describeFields(props.schema, {
        conditionalColors: props.view.config.conditionalColors,
    }).filter((f) => isSortableType(f.type)),
);

const fieldOptions = computed(() =>
    sortableFields.value.map((f) => ({ value: f.id, label: f.label })),
);

const directionOptions: Array<{ value: string; label: string }> = [
    { value: 'asc', label: 'Asc' },
    { value: 'desc', label: 'Desc' },
];

// ───────────────── Rule list (pruned against schema) ─────────────────

const liveRules = computed<SortRule[]>(() => {
    const raw = Array.isArray(props.view.config.sort) ? props.view.config.sort : [];
    return raw.filter((rule) => fieldIdOfRule(rule) !== '');
});

// ───────────────── Helpers ─────────────────

function fieldRefOf(descriptor: DatabaseFieldDescriptor): FieldRef {
    if (descriptor.id === TITLE_FIELD_ID) {
        return { kind: 'system', id: 'note.title' };
    }
    if (descriptor.id === CONDITIONAL_COLOR_FIELD_ID) {
        return { kind: 'viewMeta', id: 'view.conditionalColor' };
    }
    return { kind: 'property', key: descriptor.definition!.key };
}

function fieldIdOfRule(rule: SortRule): string {
    const field = rule.field;
    if (field.kind === 'system' && field.id === 'note.title') return TITLE_FIELD_ID;
    if (field.kind === 'viewMeta' && field.id === 'view.conditionalColor') {
        return CONDITIONAL_COLOR_FIELD_ID;
    }
    if (field.kind === 'property') {
        const def = props.schema.find((d) => d.key === field.key);
        return def ? def.id : '';
    }
    return '';
}

function newId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emitRules(next: SortRule[]): void {
    emit('patch-config', { sort: next });
}

// ───────────────── User actions ─────────────────

function addRule(): void {
    const used = new Set(liveRules.value.map(fieldIdOfRule));
    const next = sortableFields.value.find((f) => !used.has(f.id))
        ?? sortableFields.value[0];
    if (!next) return;
    emitRules([
        ...liveRules.value,
        { id: newId(), field: fieldRefOf(next), direction: 'asc' },
    ]);
}

function removeRule(index: number): void {
    const next = liveRules.value.slice();
    next.splice(index, 1);
    emitRules(next);
}

function changeField(index: number, fieldId: string): void {
    const descriptor = sortableFields.value.find((f) => f.id === fieldId);
    if (!descriptor) return;
    const current = liveRules.value[index];
    if (!current) return;
    const next = liveRules.value.slice();
    next[index] = { ...current, field: fieldRefOf(descriptor) };
    emitRules(next);
}

function setDirection(index: number, direction: 'asc' | 'desc'): void {
    const current = liveRules.value[index];
    if (!current || current.direction === direction) return;
    const next = liveRules.value.slice();
    next[index] = { ...current, direction };
    emitRules(next);
}

/** Template-friendly wrapper — avoids inline `as` casts in v-on handlers. */
function onDirectionChange(index: number, value: string): void {
    if (value === 'asc' || value === 'desc') setDirection(index, value);
}

function clearAll(): void {
    if (liveRules.value.length === 0) return;
    emitRules([]);
}
</script>

<template>
    <div class="sort-panel">
        <ol v-if="liveRules.length > 0" class="sort-panel__list">
            <li
                v-for="(rule, index) in liveRules"
                :key="rule.id"
                class="sort-panel__row">
                <div class="sort-panel__row-head">
                    <span class="sort-panel__lead">
                        {{ index === 0 ? 'Sort by' : 'Then by' }}
                    </span>
                    <button
                        type="button"
                        class="sort-panel__remove"
                        aria-label="Remove rule"
                        title="Remove this sort rule"
                        @click="removeRule(index)">
                        <Icon name="close" :size="12" />
                    </button>
                </div>
                <UiSelect
                    :model-value="fieldIdOfRule(rule)"
                    :options="fieldOptions"
                    class="sort-panel__control"
                    aria-label="Field"
                    @update:model-value="(v) => changeField(index, String(v))" />
                <UiSegmented
                    class="sort-panel__direction"
                    :model-value="rule.direction"
                    :options="directionOptions"
                    aria-label="Sort direction"
                    @update:model-value="(v) => onDirectionChange(index, String(v))" />
            </li>
        </ol>

        <UiEmpty
            v-else
            compact
            title="No sort rules"
            description="Add a rule to order rows by any property.">
            <template #icon>
                <Icon name="arrow-down" :size="20" />
            </template>
        </UiEmpty>

        <footer class="sort-panel__footer">
            <UiButton
                variant="ghost"
                size="sm"
                :disabled="sortableFields.length === 0"
                @click="addRule">
                <Icon name="plus" :size="14" />
                <span>Add sort</span>
            </UiButton>
            <button
                v-if="liveRules.length > 0"
                type="button"
                class="sort-panel__link"
                @click="clearAll">
                Clear all
            </button>
        </footer>
    </div>
</template>

<style scoped>
/**
 * Notion-style sort rule cards. Each rule stacks its controls
 * vertically (Sort by / Then by → field → direction) so labels remain
 * legible inside a 360px popover.
 */
.sort-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.sort-panel__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.sort-panel__row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    transition: border-color var(--duration-fast) var(--ease-standard);
}

.sort-panel__row:focus-within {
    border-color: var(--border-strong);
}

.sort-panel__row-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 22px;
}

.sort-panel__lead {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: var(--font-weight-semibold);
    color: var(--text-muted);
    padding: 0 var(--space-1);
}

.sort-panel__control {
    width: 100%;
    min-width: 0;
}

.sort-panel__direction {
    --ui-seg-h: 28px;
    width: 100%;
}

.sort-panel__remove {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: transparent;
    border: 0;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius-sm);
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.sort-panel__remove:hover {
    color: var(--danger);
    background: var(--danger-faint);
}

.sort-panel__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
}

.sort-panel__link {
    background: none;
    border: 0;
    color: var(--text-secondary);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-medium);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.sort-panel__link:hover {
    color: var(--text-primary);
    background: var(--surface-hover);
}
</style>
