<script setup lang="ts">
/**
 * Single-input prompt dialog. A drop-in replacement for `window.prompt`
 * that renders inside the app's design system.
 *
 * Usage:
 *   <UiPromptModal
 *     v-model="open"
 *     title="Rename note"
 *     label="Title"
 *     :initial-value="current"
 *     @submit="onSubmit"
 *   />
 *
 * Emits `submit` with the trimmed value when the user confirms (Enter or
 * the OK button) and the value is non-empty. Pressing Cancel / Escape /
 * clicking the backdrop dismisses without emitting.
 */
import { ref, watch } from 'vue';
import UiModal from './UiModal.vue';
import UiButton from './UiButton.vue';
import UiInput from './UiInput.vue';

interface Props {
    modelValue: boolean;
    title: string;
    label?: string;
    placeholder?: string;
    initialValue?: string;
    /** Text for the confirm button. */
    confirmLabel?: string;
    /** Text for the dismiss button. */
    cancelLabel?: string;
    /** Visual variant of the confirm button. */
    confirmVariant?: 'primary' | 'danger';
}

const props = withDefaults(defineProps<Props>(), {
    label: '',
    placeholder: '',
    initialValue: '',
    confirmLabel: 'Save',
    cancelLabel: 'Cancel',
    confirmVariant: 'primary',
});

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    submit: [value: string];
    cancel: [];
}>();

const value = ref(props.initialValue);

watch(
    () => props.modelValue,
    (open) => {
        if (open) value.value = props.initialValue;
    },
);

function close() {
    emit('update:modelValue', false);
}

function onCancel() {
    emit('cancel');
    close();
}

function onSubmit() {
    const trimmed = value.value.trim();
    if (!trimmed) return;
    emit('submit', trimmed);
    close();
}
</script>

<template>
    <UiModal :model-value="modelValue" :title="title" size="sm"
        @update:model-value="(v) => emit('update:modelValue', v)" @close="onCancel">
        <form class="ui-prompt" @submit.prevent="onSubmit">
            <label v-if="label" class="ui-prompt__label">{{ label }}</label>
            <UiInput v-model="value" :placeholder="placeholder" size="md" />
        </form>
        <template #footer>
            <UiButton variant="ghost" size="sm" @click="onCancel">{{ cancelLabel }}</UiButton>
            <UiButton :variant="confirmVariant" size="sm" :disabled="!value.trim()" @click="onSubmit">
                {{ confirmLabel }}
            </UiButton>
        </template>
    </UiModal>
</template>

<style scoped>
.ui-prompt {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.ui-prompt__label {
    font-size: var(--text-sm);
    color: var(--fg-subtle);
    font-weight: var(--font-weight-medium);
}
</style>
