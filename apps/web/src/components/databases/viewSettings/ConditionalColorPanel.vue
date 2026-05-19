<script setup lang="ts">
/**
 * ConditionalColorPanel.vue — "Conditional color" section of the
 * view-options popover.
 *
 * Mirrors the FilterPanel structure: a flat ordered list of rules
 * with a "Where" combinator on the first row (no actual combinator —
 * rules are independent and evaluated top-to-bottom), an add button
 * and a clear-all link in the footer. Each rule line stacks:
 *
 *   – condition (field + operator + value via FilterValueEditor),
 *   – colour swatch picker,
 *   – scope (background / text),
 *   – target (row / property) + property picker when needed,
 *   – remove button.
 *
 * Rule order *is* meaningful: the first matching rule per scope
 * (row / per-property-key) wins, so the panel exposes drag-free
 * arrow controls to reorder rows without pulling in another lib.
 * Patches are emitted as `patch-config { conditionalColors: rules }`.
 */
import { computed } from 'vue';
import { Icon, UiButton, UiSelect, UiEmpty } from '@/components/ui';
import type {
    ConditionalColorRule,
    ConditionalColorScope,
    ConditionalColorTarget,
    DatabaseColorTokenId,
    DatabaseView,
    DatabaseViewConfig,
    PropertyDefinition,
} from '@continuum/shared';
import { FILTER_OPERATORS } from '@continuum/shared';
import {
    defaultFilterValue,
    describeFields,
    operatorsForType,
} from '../filtering/operators';
import type {
    DatabaseFieldDescriptor,
    FilterCondition,
    FilterOperatorId,
    FilterValue,
} from '../filtering/types';
import { TITLE_FIELD_ID } from '../filtering/types';
import FilterValueEditor from './FilterValueEditor.vue';
import ColorTokenPicker from './ColorTokenPicker.vue';

const props = defineProps<{
    view: DatabaseView;
    schema: readonly PropertyDefinition[];
}>();

const emit = defineEmits<{
    'patch-config': [patch: Partial<DatabaseViewConfig>];
}>();

// ───────────────── Field catalogue ─────────────────

const fields = computed<DatabaseFieldDescriptor[]>(() => describeFields(props.schema));

const fieldOptions = computed(() =>
    fields.value.map((f) => ({ value: f.id, label: f.label })),
);

const propertyOptions = computed(() =>
    props.schema.map((d) => ({ value: d.key, label: d.label })),
);

const SCOPE_OPTIONS = [
    { value: 'background', label: 'Background' },
    { value: 'text', label: 'Text' },
] as const;

const TARGET_OPTIONS = [
    { value: 'row', label: 'Whole row' },
    { value: 'property', label: 'This property' },
] as const;

// ───────────────── Current rules ─────────────────

const rules = computed<ConditionalColorRule[]>(
    () => props.view.config.conditionalColors ?? [],
);

// ───────────────── Field / condition helpers ─────────────────

function descriptorFor(condition: FilterCondition): DatabaseFieldDescriptor {
    const ref = condition.field;
    if (ref.kind === 'system' && ref.id === 'note.title') {
        return fields.value[0];
    }
    if (ref.kind === 'property') {
        const def = props.schema.find((d) => d.key === ref.key);
        if (def) {
            const found = fields.value.find((f) => f.id === def.id);
            if (found) return found;
        }
    }
    return fields.value[0];
}

function fieldIdOf(condition: FilterCondition): string {
    return descriptorFor(condition).id;
}

function operatorOptionsFor(descriptor: DatabaseFieldDescriptor) {
    return operatorsForType(descriptor.type).map((op) => ({
        value: op,
        label: FILTER_OPERATORS[op]?.label ?? op,
    }));
}

function newId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `cc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyCondition(): FilterCondition {
    const descriptor = fields.value[0];
    const op = operatorsForType(descriptor.type)[0] ?? 'isEmpty';
    return {
        type: 'condition',
        id: newId(),
        field:
            descriptor.id === TITLE_FIELD_ID
                ? { kind: 'system', id: 'note.title' }
                : { kind: 'property', key: descriptor.definition!.key },
        operator: op,
        value: defaultFilterValue(op),
    };
}

// ───────────────── Mutators ─────────────────

function emitRules(next: ConditionalColorRule[]): void {
    emit('patch-config', { conditionalColors: next });
}

function patchRule(id: string, patch: Partial<ConditionalColorRule>): void {
    emitRules(
        rules.value.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    );
}

function patchCondition(id: string, patch: Partial<FilterCondition>): void {
    emitRules(
        rules.value.map((rule) => {
            if (rule.id !== id) return rule;
            const current = rule.condition;
            if (current.type !== 'condition') {
                // Group conditions are not editable from this panel — drop
                // them in favour of a fresh leaf so the user keeps control.
                return { ...rule, condition: { ...emptyCondition(), ...patch } };
            }
            return { ...rule, condition: { ...current, ...patch } };
        }),
    );
}

function addRule(): void {
    if (fields.value.length === 0) return;
    const firstProperty = props.schema[0]?.key ?? null;
    emitRules([
        ...rules.value,
        {
            id: newId(),
            condition: emptyCondition(),
            color: 'blue',
            scope: 'background',
            target: 'row',
            propertyKey: firstProperty,
        },
    ]);
}

function removeRule(id: string): void {
    emitRules(rules.value.filter((rule) => rule.id !== id));
}

function clearAll(): void {
    if (rules.value.length === 0) return;
    emitRules([]);
}

function moveRule(id: string, delta: -1 | 1): void {
    const index = rules.value.findIndex((rule) => rule.id === id);
    if (index < 0) return;
    const target = index + delta;
    if (target < 0 || target >= rules.value.length) return;
    const next = rules.value.slice();
    const [removed] = next.splice(index, 1);
    next.splice(target, 0, removed);
    emitRules(next);
}

function onFieldChange(rule: ConditionalColorRule, fieldId: string): void {
    const descriptor = fields.value.find((f) => f.id === fieldId);
    if (!descriptor) return;
    const ops = operatorsForType(descriptor.type);
    const condition = rule.condition.type === 'condition' ? rule.condition : emptyCondition();
    const nextOp: FilterOperatorId = ops.includes(condition.operator)
        ? condition.operator
        : (ops[0] ?? 'isEmpty');
    patchCondition(rule.id, {
        field:
            descriptor.id === TITLE_FIELD_ID
                ? { kind: 'system', id: 'note.title' }
                : { kind: 'property', key: descriptor.definition!.key },
        operator: nextOp,
        value: defaultFilterValue(nextOp),
    });
}

function onOperatorChange(rule: ConditionalColorRule, operator: string): void {
    const op = operator as FilterOperatorId;
    const condition = rule.condition.type === 'condition' ? rule.condition : null;
    if (condition && op === condition.operator) return;
    patchCondition(rule.id, {
        operator: op,
        value: defaultFilterValue(op),
    });
}

function onValueChange(rule: ConditionalColorRule, value: FilterValue): void {
    patchCondition(rule.id, { value });
}

function onColorChange(rule: ConditionalColorRule, color: DatabaseColorTokenId): void {
    patchRule(rule.id, { color });
}

function onScopeChange(rule: ConditionalColorRule, scope: string): void {
    if (scope !== 'background' && scope !== 'text') return;
    patchRule(rule.id, { scope: scope as ConditionalColorScope });
}

function onTargetChange(rule: ConditionalColorRule, target: string): void {
    if (target !== 'row' && target !== 'property') return;
    const next: Partial<ConditionalColorRule> = { target: target as ConditionalColorTarget };
    if (target === 'property' && !rule.propertyKey) {
        next.propertyKey = props.schema[0]?.key ?? null;
    }
    patchRule(rule.id, next);
}

function onPropertyChange(rule: ConditionalColorRule, key: string): void {
    patchRule(rule.id, { propertyKey: key });
}

function conditionOf(rule: ConditionalColorRule): FilterCondition {
    if (rule.condition.type === 'condition') return rule.condition;
    return emptyCondition();
}
</script>

<template>
    <div class="cc-panel">
        <ol v-if="rules.length > 0" class="cc-panel__list">
            <li
                v-for="(rule, index) in rules"
                :key="rule.id"
                class="cc-panel__row">
                <div class="cc-panel__row-head">
                    <span class="cc-panel__where">
                        {{ index === 0 ? 'When' : 'Or when' }}
                    </span>
                    <div class="cc-panel__row-actions">
                        <button
                            type="button"
                            class="cc-panel__icon-btn"
                            :disabled="index === 0"
                            aria-label="Move up"
                            title="Move up"
                            @click="moveRule(rule.id, -1)">
                            <Icon name="chevron-up" :size="12" />
                        </button>
                        <button
                            type="button"
                            class="cc-panel__icon-btn"
                            :disabled="index === rules.length - 1"
                            aria-label="Move down"
                            title="Move down"
                            @click="moveRule(rule.id, 1)">
                            <Icon name="chevron-down" :size="12" />
                        </button>
                        <button
                            type="button"
                            class="cc-panel__icon-btn cc-panel__icon-btn--danger"
                            aria-label="Remove rule"
                            title="Remove rule"
                            @click="removeRule(rule.id)">
                            <Icon name="close" :size="12" />
                        </button>
                    </div>
                </div>

                <UiSelect
                    :model-value="fieldIdOf(conditionOf(rule))"
                    :options="fieldOptions"
                    class="cc-panel__control"
                    aria-label="Field"
                    @update:model-value="(v) => onFieldChange(rule, String(v))" />
                <UiSelect
                    :model-value="conditionOf(rule).operator"
                    :options="operatorOptionsFor(descriptorFor(conditionOf(rule)))"
                    class="cc-panel__control"
                    aria-label="Operator"
                    @update:model-value="(v) => onOperatorChange(rule, String(v))" />
                <FilterValueEditor
                    :model-value="conditionOf(rule).value"
                    :descriptor="descriptorFor(conditionOf(rule))"
                    class="cc-panel__control"
                    @update:model-value="(v) => onValueChange(rule, v)" />

                <div class="cc-panel__row-divider" aria-hidden="true" />

                <div class="cc-panel__pair">
                    <ColorTokenPicker
                        :model-value="rule.color"
                        aria-label="Color"
                        @update:model-value="(v) => onColorChange(rule, v)" />
                    <UiSelect
                        :model-value="rule.scope"
                        :options="[...SCOPE_OPTIONS]"
                        aria-label="Scope"
                        @update:model-value="(v) => onScopeChange(rule, String(v))" />
                </div>
                <div class="cc-panel__pair">
                    <UiSelect
                        :model-value="rule.target"
                        :options="[...TARGET_OPTIONS]"
                        aria-label="Target"
                        @update:model-value="(v) => onTargetChange(rule, String(v))" />
                    <UiSelect
                        v-if="rule.target === 'property'"
                        :model-value="rule.propertyKey ?? ''"
                        :options="propertyOptions"
                        :disabled="propertyOptions.length === 0"
                        aria-label="Property"
                        @update:model-value="(v) => onPropertyChange(rule, String(v))" />
                    <span v-else class="cc-panel__hint">Applies to every cell of the row.</span>
                </div>
            </li>
        </ol>

        <UiEmpty
            v-else
            compact
            title="No color rules yet"
            description="Highlight rows or single properties based on conditions, just like in Notion.">
            <template #icon>
                <Icon name="palette" :size="20" />
            </template>
        </UiEmpty>

        <footer class="cc-panel__footer">
            <UiButton
                variant="ghost"
                size="sm"
                :disabled="fields.length === 0"
                @click="addRule">
                <Icon name="plus" :size="14" />
                <span>Add color rule</span>
            </UiButton>
            <button
                v-if="rules.length > 0"
                type="button"
                class="cc-panel__link"
                @click="clearAll">
                Clear all
            </button>
        </footer>
    </div>
</template>

<style scoped>
/**
 * Visual language intentionally tracks FilterPanel: same card shell,
 * same control width, same combinator label slot. The colour-specific
 * controls (swatch picker, scope, target) live below a thin divider
 * so the two halves of a rule (condition vs. styling) stay scannable.
 */
.cc-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.cc-panel__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.cc-panel__row {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--surface-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    transition: border-color var(--duration-fast) var(--ease-standard);
}

.cc-panel__row:focus-within {
    border-color: var(--border-strong);
}

.cc-panel__row-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 22px;
}

.cc-panel__where {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: var(--font-weight-semibold);
    color: var(--text-muted);
    padding: 0 var(--space-1);
}

.cc-panel__row-actions {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
}

.cc-panel__icon-btn {
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

.cc-panel__icon-btn:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--text-primary);
}

.cc-panel__icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.cc-panel__icon-btn--danger:hover:not(:disabled) {
    color: var(--danger);
    background: var(--danger-faint);
}

.cc-panel__control {
    width: 100%;
    min-width: 0;
}

.cc-panel__row-divider {
    height: 1px;
    background: var(--border);
    margin: var(--space-1) 0;
}

.cc-panel__pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-2);
    align-items: center;
}

.cc-panel__hint {
    color: var(--text-muted);
    font-size: var(--text-xs);
}

.cc-panel__footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
}

.cc-panel__link {
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

.cc-panel__link:hover {
    color: var(--text-primary);
    background: var(--surface-hover);
}
</style>
