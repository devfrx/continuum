<script setup lang="ts">
/**
 * FilterRuleEditor — one row in the filter builder.
 *
 * Layout: [property select] [operator select] [value editor] [×]
 *
 * Value editor type is selected from `OPERATOR_META[op].arity` and the
 * underlying `PropertyType`. Switching property or operator resets the
 * value to a sensible default via `defaultValueFor`.
 */
import { computed } from 'vue';
import type {
    FilterOperator,
    FilterRule,
    FilterValue,
    PropertyDefinition,
    PropertyOption,
    RelativeDatePreset,
} from '@continuum/shared';
import { OPERATORS_BY_TYPE, RELATIVE_DATE_PRESETS } from '@continuum/shared';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiInput from '@/components/ui/UiInput.vue';
import UiSwitch from '@/components/ui/UiSwitch.vue';
import Icon from '@/components/ui/Icon.vue';
import { OPERATOR_META, defaultValueFor } from './operatorMeta';

const props = defineProps<{
    rule: FilterRule;
    properties: PropertyDefinition[];
}>();
const emit = defineEmits<{ change: [next: FilterRule]; remove: [] }>();

const propertyOptions = computed(() =>
    props.properties.map((p) => ({ label: p.label, value: p.key })),
);

const currentDef = computed<PropertyDefinition | null>(
    () => props.properties.find((p) => p.key === props.rule.propertyKey) ?? null,
);

const operatorOptions = computed(() => {
    const def = currentDef.value;
    if (!def) return [];
    return (OPERATORS_BY_TYPE[def.type] ?? []).map((op) => ({
        label: OPERATOR_META[op].label,
        value: op,
    }));
});

const arity = computed(() => OPERATOR_META[props.rule.operator]?.arity ?? 'one');

/** Options exposed by select / status / multiSelect property configs. */
const valueOptions = computed<PropertyOption[]>(() => {
    const cfg = currentDef.value?.config;
    if (!cfg) return [];
    if (cfg.type === 'select' || cfg.type === 'multiSelect' || cfg.type === 'status') {
        return cfg.options as PropertyOption[];
    }
    return [];
});

const presetOptions = RELATIVE_DATE_PRESETS.map((p) => ({
    label: p.replace(/_/g, ' '),
    value: p,
}));

const verificationOptions = [
    { label: 'Verified', value: 'verified' },
    { label: 'Unverified', value: 'unverified' },
    { label: 'Expired', value: 'expired' },
];

function emitValue(value: FilterValue | undefined): void {
    emit('change', { ...props.rule, value });
}

function onPropertyChange(key: string): void {
    const def = props.properties.find((p) => p.key === key);
    if (!def) return;
    const ops = OPERATORS_BY_TYPE[def.type] ?? [];
    const op: FilterOperator = ops[0] ?? 'is_empty';
    emit('change', {
        type: 'rule',
        propertyKey: key,
        operator: op,
        value: defaultValueFor(def.type, op),
    });
}

function onOperatorChange(op: FilterOperator): void {
    const def = currentDef.value;
    if (!def) return;
    emit('change', {
        ...props.rule,
        operator: op,
        value: defaultValueFor(def.type, op),
    });
}

// ── Value coercion helpers (keep templates simple) ──
const stringValue = computed<string>(() =>
    typeof props.rule.value === 'string' ? props.rule.value : '',
);
const numberValue = computed<string>(() =>
    typeof props.rule.value === 'number' ? String(props.rule.value) : '',
);
const boolValue = computed<boolean>(() =>
    typeof props.rule.value === 'boolean' ? props.rule.value : false,
);
const arrayValue = computed<string[]>(() =>
    Array.isArray(props.rule.value) ? props.rule.value : [],
);
const dateRange = computed<{ from: string; to: string }>(() => {
    const v = props.rule.value;
    if (v && typeof v === 'object' && 'from' in v && 'to' in v) {
        return { from: v.from, to: v.to };
    }
    return { from: '', to: '' };
});
const presetValue = computed<RelativeDatePreset>(() => {
    const v = props.rule.value;
    if (v && typeof v === 'object' && 'preset' in v) return v.preset;
    return 'today';
});

function setNumber(s: string): void {
    const n = Number(s);
    emitValue(Number.isFinite(n) ? n : 0);
}

function toggleChip(id: string): void {
    const cur = arrayValue.value;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    emitValue(next);
}

function setRangePart(part: 'from' | 'to', val: string): void {
    const r = dateRange.value;
    emitValue({ ...r, [part]: val });
}
</script>

<template>
    <div class="db-rule">
        <UiSelect
            :model-value="rule.propertyKey"
            :options="propertyOptions"
            placeholder="Property"
            @update:model-value="(v) => onPropertyChange(String(v))"
        />
        <UiSelect
            v-if="currentDef"
            :model-value="rule.operator"
            :options="operatorOptions"
            @update:model-value="(v) => onOperatorChange(v as FilterOperator)"
        />

        <!-- Value editor varies with arity + type -->
        <div class="db-rule__value">
            <template v-if="!currentDef || arity === 'none'">
                <span class="db-rule__noop" />
            </template>

            <template v-else-if="arity === 'two-date'">
                <UiInput
                    type="date"
                    size="sm"
                    :model-value="dateRange.from"
                    @update:model-value="(v) => setRangePart('from', v)"
                />
                <UiInput
                    type="date"
                    size="sm"
                    :model-value="dateRange.to"
                    @update:model-value="(v) => setRangePart('to', v)"
                />
            </template>

            <template v-else-if="arity === 'preset'">
                <UiSelect
                    :model-value="presetValue"
                    :options="presetOptions"
                    @update:model-value="(v) => emitValue({ preset: v as RelativeDatePreset })"
                />
            </template>

            <template v-else-if="currentDef.type === 'checkbox'">
                <UiSwitch :model-value="boolValue" @update:model-value="(v) => emitValue(v)" />
            </template>

            <template v-else-if="currentDef.type === 'verification'">
                <UiSelect
                    :model-value="stringValue"
                    :options="verificationOptions"
                    @update:model-value="(v) => emitValue(String(v))"
                />
            </template>

            <template
                v-else-if="
                    currentDef.type === 'select' ||
                    currentDef.type === 'status'
                "
            >
                <UiSelect
                    :model-value="stringValue"
                    :options="valueOptions.map((o) => ({ label: o.label, value: o.id }))"
                    @update:model-value="(v) => emitValue(String(v))"
                />
            </template>

            <template
                v-else-if="
                    currentDef.type === 'multiSelect' || currentDef.type === 'relation'
                "
            >
                <div class="db-rule__chips">
                    <button
                        v-for="opt in valueOptions"
                        :key="opt.id"
                        type="button"
                        :class="['db-rule__chip', { 'is-on': arrayValue.includes(opt.id) }]"
                        @click="toggleChip(opt.id)"
                    >
                        {{ opt.label }}
                    </button>
                    <span v-if="valueOptions.length === 0" class="db-rule__noop">—</span>
                </div>
            </template>

            <template
                v-else-if="
                    currentDef.type === 'date' ||
                    currentDef.type === 'createdTime' ||
                    currentDef.type === 'lastEditedTime' ||
                    currentDef.type === 'dateRange'
                "
            >
                <UiInput
                    type="date"
                    size="sm"
                    :model-value="stringValue"
                    @update:model-value="(v) => emitValue(v)"
                />
            </template>

            <template
                v-else-if="currentDef.type === 'number' || currentDef.type === 'progress'"
            >
                <UiInput
                    type="number"
                    size="sm"
                    :model-value="numberValue"
                    @update:model-value="setNumber"
                />
            </template>

            <template v-else>
                <UiInput
                    type="text"
                    size="sm"
                    :model-value="stringValue"
                    @update:model-value="(v) => emitValue(v)"
                />
            </template>
        </div>

        <button
            class="db-rule__remove"
            type="button"
            aria-label="Remove rule"
            @click="emit('remove')"
        >
            <Icon name="close" :size="12" />
        </button>
    </div>
</template>

<style scoped>
.db-rule {
    display: grid;
    grid-template-columns: minmax(120px, 1fr) minmax(110px, auto) minmax(140px, 1.5fr) auto;
    gap: var(--space-2);
    align-items: center;
}
.db-rule__value {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    min-width: 0;
}
.db-rule__chips {
    display: flex;
    gap: var(--space-1);
    flex-wrap: wrap;
}
.db-rule__chip {
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px var(--space-3);
    cursor: pointer;
    font-size: var(--text-xs);
    color: var(--fg-muted);
}
.db-rule__chip.is-on {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: var(--accent);
}
.db-rule__noop {
    color: var(--fg-subtle);
    font-size: var(--text-sm);
}
.db-rule__remove {
    background: transparent;
    border: none;
    color: var(--fg-subtle);
    cursor: pointer;
    padding: var(--space-1);
}
</style>
