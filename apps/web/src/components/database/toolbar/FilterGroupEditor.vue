<script setup lang="ts">
/**
 * FilterGroupEditor — recursive container for a `FilterGroup`.
 *
 * Renders the group's combinator pill (and / or), the list of child rules
 * and nested groups, and the action footer (`+ rule`, `+ group`).
 *
 * Every mutation emits the entire updated group via `change` so the parent
 * (another group or the top-level popover) can reassemble the tree.
 */
import { computed } from 'vue';
import type {
    FilterCombinator,
    FilterGroup,
    FilterNode,
    FilterRule,
    PropertyDefinition,
} from '@continuum/shared';
import UiButton from '@/components/ui/UiButton.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import Icon from '@/components/ui/Icon.vue';
import FilterRuleEditor from './FilterRuleEditor.vue';
import { defaultValueFor } from './operatorMeta';
import { OPERATORS_BY_TYPE } from '@continuum/shared';

const props = defineProps<{
    group: FilterGroup;
    properties: PropertyDefinition[];
    /** When true, render a remove (×) button on the group header. */
    removable?: boolean;
    /** Depth in the recursion (used to clamp nesting). */
    depth?: number;
}>();
const emit = defineEmits<{ change: [next: FilterGroup]; remove: [] }>();

const depth = computed(() => props.depth ?? 0);

const combinatorOptions = [
    { label: 'And', value: 'and' },
    { label: 'Or', value: 'or' },
];

function emitNext(rules: FilterNode[], combinator?: FilterCombinator): void {
    emit('change', {
        type: 'group',
        combinator: combinator ?? props.group.combinator,
        rules,
    });
}

function setCombinator(c: FilterCombinator): void {
    emitNext(props.group.rules, c);
}

function updateRule(idx: number, next: FilterRule): void {
    const rules = props.group.rules.map((r, i) => (i === idx ? next : r));
    emitNext(rules);
}

function updateGroup(idx: number, next: FilterGroup): void {
    const rules = props.group.rules.map((r, i) => (i === idx ? next : r));
    emitNext(rules);
}

function removeAt(idx: number): void {
    emitNext(props.group.rules.filter((_, i) => i !== idx));
}

function addRule(): void {
    const def = props.properties[0];
    if (!def) return;
    const ops = OPERATORS_BY_TYPE[def.type] ?? [];
    const op = ops[0] ?? 'is_empty';
    const rule: FilterRule = {
        type: 'rule',
        propertyKey: def.key,
        operator: op,
        value: defaultValueFor(def.type, op),
    };
    emitNext([...props.group.rules, rule]);
}

function addGroup(): void {
    const child: FilterGroup = { type: 'group', combinator: 'and', rules: [] };
    emitNext([...props.group.rules, child]);
}

function isGroup(n: FilterNode): n is FilterGroup {
    return n.type === 'group';
}
function isRule(n: FilterNode): n is FilterRule {
    return n.type === 'rule';
}

/** Label shown before each child row: 'Where' / 'And' / 'Or'. */
function rowLabel(idx: number): string {
    if (idx === 0) return 'Where';
    return props.group.combinator === 'and' ? 'And' : 'Or';
}
</script>

<template>
    <div class="db-group" :class="{ 'is-nested': depth > 0 }">
        <header v-if="removable" class="db-group__header">
            <span class="db-group__title">Filter group</span>
            <button class="db-group__close" type="button" @click="emit('remove')" aria-label="Remove group">
                <Icon name="close" :size="12" />
            </button>
        </header>

        <ul v-if="group.rules.length > 0" class="db-group__rows">
            <li v-for="(child, idx) in group.rules" :key="idx" class="db-group__row">
                <span v-if="idx === 0" class="db-group__lead">Where</span>
                <UiSelect
                    v-else-if="idx === 1"
                    class="db-group__combinator"
                    :model-value="group.combinator"
                    :options="combinatorOptions"
                    @update:model-value="(v) => setCombinator(v as FilterCombinator)"
                />
                <span v-else class="db-group__lead">{{ rowLabel(idx) }}</span>

                <FilterRuleEditor
                    v-if="isRule(child)"
                    :rule="child"
                    :properties="properties"
                    class="db-group__editor"
                    @change="(next) => updateRule(idx, next)"
                    @remove="removeAt(idx)"
                />
                <FilterGroupEditor
                    v-else-if="isGroup(child)"
                    :group="child"
                    :properties="properties"
                    :removable="true"
                    :depth="depth + 1"
                    class="db-group__editor"
                    @change="(next) => updateGroup(idx, next)"
                    @remove="removeAt(idx)"
                />
            </li>
        </ul>
        <p v-else class="db-group__empty">No filters applied</p>

        <div class="db-group__footer">
            <UiButton size="sm" variant="ghost" :disabled="properties.length === 0" @click="addRule">
                <template #icon-left><Icon name="plus" :size="14" /></template>
                Add filter rule
            </UiButton>
            <UiButton v-if="depth < 2" size="sm" variant="ghost" @click="addGroup">
                <template #icon-left><Icon name="plus" :size="14" /></template>
                Add filter group
            </UiButton>
        </div>
    </div>
</template>

<style scoped>
.db-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 460px;
}
.db-group.is-nested {
    border: var(--border-width-1) dashed var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-3);
    min-width: 0;
}
.db-group__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}
.db-group__title {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}
.db-group__close {
    background: transparent;
    border: none;
    color: var(--fg-subtle);
    cursor: pointer;
    padding: var(--space-1);
}
.db-group__rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}
.db-group__row {
    display: grid;
    grid-template-columns: 64px 1fr;
    gap: var(--space-2);
    align-items: center;
}
.db-group__lead {
    font-size: var(--text-sm);
    color: var(--fg-subtle);
    text-align: right;
}
.db-group__combinator {
    max-width: 64px;
}
.db-group__editor {
    min-width: 0;
}
.db-group__empty {
    margin: 0;
    color: var(--fg-subtle);
    font-size: var(--text-sm);
    padding: var(--space-2) var(--space-1);
}
.db-group__footer {
    display: flex;
    gap: var(--space-3);
    padding-top: var(--space-2);
    border-top: var(--border-width-1) solid var(--border);
}
</style>
