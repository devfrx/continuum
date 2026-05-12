<script setup lang="ts">
/**
 * Reusable on/off toggle styled to match the Filtri panel and the
 * rest of the dark UI. Borderless knob, soft inset track, clean
 * accent fill on. Used everywhere the app needs a binary switch
 * with the same visual language as `FilterSlider.vue`.
 *
 * v-model'd against a boolean.
 */
interface Props {
    modelValue: boolean;
    label?: string;
    /** Optional ARIA label when no visible `label` is rendered alongside. */
    ariaLabel?: string;
    disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), { disabled: false });

const emit = defineEmits<{
    'update:model-value': [value: boolean];
}>();

function onChange(event: Event): void {
    if (props.disabled) return;
    emit('update:model-value', (event.target as HTMLInputElement).checked);
}
</script>

<template>
    <label class="filter-toggle" :class="{ 'is-disabled': disabled }">
        <span v-if="label" class="filter-toggle__label">{{ label }}</span>
        <input class="filter-toggle__input" type="checkbox" :checked="modelValue" :disabled="disabled"
            :aria-label="ariaLabel ?? label" @change="onChange" />
    </label>
</template>

<style scoped>
.filter-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    user-select: none;
    padding: var(--space-1) 0;
}

.filter-toggle.is-disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.filter-toggle__label {
    flex: 1;
    color: var(--fg-muted);
    font-size: var(--text-sm);
}

.filter-toggle__input {
    appearance: none;
    -webkit-appearance: none;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    background: var(--surface-3, #2a2a2a);
    position: relative;
    cursor: inherit;
    outline: none;
    flex-shrink: 0;
    margin: 0;
    border: none;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.filter-toggle__input:focus-visible {
    box-shadow:
        inset 0 1px 2px rgba(0, 0, 0, 0.45),
        0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
}

.filter-toggle__input::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #f5f0e2;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    transition:
        transform var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.filter-toggle__input:checked {
    background: var(--accent);
}

.filter-toggle__input:checked::after {
    transform: translateX(16px);
}
</style>
