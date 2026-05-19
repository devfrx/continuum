<script setup lang="ts">
/**
 * DatabaseRowDraftBar.vue — shared draft-first row creation surface.
 *
 * Non-table renderers use this compact row above the active view so the
 * note is only created after the user commits a non-empty title (Enter
 * or blur), matching the Table renderer's inline draft contract.
 */
import { nextTick, ref, watch } from 'vue';
import { Icon } from '@/components/ui';

const props = withDefaults(defineProps<{
    modelValue: string;
    creating?: boolean;
    error?: string | null;
    placeholder?: string;
    focusToken?: number;
}>(), {
    creating: false,
    error: null,
    placeholder: 'New row',
    focusToken: 0,
});

const emit = defineEmits<{
    'update:modelValue': [value: string];
    commit: [];
    cancel: [];
}>();

const inputRef = ref<HTMLInputElement | null>(null);

async function focusInput(): Promise<void> {
    await nextTick();
    inputRef.value?.focus();
}

function onInput(event: Event): void {
    emit('update:modelValue', (event.target as HTMLInputElement).value);
}

watch(
    () => props.focusToken,
    () => void focusInput(),
    { immediate: true },
);
</script>

<template>
    <div class="db-row-draft-shell">
        <div class="db-row-draft" :class="{ 'is-creating': creating }">
            <Icon name="plus" :size="13" class="db-row-draft__icon" />
            <input
                ref="inputRef"
                class="db-row-draft__input"
                :value="modelValue"
                :placeholder="placeholder"
                :readonly="creating"
                @input="onInput"
                @keydown.enter.prevent="emit('commit')"
                @keydown.escape="emit('cancel')"
                @blur="emit('commit')" />
            <button
                v-if="!creating"
                type="button"
                class="db-row-draft__cancel"
                title="Cancel row"
                @mousedown.prevent
                @click="emit('cancel')">
                <Icon name="close" :size="12" />
            </button>
            <span v-else class="db-row-draft__status">Creating…</span>
        </div>
        <p v-if="error" class="db-row-draft__error">{{ error }}</p>
    </div>
</template>

<style scoped>
.db-row-draft-shell {
    display: flex;
    flex-direction: column;
}

.db-row-draft {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
    color: var(--text-primary);
}

.db-row-draft.is-creating {
    opacity: 0.75;
}

.db-row-draft__icon {
    flex: 0 0 auto;
    color: var(--text-muted);
}

.db-row-draft__input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
}

.db-row-draft__input::placeholder {
    color: var(--text-muted);
}

.db-row-draft__cancel {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
}

.db-row-draft__cancel:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
}

.db-row-draft__status,
.db-row-draft__error {
    color: var(--text-muted);
    font-size: var(--text-xs);
}

.db-row-draft__error {
    margin: calc(-1 * var(--space-2)) var(--space-3) var(--space-3);
    color: var(--danger);
}
</style>
