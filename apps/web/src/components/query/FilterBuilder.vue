<script setup lang="ts">
/**
 * FilterBuilder — recursive renderer for a `FilterGroup`.
 *
 * Renders a card containing:
 *   - a combinator switch (and / or) at the top,
 *   - a list of children (nested `FilterBuilder` for groups, otherwise
 *     `FilterConditionRow`),
 *   - footer buttons "Add condition" / "Add group".
 *
 * The component is fully controlled — every mutation produces a new
 * immutable `FilterGroup` and is emitted via `update:node`. No internal
 * state. Visual indentation clamps at depth 3 so deeply nested trees
 * stay legible.
 */
import { computed } from 'vue';
import {
    EMPTY_FILTER_GROUP,
    isFilterGroup,
    type FilterCondition,
    type FilterGroup,
    type FilterNode,
    type FilterOperatorId,
    type FilterValue,
    type SystemFieldId,
} from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiSegmented from '@/components/ui/UiSegmented.vue';
import FilterConditionRow from './FilterConditionRow.vue';
// Self-import for recursion (Vue requires the explicit reference).
// eslint-disable-next-line import/no-self-import
import FilterBuilder from './FilterBuilder.vue';

interface Props {
    node: FilterGroup;
    depth?: number;
    surface?: 'graph' | 'note';
}

const props = withDefaults(defineProps<Props>(), { depth: 0, surface: 'graph' });

const emit = defineEmits<{
    'update:node': [g: FilterGroup];
    remove: [];
}>();

const COMBINATOR_OPTIONS = [
    { label: 'E', value: 'and' },
    { label: 'O', value: 'or' },
];

const MAX_VISUAL_DEPTH = 3;
const visualDepth = computed<number>(() =>
    Math.min(props.depth, MAX_VISUAL_DEPTH),
);

// ───────── Children mutation helpers ─────────

function emitWithChildren(children: FilterNode[]): void {
    emit('update:node', { ...props.node, children });
}

function setCombinator(value: string): void {
    if (value !== 'and' && value !== 'or') return;
    emit('update:node', { ...props.node, combinator: value });
}

function newId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    // Fallback — IDs only need to be locally unique inside the tree.
    return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Build a sensible blank condition. Defaults to the system `note.title`
 * field with a `contains` operator — these exist in every catalog and
 * keep the row visually meaningful before the user picks a real field.
 */
function blankCondition(): FilterCondition {
    const operator: FilterOperatorId = 'contains';
    const value: FilterValue = { kind: 'string', value: '' };
    const systemTitle: SystemFieldId = 'note.title';
    return {
        type: 'condition',
        id: newId(),
        field: { kind: 'system', id: systemTitle },
        operator,
        value,
    };
}

function blankGroup(): FilterGroup {
    return {
        ...EMPTY_FILTER_GROUP,
        id: newId(),
        children: [],
    };
}

function addCondition(): void {
    emitWithChildren([...props.node.children, blankCondition()]);
}

function addGroup(): void {
    emitWithChildren([...props.node.children, blankGroup()]);
}

function replaceChild(index: number, next: FilterNode): void {
    const children = props.node.children.slice();
    children[index] = next;
    emitWithChildren(children);
}

function removeChild(index: number): void {
    const children = props.node.children.slice();
    children.splice(index, 1);
    emitWithChildren(children);
}

const isRoot = computed<boolean>(() => props.depth === 0);
</script>

<template>
    <div class="filter-builder" :class="`filter-builder--depth-${visualDepth}`">
        <div class="filter-builder__head">
            <UiSegmented
                :model-value="node.combinator"
                :options="COMBINATOR_OPTIONS"
                size="sm"
                fill
                @update:model-value="setCombinator"
            />
            <span class="filter-builder__count">
                {{ node.children.length }}
                {{ node.children.length === 1 ? 'condizione' : 'condizioni' }}
            </span>
            <button
                v-if="!isRoot"
                type="button"
                class="filter-builder__remove"
                aria-label="Rimuovi gruppo"
                title="Rimuovi gruppo"
                @click="emit('remove')"
            >
                <Icon name="close" :size="12" />
            </button>
        </div>

        <div v-if="node.children.length > 0" class="filter-builder__body">
            <template v-for="(child, idx) in node.children" :key="child.id">
                <FilterBuilder
                    v-if="isFilterGroup(child)"
                    :node="child"
                    :depth="depth + 1"
                    :surface="surface"
                    @update:node="(g) => replaceChild(idx, g)"
                    @remove="removeChild(idx)"
                />
                <FilterConditionRow
                    v-else
                    :condition="child"
                    :surface="surface"
                    @update:condition="(c) => replaceChild(idx, c)"
                    @remove="removeChild(idx)"
                />
            </template>
        </div>

        <div v-else class="filter-builder__empty">
            Nessuna condizione. Aggiungine una per iniziare.
        </div>

        <div class="filter-builder__footer">
            <UiButton variant="ghost" size="sm" @click="addCondition">
                <template #icon-left>
                    <Icon name="plus" :size="12" />
                </template>
                Aggiungi condizione
            </UiButton>
            <UiButton variant="ghost" size="sm" @click="addGroup">
                <template #icon-left>
                    <Icon name="plus" :size="12" />
                </template>
                Aggiungi gruppo
            </UiButton>
        </div>
    </div>
</template>

<style scoped>
.filter-builder {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    min-width: 0;
    background: var(--surface-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    container-type: inline-size;
}

/* Nested groups read as subordinate clauses without stealing horizontal room. */
.filter-builder--depth-1,
.filter-builder--depth-2,
.filter-builder--depth-3 {
    background: var(--bg-soft);
    border-left-color: var(--border-strong);
    box-shadow: inset 2px 0 0 var(--border-strong);
}

.filter-builder__head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

.filter-builder__head > :deep(.ui-seg) {
    flex: 0 0 92px;
    --ui-seg-h: 28px;
}

.filter-builder__count {
    flex: 1;
    min-width: 0;
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.filter-builder__remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg-subtle);
    cursor: pointer;
}

.filter-builder__remove:hover {
    background: var(--bg-elev);
    color: var(--fg);
}

.filter-builder__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
}

.filter-builder__empty {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    padding: var(--space-2) 0;
}

.filter-builder__footer {
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
}

.filter-builder__footer > :deep(.ui-btn) {
    flex: 1 1 150px;
    justify-content: flex-start;
    min-width: 0;
}

@container (max-width: 300px) {
    .filter-builder {
        padding: var(--space-2);
    }

    .filter-builder__head {
        flex-wrap: wrap;
    }

    .filter-builder__count {
        order: 3;
        flex-basis: 100%;
    }

    .filter-builder__footer > :deep(.ui-btn) {
        flex-basis: 100%;
    }
}
</style>
