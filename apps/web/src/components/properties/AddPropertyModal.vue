<script setup lang="ts">
/**
 * Modal that walks the user through creating a new property definition:
 *
 *   1. Pick a type (grid of 11 tiles).
 *   2. Type a label.
 *   3. (Conditional) Configure type-specific options — currently only
 *      select / multiSelect need an option list to be useful from the
 *      start; everything else gets sensible defaults and can be tuned
 *      later from the property's "Configure" menu.
 *
 * On submit the modal calls `useProperties().create()` and closes.
 */
import { computed, reactive, ref, watch } from 'vue';
import { UiModal, UiButton, UiInput } from '@/components/ui';
import Icon from '@/components/ui/Icon.vue';
import {
    PROPERTY_OPTION_COLORS,
    PROPERTY_TYPES,
    PROPERTY_TYPE_ICONS,
    PROPERTY_TYPE_LABELS,
    defaultConfigFor,
    type PropertyConfig,
    type PropertyOption,
    type PropertyType,
} from '@continuum/shared';
import { useProperties } from '@/composables/useProperties';

const props = defineProps<{
    modelValue: boolean;
    kindId: string;
}>();

const emit = defineEmits<{
    'update:modelValue': [v: boolean];
    created: [];
}>();

const properties = useProperties();

const step = ref<'type' | 'details'>('type');
const type = ref<PropertyType>('text');
const label = ref('');
const options = reactive<PropertyOption[]>([]);
const submitting = ref(false);
const error = ref<string | null>(null);

function reset(): void {
    step.value = 'type';
    type.value = 'text';
    label.value = '';
    options.splice(0, options.length);
    submitting.value = false;
    error.value = null;
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) reset();
    },
);

const needsOptions = computed(
    () => type.value === 'select' || type.value === 'multiSelect',
);

function pickType(t: PropertyType): void {
    type.value = t;
    step.value = 'details';
}

function addOption(): void {
    const idx = options.length;
    options.push({
        id: `opt-${Date.now().toString(36)}-${idx}`,
        label: `Option ${idx + 1}`,
        color: PROPERTY_OPTION_COLORS[idx % PROPERTY_OPTION_COLORS.length],
    });
}

function removeOption(i: number): void {
    options.splice(i, 1);
}

function close(): void {
    emit('update:modelValue', false);
}

async function submit(): Promise<void> {
    if (!label.value.trim()) {
        error.value = 'Label is required';
        return;
    }
    submitting.value = true;
    error.value = null;
    try {
        const baseConfig = defaultConfigFor(type.value);
        let config: PropertyConfig = baseConfig;
        if (type.value === 'select') {
            config = { type: 'select', options: [...options] };
        } else if (type.value === 'multiSelect') {
            config = { type: 'multiSelect', options: [...options] };
        }
        await properties.create(props.kindId, {
            label: label.value.trim(),
            type: type.value,
            config,
        });
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
    <UiModal :modelValue="modelValue" :title="step === 'type' ? 'Add property' : `New ${PROPERTY_TYPE_LABELS[type]} property`"
        size="md" @update:modelValue="emit('update:modelValue', $event)">
        <div v-if="step === 'type'" class="ap-grid">
            <button v-for="t in PROPERTY_TYPES" :key="t" type="button" class="ap-tile" @click="pickType(t)">
                <span class="ap-tile__icon">
                    <Icon :name="PROPERTY_TYPE_ICONS[t]" :size="15" />
                </span>
                <span class="ap-tile__label">{{ PROPERTY_TYPE_LABELS[t] }}</span>
            </button>
        </div>

        <div v-else class="ap-form">
            <label class="ap-field">
                <span class="ap-field__label">Label</span>
                <UiInput v-model="label" placeholder="e.g. Status, Author, Due date" size="md" />
            </label>

            <div v-if="needsOptions" class="ap-field">
                <span class="ap-field__label">Options</span>
                <div class="ap-options">
                    <div v-for="(opt, i) in options" :key="opt.id" class="ap-option">
                        <input type="color" v-model="opt.color" class="ap-option__color" />
                        <input v-model="opt.label" class="ap-option__label" placeholder="Option label" />
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
</style>
