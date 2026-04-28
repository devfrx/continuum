<script setup lang="ts">
import Icon from './Icon.vue';

interface Option {
    label: string;
    value: string | number;
}

interface Props {
    modelValue: string | number;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    variant?: 'default' | 'bare';
}

withDefaults(defineProps<Props>(), {
    disabled: false,
    variant: 'default',
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function onChange(e: Event) {
    emit('update:modelValue', (e.target as HTMLSelectElement).value);
}
</script>

<template>
    <div class="ui-select" :class="[`ui-select--${variant}`, { 'is-disabled': disabled }]">
        <select :value="String(modelValue)" :disabled="disabled" @change="onChange">
            <option v-if="placeholder" value="" disabled hidden>{{ placeholder }}</option>
            <option v-for="opt in options" :key="String(opt.value)" :value="String(opt.value)">
                {{ opt.label }}
            </option>
        </select>
        <Icon class="ui-select__chev" name="chevron-down" :size="12" />
    </div>
</template>

<style scoped>
.ui-select {
    position: relative;
    display: inline-flex;
    width: 100%;
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        box-shadow var(--duration-fast) var(--ease-standard);
}

.ui-select:hover {
    border-color: var(--border-strong);
}

.ui-select:focus-within {
    border-color: var(--border-strong);
    box-shadow: none;
}

.ui-select.is-disabled {
    opacity: 0.5;
}

.ui-select--bare {
    background: transparent;
    border-color: transparent;
    box-shadow: none;
}

.ui-select--bare:focus-within {
    border-color: transparent;
    box-shadow: none;
    background: var(--bg-soft);
}

.ui-select--bare select {
    padding: var(--space-2) var(--space-12) var(--space-2) var(--space-3);
    font-size: var(--text-sm);
}

.ui-select select {
    appearance: none;
    flex: 1;
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-base);
    padding: var(--space-4) var(--space-16) var(--space-4) var(--space-6);
    cursor: pointer;
}

.ui-select__chev {
    position: absolute;
    right: var(--space-5);
    top: 50%;
    transform: translateY(-50%);
    color: var(--fg-subtle);
    pointer-events: none;
}
</style>
