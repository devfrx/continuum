<script setup lang="ts">
/**
 * FilterValueInput — picks the right value editor for a given
 * `FieldDescriptor` × `FilterOperatorId` pair.
 *
 * Strategy:
 *   1. Look up the operator descriptor to discover its accepted
 *      `valueKinds`. We always render the editor matching `valueKinds[0]`
 *      (the canonical shape — sub-mode toggles are not in scope yet).
 *   2. Branch on the field's `dataType` to pick the input widget. Choice
 *      properties (`select` / `multiSelect` / `status`) read their
 *      options from the property definition's `config.options`.
 *
 * Unary operators (`isEmpty`, `today`, …) declare `valueKinds: ['none']`
 * — we render nothing so the row collapses gracefully.
 *
 * Limitations (documented inline on the relevant branches):
 *   - `relation`: rendered as a comma-separated UUID input. A proper
 *     inline note picker is tracked as future work — `UiNotePickerModal`
 *     is modal-only and inappropriate for a row-level editor.
 */
import { computed } from 'vue';
import {
    type FieldDescriptor,
    type FilterOperatorId,
    type FilterValue,
    type PropertyOption,
    type StatusOption,
} from '@continuum/shared';
import UiInput from '@/components/ui/UiInput.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiSegmented from '@/components/ui/UiSegmented.vue';
import UiDatePicker from '@/components/ui/UiDatePicker.vue';
import { useProperties } from '@/composables/useProperties';
import { useKinds } from '@/composables/useKinds';
import { useFolders } from '@/composables/useFolders';
import { valueKindForField } from './filterValueKinds';

interface Props {
    field: FieldDescriptor;
    operator: FilterOperatorId;
    modelValue: FilterValue;
}

const props = defineProps<Props>();
const emit = defineEmits<{ 'update:modelValue': [v: FilterValue] }>();

const properties = useProperties();
const kinds = useKinds();
const folders = useFolders();
void kinds.load();
void folders.load();

const valueKind = computed<FilterValue['kind']>(
    () => valueKindForField(props.field, props.operator),
);

// ───────── Per-value-kind helpers ─────────

function emitString(value: string): void {
    emit('update:modelValue', { kind: 'string', value });
}

function emitNumber(value: number): void {
    emit('update:modelValue', { kind: 'number', value });
}

function emitNumberRange(from: number, to: number): void {
    emit('update:modelValue', { kind: 'numberRange', from, to });
}

function emitBoolean(value: boolean): void {
    emit('update:modelValue', { kind: 'boolean', value });
}

function emitDate(value: string): void {
    emit('update:modelValue', { kind: 'date', value });
}

function emitDateRange(from: string, to: string): void {
    emit('update:modelValue', { kind: 'dateRange', from, to });
}

function emitDuration(days: number): void {
    emit('update:modelValue', { kind: 'duration', days });
}

function emitStringList(values: string[]): void {
    emit('update:modelValue', { kind: 'stringList', values });
}

// ───────── Typed accessors over `modelValue` ─────────

const stringValue = computed<string>(() =>
    props.modelValue.kind === 'string' ? props.modelValue.value : '',
);

const numberValue = computed<string>(() =>
    props.modelValue.kind === 'number' ? String(props.modelValue.value) : '',
);

const rangeFrom = computed<string>(() =>
    props.modelValue.kind === 'numberRange' ? String(props.modelValue.from) : '',
);

const rangeTo = computed<string>(() =>
    props.modelValue.kind === 'numberRange' ? String(props.modelValue.to) : '',
);

const boolValue = computed<string>(() =>
    props.modelValue.kind === 'boolean' && props.modelValue.value ? 'true' : 'false',
);

const dateValue = computed<string>(() =>
    props.modelValue.kind === 'date' ? props.modelValue.value : '',
);

const dateRangeFrom = computed<string>(() =>
    props.modelValue.kind === 'dateRange' ? props.modelValue.from : '',
);

const dateRangeTo = computed<string>(() =>
    props.modelValue.kind === 'dateRange' ? props.modelValue.to : '',
);

const durationDays = computed<string>(() =>
    props.modelValue.kind === 'duration' ? String(props.modelValue.days) : '',
);

const stringListCsv = computed<string>(() =>
    props.modelValue.kind === 'stringList' ? props.modelValue.values.join(', ') : '',
);

const stringListValues = computed<string[]>(() =>
    props.modelValue.kind === 'stringList' ? props.modelValue.values : [],
);

const stringListSingle = computed<string>(() =>
    props.modelValue.kind === 'stringList' ? (props.modelValue.values[0] ?? '') : '',
);

// ───────── Choice-options resolution ─────────

interface SelectableOption {
    label: string;
    value: string;
}

function optionsForChoice(): SelectableOption[] {
    if (props.field.ref.kind !== 'property') return [];
    const def = properties.byId(props.field.ref.propertyId);
    if (!def) return [];
    const cfg = def.config as { options?: ReadonlyArray<PropertyOption | StatusOption> };
    const opts = cfg.options ?? [];
    return opts.map((o) => ({ label: o.label, value: o.id }));
}

function optionsForKind(): SelectableOption[] {
    return kinds.kinds.value.map((k) => ({ label: k.label, value: k.id }));
}

function optionsForFolder(): SelectableOption[] {
    return folders.flat.value.map((f) => {
        const crumb = folders.breadcrumb(f.id);
        const path = crumb.map((n) => n.name).join(' / ');
        return { label: path || f.name, value: f.id };
    });
}

const choiceOptions = computed<SelectableOption[]>(() => {
    switch (props.field.dataType) {
        case 'select':
        case 'multiSelect':
        case 'status':
            return optionsForChoice();
        case 'kindRef':
            return optionsForKind();
        case 'folderRef':
            return optionsForFolder();
        default:
            return [];
    }
});

const singleChoiceValue = computed<string>(() => {
    if (props.modelValue.kind === 'string') return props.modelValue.value;
    return '';
});

// ───────── Toggles for which branch to render ─────────

const showsNothing = computed<boolean>(() => valueKind.value === 'none');

/** True when the editor should be a single-choice select (eq/neq on
 *  select/status/kindRef/folderRef). */
const isSingleChoice = computed<boolean>(() => {
    if (valueKind.value !== 'string') return false;
    return ['select', 'status', 'kindRef', 'folderRef'].includes(props.field.dataType);
});

/** True when the editor should accept a list of choice IDs (inAny/inAll/notIn). */
const isMultiChoice = computed<boolean>(() => {
    if (valueKind.value !== 'stringList') return false;
    return ['select', 'multiSelect', 'status', 'kindRef', 'folderRef'].includes(
        props.field.dataType,
    );
});

const isRelation = computed<boolean>(() => props.field.dataType === 'relation');

// ───────── Multi-choice toggle handler ─────────

function toggleMultiChoice(value: string): void {
    const current = new Set(stringListValues.value);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    emitStringList([...current]);
}

// ───────── Comma-separated → string[] for stringList fallback ─────────

function emitCsv(raw: string): void {
    const values = raw
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    emitStringList(values);
}

const BOOL_OPTIONS = [
    { label: 'Vero', value: 'true' },
    { label: 'Falso', value: 'false' },
];
</script>

<template>
    <div v-if="!showsNothing" class="filter-value">
        <!-- ───── Single-choice select (select / status / kindRef / folderRef with eq/neq) ───── -->
        <UiSelect
            v-if="isSingleChoice"
            :model-value="singleChoiceValue"
            :options="choiceOptions"
            placeholder="Seleziona…"
            @update:model-value="(v) => emitString(String(v))"
        />

        <!-- ───── Multi-choice (inAny / inAll / notIn) — chip toggles ───── -->
        <div v-else-if="isMultiChoice" class="filter-value__multi">
            <button
                v-for="opt in choiceOptions"
                :key="opt.value"
                type="button"
                class="filter-value__multi-chip"
                :class="{ 'is-on': stringListValues.includes(opt.value) }"
                @click="toggleMultiChoice(opt.value)"
            >
                {{ opt.label }}
            </button>
            <div v-if="choiceOptions.length === 0" class="filter-value__hint">
                Nessuna opzione disponibile
            </div>
        </div>

        <!-- ───── Relation — fallback CSV input (see file header) ───── -->
        <UiInput
            v-else-if="isRelation && valueKind === 'stringList'"
            :model-value="stringListCsv"
            placeholder="ID nota separati da virgola"
            size="sm"
            @update:model-value="emitCsv"
        />
        <UiInput
            v-else-if="isRelation && valueKind === 'string'"
            :model-value="stringValue"
            placeholder="ID nota"
            size="sm"
            @update:model-value="emitString"
        />

        <!-- ───── String ───── -->
        <UiInput
            v-else-if="valueKind === 'string'"
            :model-value="stringValue"
            placeholder="Valore"
            size="sm"
            @update:model-value="emitString"
        />

        <!-- ───── Number ───── -->
        <UiInput
            v-else-if="valueKind === 'number'"
            :model-value="numberValue"
            type="number"
            placeholder="0"
            size="sm"
            @update:model-value="(v) => emitNumber(Number(v))"
        />

        <!-- ───── Number range ───── -->
        <div v-else-if="valueKind === 'numberRange'" class="filter-value__range">
            <UiInput
                :model-value="rangeFrom"
                type="number"
                placeholder="Da"
                size="sm"
                @update:model-value="(v) => emitNumberRange(Number(v), Number(rangeTo))"
            />
            <span class="filter-value__range-sep">–</span>
            <UiInput
                :model-value="rangeTo"
                type="number"
                placeholder="A"
                size="sm"
                @update:model-value="(v) => emitNumberRange(Number(rangeFrom), Number(v))"
            />
        </div>

        <!-- ───── Boolean (rare — most boolean ops are unary) ───── -->
        <UiSegmented
            v-else-if="valueKind === 'boolean'"
            :model-value="boolValue"
            :options="BOOL_OPTIONS"
            size="sm"
            @update:model-value="(v) => emitBoolean(v === 'true')"
        />

        <!-- ───── Date (single) ───── -->
        <UiDatePicker
            v-else-if="valueKind === 'date'"
            :model-value="dateValue"
            placeholder="Data"
            @update:model-value="emitDate"
        />

        <!-- ───── Date range ───── -->
        <div v-else-if="valueKind === 'dateRange'" class="filter-value__range">
            <UiDatePicker
                :model-value="dateRangeFrom"
                placeholder="Da"
                @update:model-value="(v) => emitDateRange(v, dateRangeTo)"
            />
            <span class="filter-value__range-sep">–</span>
            <UiDatePicker
                :model-value="dateRangeTo"
                placeholder="A"
                @update:model-value="(v) => emitDateRange(dateRangeFrom, v)"
            />
        </div>

        <!-- ───── Duration (lastNDays / nextNDays) ───── -->
        <div v-else-if="valueKind === 'duration'" class="filter-value__duration">
            <UiInput
                :model-value="durationDays"
                type="number"
                placeholder="0"
                size="sm"
                @update:model-value="(v) => emitDuration(Number(v))"
            />
            <span class="filter-value__duration-suffix">giorni</span>
        </div>

        <!-- ───── String list (free-form CSV fallback) ───── -->
        <UiInput
            v-else-if="valueKind === 'stringList'"
            :model-value="stringListCsv"
            placeholder="Valori separati da virgola"
            size="sm"
            @update:model-value="emitCsv"
        />

        <!-- ───── Unknown → render nothing rather than guessing ───── -->
        <span v-else class="filter-value__hint">Nessun editor disponibile</span>

        <!-- Use single-element accessors to silence unused-warnings on builds where
             a branch above depends on `stringListSingle`. -->
        <span v-show="false">{{ stringListSingle }}</span>
    </div>
</template>

<style scoped>
.filter-value {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    width: 100%;
    min-width: 0;
}

.filter-value :deep(.ui-input),
.filter-value :deep(.ui-select),
.filter-value :deep(.ui-seg),
.filter-value :deep(.ui-date-picker) {
    min-width: 0;
    width: 100%;
}

.filter-value :deep(.ui-seg__btn) {
    flex: 1 1 0;
    min-width: 0;
    padding: 0 var(--space-2);
}

.filter-value__range {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    width: 100%;
    min-width: 0;
}

.filter-value__range-sep {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
}

.filter-value__duration {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
}

.filter-value__duration-suffix {
    color: var(--fg-muted);
    font-size: var(--text-xs);
}

.filter-value__multi {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
}

@container (max-width: 360px) {
    .filter-value__range {
        grid-template-columns: 1fr;
    }

    .filter-value__range-sep {
        display: none;
    }

    .filter-value__duration {
        align-items: stretch;
        flex-direction: column;
        gap: var(--space-1);
    }
}

.filter-value__multi-chip {
    appearance: none;
    border: var(--border-width-1) solid var(--border);
    background: var(--bg-soft);
    color: var(--fg-muted);
    font: inherit;
    font-size: var(--text-xs);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.filter-value__multi-chip:hover {
    border-color: var(--border-strong);
    color: var(--fg);
}

.filter-value__multi-chip.is-on {
    background: var(--accent-soft, var(--bg-elev));
    color: var(--accent, var(--fg));
    border-color: transparent;
}

.filter-value__hint {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
}
</style>
