<script setup lang="ts">
interface Props {
    modelValue: boolean;
    label?: string;
    disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

function toggle() {
    if (!props.disabled) emit('update:modelValue', !props.modelValue);
}
</script>

<template>
    <label class="ui-switch" :class="{ 'is-disabled': disabled }">
        <button type="button" role="switch" :aria-checked="modelValue" :disabled="disabled"
            :class="['ui-switch__track', { 'is-on': modelValue }]" @click="toggle">
            <span class="ui-switch__knob" />
        </button>
        <span v-if="label" class="ui-switch__label">{{ label }}</span>
    </label>
</template>

<style scoped>
.ui-switch {
    display: inline-flex;
    align-items: center;
    gap: var(--space-5);
    cursor: pointer;
    font-size: var(--text-base);
    color: var(--fg);
}

.ui-switch.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.ui-switch__track {
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: var(--radius-md);
    border: none;
    padding: 0;
    background: var(--border-strong);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.ui-switch__track.is-on {
    background: var(--accent);
}

.ui-switch__track:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
}

.ui-switch__knob {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 16px;
    height: 16px;
    border-radius: var(--radius-sm);
    background: #fff;
    box-shadow: var(--shadow-sm);
    transition: transform var(--duration-fast) var(--ease-standard);
}

.ui-switch__track.is-on .ui-switch__knob {
    transform: translateX(16px);
}

.ui-switch__label {
    user-select: none;
}
</style>
