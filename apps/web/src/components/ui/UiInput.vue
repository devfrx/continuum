<script setup lang="ts">
import { computed } from 'vue';

interface Props {
    modelValue: string;
    placeholder?: string;
    type?: string;
    size?: 'sm' | 'md';
    leftIcon?: boolean;
    disabled?: boolean;
    variant?: 'default' | 'bare';
}

const props = withDefaults(defineProps<Props>(), {
    type: 'text',
    size: 'md',
    leftIcon: false,
    disabled: false,
    variant: 'default',
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const sizeClass = computed(() => `ui-input--${props.size}`);
const variantClass = computed(() => `ui-input--${props.variant}`);

function onInput(e: Event) {
    emit('update:modelValue', (e.target as HTMLInputElement).value);
}
</script>

<template>
    <label class="ui-input"
        :class="[sizeClass, variantClass, { 'has-icon': leftIcon, 'has-trailing': !!$slots.trailing, 'is-disabled': disabled }]">
        <span v-if="leftIcon" class="ui-input__icon">
            <slot name="icon" />
        </span>
        <input :type="type" :value="modelValue" :placeholder="placeholder" :disabled="disabled" @input="onInput" />
        <span v-if="$slots.trailing" class="ui-input__trailing">
            <slot name="trailing" />
        </span>
    </label>
</template>

<style scoped>
.ui-input {
    display: inline-flex;
    align-items: center;
    width: 100%;
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        box-shadow var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.ui-input:hover {
    border-color: var(--border-strong);
}

.ui-input:focus-within {
    border-color: var(--border-strong);
    box-shadow: none;
}

.ui-input.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.ui-input__icon {
    display: inline-flex;
    align-items: center;
    padding-left: var(--space-5);
    color: var(--fg-subtle);
}

.ui-input input {
    flex: 1;
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-base);
}

.ui-input--md input {
    padding: var(--space-4) var(--space-6);
}

.ui-input--sm input {
    padding: var(--space-3) var(--space-5);
    font-size: var(--text-sm);
}

.ui-input.has-icon input {
    padding-left: var(--space-4);
}

.ui-input__trailing {
    display: inline-flex;
    align-items: center;
    padding-right: var(--space-5);
    color: var(--fg-subtle);
}

.ui-input.has-trailing input {
    padding-right: var(--space-3);
}

.ui-input input::placeholder {
    color: var(--fg-subtle);
}

.ui-input--bare {
    background: transparent;
    border-color: transparent;
}

.ui-input--bare:focus-within {
    border-color: transparent;
    box-shadow: none;
    background: var(--bg-soft);
}

.ui-input--bare input {
    padding: 4px 8px;
    font-size: 12px;
}
</style>
