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
    gap: var(--space-3);
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--fg);
}

.ui-switch.is-disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

/* Visual parity with `FilterToggle` (the Filtri panel switch in the
 * 2D graph view). Same dimensions, same inset track shadow and cream
 * knob, same accent fill when on — so the Settings page reads as a
 * direct continuation of the graph filters language. */
.ui-switch__track {
    position: relative;
    width: 36px;
    height: 20px;
    border-radius: 999px;
    border: none;
    padding: 0;
    background: var(--surface-3, #2a2a2a);
    cursor: pointer;
    flex-shrink: 0;
    box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.45);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.ui-switch__track.is-on {
    background: var(--accent);
}

.ui-switch__track:focus-visible {
    outline: none;
    box-shadow:
        inset 0 1px 2px rgba(0, 0, 0, 0.45),
        0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
}

.ui-switch__knob {
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

.ui-switch__track.is-on .ui-switch__knob {
    transform: translateX(16px);
}

.ui-switch__label {
    user-select: none;
}
</style>
