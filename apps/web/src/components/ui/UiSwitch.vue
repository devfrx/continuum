<script setup lang="ts">
interface Props {
    modelValue: boolean;
    label?: string;
    ariaLabel?: string;
    labelPosition?: 'start' | 'end';
    block?: boolean;
    disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    labelPosition: 'end',
    block: false,
    disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

function onChange(event: Event): void {
    if (props.disabled) return;
    emit('update:modelValue', (event.target as HTMLInputElement).checked);
}
</script>

<template>
    <label
        class="ui-switch"
        :class="[
            `ui-switch--label-${labelPosition}`,
            { 'ui-switch--block': block, 'is-disabled': disabled },
        ]"
    >
        <span v-if="label && labelPosition === 'start'" class="ui-switch__label">{{ label }}</span>
        <input
            class="ui-switch__input"
            type="checkbox"
            role="switch"
            :checked="modelValue"
            :disabled="disabled"
            :aria-label="ariaLabel ?? label"
            @change="onChange"
        />
        <span class="ui-switch__track" aria-hidden="true">
            <span class="ui-switch__knob" />
        </span>
        <span v-if="label && labelPosition === 'end'" class="ui-switch__label">{{ label }}</span>
    </label>
</template>

<style scoped>
.ui-switch {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 24px;
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--fg);
    line-height: var(--leading-normal);
    user-select: none;
    vertical-align: middle;
}

.ui-switch--block {
    display: flex;
    width: 100%;
}

.ui-switch--block .ui-switch__label {
    flex: 1;
    min-width: 0;
}

.ui-switch.is-disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.ui-switch__input {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    border: 0;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    overflow: hidden;
    white-space: nowrap;
}

.ui-switch__track {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    width: 36px;
    height: 20px;
    padding: 0 2px;
    box-sizing: border-box;
    border-radius: var(--radius-sm);
    background: var(--surface-3, #2a2a2a);
    flex-shrink: 0;
    vertical-align: middle;
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.ui-switch__input:checked + .ui-switch__track {
    background: var(--accent);
}

.ui-switch__input:focus-visible + .ui-switch__track {
    /* box-shadow:
        inset 0 1px 2px rgba(0, 0, 0, 0.45),
        0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent); */
}

.ui-switch__knob {
    display: block;
    width: 16px;
    height: 16px;
    border-radius: var(--radius-sm);
    background: var(--accent);
    will-change: transform;
    transition:
        transform var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.ui-switch__input:checked + .ui-switch__track .ui-switch__knob {
    background: var(--accent-inverted, #f5f0e2);
    transform: translateX(16px);
}

.ui-switch__label {
    user-select: none;
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
}
</style>
