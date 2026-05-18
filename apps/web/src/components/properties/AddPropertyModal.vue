<script setup lang="ts">
/**
 * Modal that walks the user through creating a new property definition
 * for a single note (per-note schema):
 *
 *   1. Pick a type (tiles grouped by PROPERTY_TYPE_GROUPS).
 *   2. Type a label.
 *   3. Configure type-specific options for types that need them up front
 *      (select / multiSelect / status / rollup / formula / button /
 *      uniqueId / verification / progress / phone). Other types fall
 *      back to `defaultConfigFor(type)` and can be tuned later.
 *
 * On submit the modal calls `useNoteProperties().createDefinition()` so
 * the new property only appears on the active note (kind-wide template
 * propagation is reserved for the future Templates feature).
 */
import { computed, reactive, ref, watch } from 'vue';
import { UiModal, UiButton, UiInput, UiSelect } from '@/components/ui';
import Icon from '@/components/ui/Icon.vue';
import {
    PROPERTY_OPTION_COLORS,
    PROPERTY_TYPE_GROUPS,
    PROPERTY_TYPE_ICONS,
    PROPERTY_TYPE_LABELS,
    STATUS_GROUP_LABELS,
    DURATION_UNIT_LABELS,
    defaultConfigFor,
    defaultStatusOptions,
    isComputedPropertyType,
    type ButtonAction,
    type ButtonConfig,
    type DurationUnit,
    type FormulaConfig,
    type PropertyDefinition,
    type PropertyConfig,
    type PropertyOption,
    type PropertyType,
    type RelationConfig,
    type RollupConfig,
    type StatusConfig,
    type StatusGroupId,
    type StatusOption,
    type TemplatePropertyDefinition,
    type UniqueIdConfig,
    type VerificationConfig,
} from '@continuum/shared';
import { useProperties } from '@/composables/useProperties';
import { useNoteProperties } from '@/composables/useNoteProperties';
import { useKinds } from '@/composables/useKinds';
import { usePageTemplates } from '@/composables/usePageTemplates';
import { api } from '@/api';
import { publishDatabaseSchemaChanged, publishNoteUpdated } from '@/lib/realtime';

const props = withDefaults(defineProps<{
    modelValue: boolean;
    noteId?: string | null;
    owner?: 'note' | 'template' | 'database';
    templateId?: string | null;
    templateProperties?: TemplatePropertyDefinition[];
    /**
     * Owning kind of the note. Optional and informational only — used
     * by future template-aware behaviours; per-note creation does not
     * read from kind-scoped definitions.
     */
    kindId?: string | null;
    /**
     * Target database id when `owner === 'database'`. The created
     * property definition is scoped to the database (visible to every
     * row in it) instead of a specific note or template.
     */
    databaseId?: string | null;
    /**
     * Existing database schema, used as the "sibling properties" pool
     * when the modal is opened in database scope (drives relation /
     * formula / rollup / button targeting). Mirrors `templateProperties`
     * for the template scope.
     */
    databaseProperties?: PropertyDefinition[];
}>(), {
    noteId: null,
    owner: 'note',
    templateId: null,
    templateProperties: () => [],
    kindId: null,
    databaseId: null,
    databaseProperties: () => [],
});

const emit = defineEmits<{
    'update:modelValue': [v: boolean];
    created: [];
}>();

const properties = useProperties();
const activeNoteId = ref<string | null>(props.owner === 'note' ? props.noteId ?? null : null);
const noteProps = useNoteProperties(activeNoteId);
const kinds = useKinds();
const templates = usePageTemplates();

const step = ref<'type' | 'details'>('type');
const type = ref<PropertyType>('text');
const label = ref('');
const formulaInsertKey = ref('');
const options = reactive<(PropertyOption & { group?: StatusGroupId })[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);

/** Per-type configuration scratchpad (only the active type's fields are read). */
const extra = reactive({
    phone: { region: '' },
    progress: { min: 0, max: 100, showPercent: true },
    verification: { ttlAmount: 0, ttlUnit: 'days' as DurationUnit },
    uniqueId: { prefix: '' },
    formula: { expression: '', output: 'string' as 'number' | 'string' | 'boolean', precision: 0 },
    rollup: {
        relationKey: '',
        targetKey: '',
        aggregation: 'count' as RollupConfig['aggregation'],
    },
    button: {
        label: '',
        variant: 'ghost' as 'primary' | 'ghost',
        actionType: 'open-url' as ButtonAction['type'],
        url: '',
        targetKey: '',
        delta: 1,
    },
});

watch(
    [() => props.owner, () => props.noteId],
    ([owner, noteId]) => {
        activeNoteId.value = owner === 'note' ? noteId ?? null : null;
    },
    { immediate: true },
);

type SelectableDefinition = Pick<
    PropertyDefinition,
    'key' | 'label' | 'type' | 'config' | 'kindId'
>;

/**
 * Definitions already attached to this note. Drives relation / rollup
 * / formula / button selectors that need to point at sibling props on
 * the same note. (Cross-note rollup target lookups walk kind templates,
 * which are populated separately through `useProperties`.)
 */
const sameNoteDefs = computed<SelectableDefinition[]>(() => {
    if (props.owner === 'template') {
        return props.templateProperties.map((definition) => ({ ...definition, kindId: null }));
    }
    if (props.owner === 'database') {
        return props.databaseProperties.map((definition) => ({ ...definition, kindId: null }));
    }
    return noteProps.entries.value.map((entry) => entry.definition);
});
const relationOptions = computed(() => sameNoteDefs.value.filter((d) => d.type === 'relation'));
const selectedRollupRelation = computed(
    () => relationOptions.value.find((r) => r.key === extra.rollup.relationKey) ?? null,
);
const aggregationOptions: { id: RollupConfig['aggregation']; label: string }[] = [
    { id: 'count', label: 'Count related notes' },
    { id: 'countNotEmpty', label: 'Count not empty' },
    { id: 'sum', label: 'Sum' },
    { id: 'avg', label: 'Average' },
    { id: 'min', label: 'Minimum' },
    { id: 'max', label: 'Maximum' },
    { id: 'showOriginal', label: 'Show first value' },
];

// ── Themed-select option lists ─────────────────────────────────────────────
// All UiSelect lists are pre-computed so the template stays declarative
// and the option arrays don't churn on every render.

/** Group dropdown shown next to each Status option (todo / in-progress / done). */
const statusGroupOptions = (Object.keys(STATUS_GROUP_LABELS) as StatusGroupId[]).map((g) => ({
    label: STATUS_GROUP_LABELS[g],
    value: g,
}));

/** Output type for a Formula property — drives precision visibility too. */
const formulaOutputOptions = [
    { label: 'Text', value: 'string' },
    { label: 'Number', value: 'number' },
    { label: 'Yes / No', value: 'boolean' },
];

/** Relations available on this kind, used by Rollup to pick its source link. */
const rollupRelationOptions = computed(() =>
    relationOptions.value.map((r) => ({ label: r.label, value: r.key })),
);
const rollupAggregationOptions = aggregationOptions.map((a) => ({ label: a.label, value: a.id }));

/** Visual variants for Button. */
const buttonVariantOptions = [
    { label: 'Ghost', value: 'ghost' },
    { label: 'Primary', value: 'primary' },
];

/** Action kinds for Button — see help text in template for what each does. */
const buttonActionOptions = [
    { label: 'Open URL', value: 'open-url' },
    { label: 'Set property value', value: 'set-property' },
    { label: 'Increment number', value: 'increment-property' },
];

/** Time units accepted by Verification's `ttl`. */
const ttlUnitOptions = (Object.keys(DURATION_UNIT_LABELS) as DurationUnit[]).map((u) => ({
    label: DURATION_UNIT_LABELS[u],
    value: u,
}));

interface SelectOption {
    label: string;
    value: string;
}

function propertyOptionsFromDefinitions(
    defs: SelectableDefinition[],
    includeKindLabel: boolean,
): SelectOption[] {
    const labelsByKey = new Map<string, string[]>();
    for (const def of defs) {
        const prefix = includeKindLabel && def.kindId ? `${kinds.labelOf(def.kindId)} - ` : '';
        const labels = labelsByKey.get(def.key) ?? [];
        labels.push(`${prefix}${def.label}`);
        labelsByKey.set(def.key, labels);
    }
    return [...labelsByKey.entries()]
        .map(([key, labels]) => {
            const uniqueLabels = [...new Set(labels)];
            const visibleLabels = uniqueLabels.slice(0, 2).join(' / ');
            const suffix = uniqueLabels.length > 2 ? ` +${uniqueLabels.length - 2} more` : '';
            return { label: `${visibleLabels}${suffix} (${key})`, value: key };
        })
        .sort((a, b) => a.label.localeCompare(b.label));
}

function isStoredValueDefinition(def: SelectableDefinition): boolean {
    return def.type !== 'button' && !isComputedPropertyType(def.type);
}

function isFormulaReadableDefinition(def: SelectableDefinition): boolean {
    return def.type !== 'button' && def.type !== 'formula' && def.type !== 'rollup';
}

function isNumericDefinition(def: SelectableDefinition): boolean {
    return def.type === 'number' || def.type === 'progress';
}

function rollupTargetKindIdsForSelectedRelation(): string[] {
    const relation = selectedRollupRelation.value;
    if (!relation) return [];
    const cfg = relation.config as RelationConfig;
    const targetKinds = cfg.targetKinds ?? [];
    return targetKinds.length > 0 ? targetKinds : kinds.kinds.value.map((k) => k.id);
}

const formulaPropertyOptions = computed(() =>
    propertyOptionsFromDefinitions(sameNoteDefs.value.filter(isFormulaReadableDefinition), false),
);

const rollupTargetKindIds = computed(() => rollupTargetKindIdsForSelectedRelation());

const rollupTargetDefinitions = computed(() => {
    const ids = new Set(rollupTargetKindIds.value);
    const defs: SelectableDefinition[] = [];
    for (const kindId of ids) defs.push(...(properties.byKind.value.get(kindId) ?? []));
    const numericOnly = ['sum', 'avg', 'min', 'max'].includes(extra.rollup.aggregation);
    return defs.filter((def) => isStoredValueDefinition(def) && (!numericOnly || isNumericDefinition(def)));
});

const rollupTargetPropertyOptions = computed(() => {
    const kindCount = new Set(rollupTargetDefinitions.value.map((def) => def.kindId)).size;
    return propertyOptionsFromDefinitions(rollupTargetDefinitions.value, kindCount > 1);
});

const buttonTargetOptions = computed(() => {
    const numericOnly = extra.button.actionType === 'increment-property';
    const defs = sameNoteDefs.value.filter(
        (def) => isStoredValueDefinition(def) && (!numericOnly || isNumericDefinition(def)),
    );
    return propertyOptionsFromDefinitions(defs, false);
});

async function ensureSelectableDefinitionsLoaded(): Promise<void> {
    // Make sure the active note's definitions are loaded so the
    // relation / formula / button selectors above see fresh data.
    if (props.owner === 'note' && !noteProps.loaded.value) await noteProps.reload();
    if (type.value !== 'rollup') return;
    await kinds.load();
    const targetKindIds = [...new Set(rollupTargetKindIdsForSelectedRelation())];
    await Promise.all(targetKindIds.map((kindId) => properties.load(kindId)));
}

function insertFormulaProperty(key: string): void {
    if (!key) return;
    const snippet = `prop("${key}")`;
    extra.formula.expression = extra.formula.expression.trim()
        ? `${extra.formula.expression} ${snippet}`
        : snippet;
    formulaInsertKey.value = '';
}

function setStatusOptionGroup(option: PropertyOption & { group?: StatusGroupId }, group: string): void {
    option.group = group as StatusGroupId;
}

function setVerificationUnit(unit: string): void {
    extra.verification.ttlUnit = unit as DurationUnit;
}

function setFormulaOutput(output: string): void {
    extra.formula.output = output as 'number' | 'string' | 'boolean';
}

function setRollupAggregation(aggregation: string): void {
    extra.rollup.aggregation = aggregation as RollupConfig['aggregation'];
}

function setButtonVariant(variant: string): void {
    extra.button.variant = variant as 'primary' | 'ghost';
}

function setButtonActionType(actionType: string): void {
    extra.button.actionType = actionType as ButtonAction['type'];
}

function reset(): void {
    step.value = 'type';
    type.value = 'text';
    label.value = '';
    formulaInsertKey.value = '';
    options.splice(0, options.length);
    submitting.value = false;
    error.value = null;
    extra.phone.region = '';
    extra.progress.min = 0;
    extra.progress.max = 100;
    extra.progress.showPercent = true;
    extra.verification.ttlAmount = 0;
    extra.verification.ttlUnit = 'days';
    extra.uniqueId.prefix = '';
    extra.formula.expression = '';
    extra.formula.output = 'string';
    extra.formula.precision = 0;
    extra.rollup.relationKey = '';
    extra.rollup.targetKey = '';
    extra.rollup.aggregation = 'count';
    extra.button.label = '';
    extra.button.variant = 'ghost';
    extra.button.actionType = 'open-url';
    extra.button.url = '';
    extra.button.targetKey = '';
    extra.button.delta = 1;
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) {
            reset();
            void ensureSelectableDefinitionsLoaded();
        }
    },
);

watch(
    [() => type.value, () => extra.rollup.relationKey],
    () => {
        if (props.modelValue) void ensureSelectableDefinitionsLoaded();
    },
);

watch(
    () => extra.rollup.aggregation,
    (aggregation) => {
        if (aggregation === 'count') extra.rollup.targetKey = '';
    },
);

watch(rollupTargetPropertyOptions, (next) => {
    if (!extra.rollup.targetKey) return;
    if (!next.some((option) => option.value === extra.rollup.targetKey)) {
        extra.rollup.targetKey = '';
    }
});

watch(buttonTargetOptions, (next) => {
    if (!extra.button.targetKey) return;
    if (!next.some((option) => option.value === extra.button.targetKey)) {
        extra.button.targetKey = '';
    }
});

const needsOptions = computed(
    () => type.value === 'select' || type.value === 'multiSelect' || type.value === 'status',
);

const modalTitle = computed(() => {
    if (step.value !== 'type') return `New ${PROPERTY_TYPE_LABELS[type.value]} property`;
    if (props.owner === 'template') return 'Add template property';
    if (props.owner === 'database') return 'Add database property';
    return 'Add property';
});

function pickType(t: PropertyType): void {
    type.value = t;
    options.splice(0, options.length);
    if (t === 'status') {
        for (const o of defaultStatusOptions()) options.push({ ...o });
    }
    step.value = 'details';
}

function addOption(): void {
    const idx = options.length;
    const baseColor = PROPERTY_OPTION_COLORS[idx % PROPERTY_OPTION_COLORS.length];
    if (type.value === 'status') {
        options.push({
            id: `opt-${Date.now().toString(36)}-${idx}`,
            label: `Option ${idx + 1}`,
            color: baseColor,
            group: 'todo',
        });
    } else {
        options.push({
            id: `opt-${Date.now().toString(36)}-${idx}`,
            label: `Option ${idx + 1}`,
            color: baseColor,
        });
    }
}

function removeOption(i: number): void {
    options.splice(i, 1);
}

function close(): void {
    emit('update:modelValue', false);
}

/** Build a final, type-correct PropertyConfig from the form state. */
function buildConfig(): PropertyConfig {
    const base = defaultConfigFor(type.value);
    switch (type.value) {
        case 'select':
            return { type: 'select', options: options.map(({ id, label, color }) => ({ id, label, color })) };
        case 'multiSelect':
            return { type: 'multiSelect', options: options.map(({ id, label, color }) => ({ id, label, color })) };
        case 'status': {
            const opts: StatusOption[] = options.map((o) => ({
                id: o.id, label: o.label, color: o.color, group: o.group ?? 'todo',
            }));
            const cfg: StatusConfig = { type: 'status', options: opts };
            return cfg;
        }
        case 'phone':
            return { type: 'phone', ...(extra.phone.region ? { region: extra.phone.region } : {}) };
        case 'progress':
            return {
                type: 'progress',
                min: extra.progress.min,
                max: extra.progress.max,
                showPercent: extra.progress.showPercent,
            };
        case 'verification':
            return {
                type: 'verification',
                ...(extra.verification.ttlAmount > 0
                    ? { ttl: { amount: extra.verification.ttlAmount, unit: extra.verification.ttlUnit } }
                    : {}),
            } satisfies VerificationConfig;
        case 'uniqueId':
            return {
                type: 'uniqueId',
                ...(extra.uniqueId.prefix ? { prefix: extra.uniqueId.prefix } : {}),
            } satisfies UniqueIdConfig;
        case 'formula':
            return {
                type: 'formula',
                expression: extra.formula.expression,
                output: extra.formula.output,
                ...(extra.formula.output === 'number' ? { precision: extra.formula.precision } : {}),
            } satisfies FormulaConfig;
        case 'rollup':
            return {
                type: 'rollup',
                relationKey: extra.rollup.relationKey,
                ...(extra.rollup.targetKey ? { targetKey: extra.rollup.targetKey } : {}),
                aggregation: extra.rollup.aggregation,
            } satisfies RollupConfig;
        case 'button': {
            const action: ButtonAction = (() => {
                switch (extra.button.actionType) {
                    case 'open-url':
                        return { type: 'open-url', url: extra.button.url };
                    case 'increment-property':
                        return {
                            type: 'increment-property',
                            targetKey: extra.button.targetKey,
                            delta: extra.button.delta,
                        };
                    case 'set-property':
                        return {
                            type: 'set-property',
                            targetKey: extra.button.targetKey,
                            value: null,
                        };
                }
            })();
            return {
                type: 'button',
                ...(extra.button.label ? { label: extra.button.label } : {}),
                variant: extra.button.variant,
                action,
            } satisfies ButtonConfig;
        }
        default:
            return base;
    }
}

function validateDetails(): string | null {
    if (type.value === 'rollup') {
        if (!extra.rollup.relationKey) return 'Choose the relation this rollup should follow.';
        if (extra.rollup.aggregation !== 'count' && !extra.rollup.targetKey) {
            return 'Choose the linked property this rollup should read.';
        }
    }
    if (type.value === 'button' && extra.button.actionType !== 'open-url' && !extra.button.targetKey) {
        return 'Choose the target property for this button action.';
    }
    return null;
}

async function submit(): Promise<void> {
    if (!label.value.trim()) {
        error.value = 'Label is required';
        return;
    }
    const validationError = validateDetails();
    if (validationError) {
        error.value = validationError;
        return;
    }
    submitting.value = true;
    error.value = null;
    try {
        const config = buildConfig();
        if (props.owner === 'template') {
            if (!props.templateId) throw new Error('Cannot create a property without an active template');
            await templates.addProperty(props.templateId, {
                label: label.value.trim(),
                type: type.value,
                config,
            });
        } else if (props.owner === 'database') {
            if (!props.databaseId) throw new Error('Cannot create a property without an active database');
            await api.databases.properties.create(props.databaseId, {
                label: label.value.trim(),
                type: type.value,
                config,
            });
            publishDatabaseSchemaChanged(props.databaseId);
        } else {
            await noteProps.createDefinition({
                label: label.value.trim(),
                type: type.value,
                config,
            });
            if (activeNoteId.value) publishNoteUpdated(activeNoteId.value);
        }
        emit('created');
        close();
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Failed to create property';
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <UiModal :modelValue="modelValue" :title="modalTitle"
        size="md" @update:modelValue="emit('update:modelValue', $event)">
        <div v-if="step === 'type'" class="ap-groups">
            <div v-for="group in PROPERTY_TYPE_GROUPS" :key="group.id" class="ap-group">
                <h4 class="ap-group__title">{{ group.label }}</h4>
                <div class="ap-grid">
                    <button v-for="t in group.types" :key="t" type="button" class="ap-tile" @click="pickType(t)">
                        <span class="ap-tile__icon">
                            <Icon :name="PROPERTY_TYPE_ICONS[t]" :size="15" />
                        </span>
                        <span class="ap-tile__label">{{ PROPERTY_TYPE_LABELS[t] }}</span>
                    </button>
                </div>
            </div>
        </div>

        <div v-else class="ap-form">
            <label class="ap-field">
                <span class="ap-field__label">Label</span>
                <UiInput v-model="label" placeholder="e.g. Status, Author, Due date" size="md" />
            </label>

            <!-- ── Select / Multi-select / Status options ─────────────────── -->
            <div v-if="needsOptions" class="ap-field">
                <span class="ap-field__label">Options</span>
                <div class="ap-options">
                    <div v-for="(opt, i) in options" :key="opt.id" class="ap-option">
                        <input type="color" v-model="opt.color" class="ap-option__color" />
                        <input v-model="opt.label" class="ap-option__label" placeholder="Option label" />
                        <UiSelect v-if="type === 'status'"
                            :modelValue="opt.group ?? 'todo'"
                            :options="statusGroupOptions"
                            @update:modelValue="setStatusOptionGroup(opt, $event)"
                            class="ap-option__group" />
                        <button type="button" class="ap-option__remove" @click="removeOption(i)" aria-label="Remove">
                            <Icon name="close" :size="12" />
                        </button>
                    </div>
                    <UiButton variant="ghost" size="sm" @click="addOption">
                        <Icon name="plus" :size="12" />
                        <span>Add option</span>
                    </UiButton>
                </div>
            </div>

            <!-- ── Phone ───────────────────────────────────────────────────── -->
            <label v-if="type === 'phone'" class="ap-field">
                <span class="ap-field__label">Region hint (optional)</span>
                <UiInput v-model="extra.phone.region" placeholder="e.g. IT, US" size="md" />
            </label>

            <!-- ── Progress ────────────────────────────────────────────────── -->
            <template v-if="type === 'progress'">
                <div class="ap-row">
                    <label class="ap-field ap-field--half">
                        <span class="ap-field__label">Min</span>
                        <input v-model.number="extra.progress.min" type="number" class="ap-input" />
                    </label>
                    <label class="ap-field ap-field--half">
                        <span class="ap-field__label">Max</span>
                        <input v-model.number="extra.progress.max" type="number" class="ap-input" />
                    </label>
                </div>
                <label class="ap-field ap-field--inline">
                    <input type="checkbox" v-model="extra.progress.showPercent" />
                    <span>Display value as percentage</span>
                </label>
            </template>

            <!-- ── Verification ────────────────────────────────────────────── -->
            <template v-if="type === 'verification'">
                <div class="ap-row">
                    <label class="ap-field ap-field--half">
                        <span class="ap-field__label">Expire after (amount)</span>
                        <input v-model.number="extra.verification.ttlAmount" type="number" min="0"
                            placeholder="0 = never" class="ap-input" />
                    </label>
                    <label class="ap-field ap-field--half">
                        <span class="ap-field__label">Unit</span>
                        <UiSelect
                            :modelValue="extra.verification.ttlUnit"
                            :options="ttlUnitOptions"
                            @update:modelValue="setVerificationUnit" />
                    </label>
                </div>
                <p class="ap-hint">
                    Choose any interval, from seconds to years. After this lifetime
                    the chip flips from <em>Verified</em> to <em>Expired</em>. Leave
                    the amount at 0 to disable expiry.
                </p>
            </template>

            <!-- ── Unique ID ───────────────────────────────────────────────── -->
            <label v-if="type === 'uniqueId'" class="ap-field">
                <span class="ap-field__label">Prefix (optional)</span>
                <UiInput v-model="extra.uniqueId.prefix" placeholder="e.g. TASK" size="md" />
            </label>

            <!-- ── Formula ─────────────────────────────────────────────────── -->
            <template v-if="type === 'formula'">
                <label class="ap-field">
                    <span class="ap-field__label">Insert property</span>
                    <UiSelect
                        :modelValue="formulaInsertKey"
                        :options="formulaPropertyOptions"
                        :disabled="formulaPropertyOptions.length === 0"
                        placeholder="Choose a property to insert"
                        @update:modelValue="insertFormulaProperty" />
                    <span class="ap-field__hint">
                        Pick the property by its normal label. The expression gets the stable reference automatically.
                    </span>
                </label>
                <label class="ap-field">
                    <span class="ap-field__label">Expression</span>
                    <textarea v-model="extra.formula.expression" class="ap-textarea" rows="3"
                        placeholder='e.g. prop("quantity") * prop("price")'></textarea>
                </label>
                <div class="ap-row">
                    <label class="ap-field ap-field--half">
                        <span class="ap-field__label">Output</span>
                        <UiSelect
                            :modelValue="extra.formula.output"
                            :options="formulaOutputOptions"
                            @update:modelValue="setFormulaOutput" />
                    </label>
                    <label v-if="extra.formula.output === 'number'" class="ap-field ap-field--half">
                        <span class="ap-field__label">Decimals</span>
                        <input v-model.number="extra.formula.precision" type="number" class="ap-input" />
                    </label>
                </div>
                <div class="ap-help">
                    <p class="ap-help__title">Formula — step by step</p>
                    <p>
                        Use <strong>Insert property</strong> above when you need a note value. It inserts
                        <code>prop("key")</code> for you, so you do not have to find or type the key yourself.
                    </p>
                    <ol class="ap-help__steps">
                        <li>Choose the properties you need from <strong>Insert property</strong>.</li>
                        <li>Combine them with operators like <code>+ - * / %</code>, comparisons, and parentheses.</li>
                        <li>Set the expected output type so the result is rendered as text, number, or yes/no.</li>
                    </ol>
                    <p class="ap-help__title ap-help__title--sub">Available functions</p>
                    <ul>
                        <li><code>if(cond, a, b)</code> — branch on a condition</li>
                        <li><code>min(a, b, …)</code>, <code>max(a, b, …)</code></li>
                        <li><code>round</code>, <code>floor</code>, <code>ceil</code>, <code>abs</code></li>
                        <li><code>length(text)</code>, <code>concat(a, b, …)</code>,
                            <code>lower</code>, <code>upper</code></li>
                        <li><code>coalesce(a, b)</code> — first non-empty value</li>
                    </ul>
                    <ul class="ap-help__examples">
                        <li>
                            <span class="ap-help__caption">Total price</span>
                            <code>prop("quantity") * prop("price")</code>
                        </li>
                        <li>
                            <span class="ap-help__caption">Fallback title</span>
                            <code>coalesce(prop("nickname"), prop("name"))</code>
                        </li>
                    </ul>
                </div>
            </template>

            <!-- ── Rollup ──────────────────────────────────────────────────── -->
            <template v-if="type === 'rollup'">
                <p v-if="rollupRelationOptions.length === 0" class="ap-warning">
                    This kind has no <strong>relation</strong> property yet. Create one
                    first — a rollup needs a link to follow.
                </p>
                <label class="ap-field">
                    <span class="ap-field__label">Through relation</span>
                    <UiSelect
                        :modelValue="extra.rollup.relationKey"
                        :options="rollupRelationOptions"
                        placeholder="Select a relation property"
                        @update:modelValue="extra.rollup.relationKey = $event" />
                    <span class="ap-field__hint">
                        The link this rollup will walk — e.g. <em>Tasks</em> on a
                        Project, <em>Author</em> on a Book.
                    </span>
                </label>
                <label class="ap-field">
                    <span class="ap-field__label">Aggregate</span>
                    <UiSelect
                        :modelValue="extra.rollup.aggregation"
                        :options="rollupAggregationOptions"
                        @update:modelValue="setRollupAggregation" />
                </label>
                <label v-if="extra.rollup.aggregation !== 'count'" class="ap-field">
                    <span class="ap-field__label">Of property</span>
                    <UiSelect
                        :modelValue="extra.rollup.targetKey"
                        :options="rollupTargetPropertyOptions"
                        :disabled="!extra.rollup.relationKey || rollupTargetPropertyOptions.length === 0"
                        placeholder="Choose a property from linked notes"
                        @update:modelValue="extra.rollup.targetKey = $event" />
                    <span class="ap-field__hint">
                        Choose by label. The key in parentheses is saved automatically.
                    </span>
                </label>
                <p
                    v-if="extra.rollup.aggregation !== 'count' && extra.rollup.relationKey && rollupTargetPropertyOptions.length === 0"
                    class="ap-warning">
                    No compatible properties were found on the linked kind yet. For Sum, Average, Min, and Max,
                    create a Number or Progress property on the linked notes first.
                </p>
                <div class="ap-help">
                    <p class="ap-help__title">Rollup — step by step</p>
                    <ol class="ap-help__steps">
                        <li>
                            <strong>Pick a relation.</strong> A rollup always works
                            <em>through</em> an existing relation property on this
                            kind. For each note, it gathers every linked note.
                        </li>
                        <li>
                            <strong>Pick what to read</strong> from each linked note
                            with the <em>Of property</em> dropdown — unless you only want to count them.
                        </li>
                        <li>
                            <strong>Pick how to combine</strong> the collected values:
                            count, sum, average, min, max, count-not-empty, or just
                            show the first.
                        </li>
                    </ol>
                    <p class="ap-help__title ap-help__title--sub">Worked example</p>
                    <p>
                        Imagine kind <em>Project</em> with a relation
                        <em>Tasks → Task</em>. Each Task has a Number property
                        <em>Hours</em>.
                    </p>
                    <ul>
                        <li><strong>Through relation</strong>: Tasks</li>
                        <li><strong>Aggregate</strong>: Sum</li>
                        <li><strong>Of property</strong>: Hours <code>(hours)</code></li>
                    </ul>
                    <p>
                        Result on each Project: total hours across all linked tasks.
                        Switch to <em>Count</em> to get the number of tasks, or
                        <em>Average</em> for the mean duration.
                    </p>
                    <p class="ap-help__title ap-help__title--sub">Aggregations cheatsheet</p>
                    <ul>
                        <li><strong>Count</strong> — number of linked notes (ignores the <em>Of property</em>).</li>
                        <li><strong>Count not empty</strong> — same, but only counts notes whose target property has a value.</li>
                        <li><strong>Sum / Average / Min / Max</strong> — numeric only; non-numbers are skipped.</li>
                        <li><strong>Show first</strong> — displays the value from the first linked note.</li>
                    </ul>
                </div>
            </template>

            <!-- ── Button ──────────────────────────────────────────────────── -->
            <template v-if="type === 'button'">
                <div class="ap-row">
                    <label class="ap-field ap-field--half">
                        <span class="ap-field__label">Caption</span>
                        <UiInput v-model="extra.button.label" placeholder="(uses label if blank)" size="md" />
                    </label>
                    <label class="ap-field ap-field--half">
                        <span class="ap-field__label">Style</span>
                        <UiSelect
                            :modelValue="extra.button.variant"
                            :options="buttonVariantOptions"
                            @update:modelValue="setButtonVariant" />
                    </label>
                </div>
                <label class="ap-field">
                    <span class="ap-field__label">Action</span>
                    <UiSelect
                        :modelValue="extra.button.actionType"
                        :options="buttonActionOptions"
                        @update:modelValue="setButtonActionType" />
                </label>
                <label v-if="extra.button.actionType === 'open-url'" class="ap-field">
                    <span class="ap-field__label">URL</span>
                    <UiInput v-model="extra.button.url" placeholder="https://example.com" size="md" />
                    <span class="ap-field__hint">
                        Supports <code>http(s)://</code>, <code>mailto:</code> and
                        <code>tel:</code>. Opens in the system browser, never inside
                        the app.
                    </span>
                </label>
                <template v-if="extra.button.actionType !== 'open-url'">
                    <label class="ap-field">
                        <span class="ap-field__label">Target property</span>
                        <UiSelect
                            :modelValue="extra.button.targetKey"
                            :options="buttonTargetOptions"
                            :disabled="buttonTargetOptions.length === 0"
                            placeholder="Choose a property on this note"
                            @update:modelValue="extra.button.targetKey = $event" />
                        <span class="ap-field__hint">
                            Choose by label. The key in parentheses is saved automatically.
                        </span>
                    </label>
                    <p v-if="buttonTargetOptions.length === 0" class="ap-warning">
                        {{ extra.button.actionType === 'increment-property'
                            ? 'No compatible target property exists yet. Increment needs a Number or Progress property.'
                            : 'No editable target property exists yet. Create a Text, Number, Status, or another editable property first.' }}
                    </p>
                    <label v-if="extra.button.actionType === 'increment-property'" class="ap-field">
                        <span class="ap-field__label">Delta</span>
                        <input v-model.number="extra.button.delta" type="number" class="ap-input" />
                        <span class="ap-field__hint">
                            Added to the target Number on every click. Use a negative
                            value to decrement.
                        </span>
                    </label>
                </template>
                <div class="ap-help">
                    <p class="ap-help__title">Button — step by step</p>
                    <ol class="ap-help__steps">
                        <li>
                            <strong>Choose what the button does</strong> (Action). Each
                            click runs that action <em>on the note where the button
                            lives</em>.
                        </li>
                        <li>
                            <strong>Fill in the action's inputs</strong> — a URL for
                            <em>Open URL</em>, or a target property chosen from the dropdown for the two
                            server-side actions.
                        </li>
                        <li>
                            <strong>Open a note of this kind</strong> and click the
                            button in the property panel. The panel auto-refreshes
                            after server actions.
                        </li>
                    </ol>
                    <p class="ap-help__title ap-help__title--sub">Actions in detail</p>
                    <ul>
                        <li>
                            <strong>Open URL</strong> — opens the URL in the system
                            browser. The URL is static; tokens like
                            <code>{id}</code> are not interpolated yet.
                            <br><span class="ap-help__caption">Example: <code>https://github.com/issues</code></span>
                        </li>
                        <li>
                            <strong>Set property value</strong> — server-side: clears
                            the target property to its empty value (e.g. unset a
                            Status, empty a Text, set a Number to 0). A clean way to
                            reset a field with one click.
                            <br><span class="ap-help__caption">Example: target Status <code>(status)</code> → the Status property is cleared.</span>
                        </li>
                        <li>
                            <strong>Increment number</strong> — server-side: reads
                            the target Number property, adds <em>Delta</em>, writes it
                            back. Negative deltas decrement.
                            <br><span class="ap-help__caption">Example: target Counter <code>(counter)</code>, Delta <code>1</code> → counter goes up by one each click.</span>
                        </li>
                    </ul>
                    <p>
                        You normally do not need to type a key. Pick the property by label; the key in parentheses is
                        shown only so the saved configuration stays transparent.
                    </p>
                </div>
            </template>

            <p v-if="error" class="ap-error">{{ error }}</p>
        </div>

        <template #footer>
            <UiButton v-if="step === 'details'" variant="ghost" size="sm" @click="step = 'type'">
                <Icon name="chevron-left" :size="12" />
                <span>Back</span>
            </UiButton>
            <UiButton variant="ghost" size="sm" @click="close">Cancel</UiButton>
            <UiButton v-if="step === 'details'" variant="primary" size="sm" :disabled="submitting || !label.trim()"
                @click="submit">
                {{ submitting ? 'Creating…' : 'Create property' }}
            </UiButton>
        </template>
    </UiModal>
</template>

<style scoped>
.ap-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(136px, 1fr));
    gap: var(--space-2);
}

.ap-tile {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    background: color-mix(in srgb, var(--bg-elev) 76%, transparent);
    border: var(--border-width-1) solid color-mix(in srgb, var(--border) 78%, transparent);
    border-radius: var(--radius-sm);
    color: var(--fg);
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    min-height: 44px;
    text-align: left;
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard);
}

.ap-tile:hover {
    border-color: var(--border-strong);
    background: var(--bg-soft);
    transform: translateY(-1px);
}

.ap-tile__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--accent) 10%, transparent);
    color: var(--fg-muted);
    flex-shrink: 0;
}

.ap-tile__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: var(--font-weight-medium);
}

.ap-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.ap-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.ap-field__label {
    font-size: var(--text-xs);
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    font-weight: var(--font-weight-semibold);
}

.ap-options {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.ap-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: color-mix(in srgb, var(--bg-elev) 74%, transparent);
    border: var(--border-width-1) solid color-mix(in srgb, var(--border) 78%, transparent);
    border-radius: var(--radius-sm);
    padding: var(--space-1) var(--space-2);
}

.ap-option__color {
    width: 22px;
    height: 22px;
    border: var(--border-width-1) solid color-mix(in srgb, var(--border-strong) 60%, transparent);
    border-radius: var(--radius-xs);
    background: transparent;
    cursor: pointer;
    padding: 0;
}

.ap-option__label {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    padding: var(--space-1) var(--space-2);
}

.ap-option__remove {
    background: transparent;
    border: none;
    color: var(--fg-subtle);
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
}

.ap-option__remove:hover {
    background: var(--bg-soft);
    color: var(--fg);
}

.ap-error {
    margin: 0;
    color: var(--danger, #c66);
    font-size: var(--text-xs);
}

.ap-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.ap-group__title {
    margin: 0 0 var(--space-2);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--fg-subtle);
    font-weight: var(--font-weight-semibold);
}

.ap-row {
    display: flex;
    gap: var(--space-3);
}

.ap-field--half {
    flex: 1;
    min-width: 0;
}

.ap-field--inline {
    flex-direction: row;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--fg-muted);
}

.ap-textarea {
    width: 100%;
    min-height: 64px;
    padding: var(--space-2) var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elev);
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    resize: vertical;
}
.ap-textarea:focus { outline: none; border-color: var(--accent); }

.ap-select {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elev);
    color: var(--fg);
    font-size: var(--text-sm);
}
.ap-select:focus { outline: none; border-color: var(--accent); }

.ap-option__group {
    width: 130px;
    flex-shrink: 0;
}

.ap-input {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-elev);
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
}
.ap-input:focus { outline: none; border-color: var(--accent); }

/* ── Help / hint blocks under the per-type configuration form ─────────── */

.ap-hint {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    line-height: var(--leading-snug);
}
.ap-hint em { color: var(--fg-muted); font-style: normal; font-weight: var(--font-weight-medium); }

.ap-help {
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
    font-size: var(--text-xs);
    color: var(--fg-muted);
    line-height: var(--leading-snug);
}
.ap-help p { margin: 0 0 var(--space-2); }
.ap-help p:last-child { margin-bottom: 0; }
.ap-help__title {
    margin: 0 0 var(--space-2) !important;
    color: var(--fg);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
}
.ap-help__title--sub {
    margin-top: var(--space-3) !important;
    color: var(--fg-muted);
    text-transform: none;
    letter-spacing: 0;
}
.ap-help ul {
    margin: 0 0 var(--space-2);
    padding-left: var(--space-4);
    display: flex; flex-direction: column; gap: 2px;
}
.ap-help__steps {
    margin: 0 0 var(--space-3);
    padding-left: var(--space-4);
    display: flex; flex-direction: column; gap: var(--space-2);
    counter-reset: step;
}
.ap-help__steps li::marker { color: var(--accent); font-weight: var(--font-weight-semibold); }

.ap-help__examples {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex; flex-direction: column; gap: var(--space-2);
}
.ap-help__examples li {
    display: flex; flex-direction: column; gap: 2px;
    padding: var(--space-2);
    background: var(--bg);
    border-radius: var(--radius-sm);
    border: var(--border-width-1) solid var(--border);
}
.ap-help__examples li code {
    background: transparent;
    padding: 0;
    color: var(--accent);
    word-break: break-word;
}
.ap-help__caption {
    color: var(--fg-subtle);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    font-weight: var(--font-weight-semibold);
}
.ap-help code {
    padding: 1px 4px;
    border-radius: 3px;
    background: var(--bg);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 11px;
}
.ap-help em { color: var(--fg); font-style: normal; font-weight: var(--font-weight-medium); }
.ap-help strong { color: var(--fg); font-weight: var(--font-weight-semibold); }

/* Inline hint shown immediately under a field's input. */
.ap-field__hint {
    font-size: 11px;
    color: var(--fg-subtle);
    line-height: var(--leading-snug);
}
.ap-field__hint code {
    padding: 0 3px;
    border-radius: 3px;
    background: var(--bg-soft);
    color: var(--fg);
    font-family: var(--font-mono);
    font-size: 10px;
}
.ap-field__hint em { color: var(--fg-muted); font-style: normal; font-weight: var(--font-weight-medium); }
.ap-field__hint strong { color: var(--fg); font-weight: var(--font-weight-semibold); }

/* Warning banner shown when prerequisites for a property type aren't met. */
.ap-warning {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--warning, #f59e0b) 12%, transparent);
    border: var(--border-width-1) solid var(--warning, #f59e0b);
    color: var(--fg);
    font-size: var(--text-xs);
    line-height: var(--leading-snug);
}
</style>
