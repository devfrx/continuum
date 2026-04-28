<script setup lang="ts">
/**
 * Confirmation dialog. Replaces `window.confirm` with an in-app modal
 * that respects the design system. Emits `confirm` when the user accepts
 * and `cancel` (or just closes) otherwise.
 */
import UiModal from './UiModal.vue';
import UiButton from './UiButton.vue';

interface Props {
    modelValue: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    confirmVariant?: 'primary' | 'danger';
}

const props = withDefaults(defineProps<Props>(), {
    message: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    confirmVariant: 'primary',
});
// Re-expose for template usage and to satisfy noUnusedLocals.
void props;

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    confirm: [];
    cancel: [];
}>();

function close() { emit('update:modelValue', false); }
function onCancel() { emit('cancel'); close(); }
function onConfirm() { emit('confirm'); close(); }
</script>

<template>
    <UiModal :model-value="modelValue" :title="title" size="sm"
        @update:model-value="(v) => emit('update:modelValue', v)" @close="onCancel">
        <p v-if="message" class="ui-confirm__msg">{{ message }}</p>
        <slot v-else />
        <template #footer>
            <UiButton variant="ghost" size="sm" @click="onCancel">{{ cancelLabel }}</UiButton>
            <UiButton :variant="confirmVariant" size="sm" @click="onConfirm">{{ confirmLabel }}</UiButton>
        </template>
    </UiModal>
</template>

<style scoped>
.ui-confirm__msg {
    margin: 0;
    color: var(--fg);
}
</style>
