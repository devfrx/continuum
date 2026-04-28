<script setup lang="ts">
import { computed } from 'vue';

interface Props {
    variant?: 'primary' | 'ghost' | 'subtle' | 'danger';
    size?: 'sm' | 'md';
    disabled?: boolean;
    loading?: boolean;
    as?: 'button' | 'a';
}

const props = withDefaults(defineProps<Props>(), {
    variant: 'subtle',
    size: 'md',
    disabled: false,
    loading: false,
    as: 'button',
});

const classes = computed(() => [
    'ui-btn',
    `ui-btn--${props.variant}`,
    `ui-btn--${props.size}`,
    { 'is-loading': props.loading },
]);

const isDisabled = computed(() => props.disabled || props.loading);
</script>

<template>
    <component :is="as" :class="classes" :disabled="as === 'button' ? isDisabled : undefined"
        :aria-disabled="isDisabled || undefined">
        <span v-if="$slots['icon-left']" class="ui-btn__icon">
            <slot name="icon-left" />
        </span>
        <span v-if="loading" class="ui-btn__spinner" aria-hidden="true" />
        <span class="ui-btn__label">
            <slot />
        </span>
    </component>
</template>

<style scoped>
.ui-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-3);
    border-radius: var(--radius-sm);
    border: var(--border-width-1) solid transparent;
    font-family: inherit;
    font-weight: var(--font-weight-medium);
    line-height: 1;
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        box-shadow var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard);
    text-decoration: none;
    user-select: none;
    white-space: nowrap;
}

.ui-btn--md {
    padding: var(--space-4) var(--space-7);
    font-size: var(--text-base);
}

.ui-btn--sm {
    padding: var(--space-2) var(--space-5);
    font-size: var(--text-sm);
}

.ui-btn--primary {
    background: var(--accent);
    color: var(--fg-on-accent);
    border-color: var(--accent);
}

.ui-btn--primary:hover:not(:disabled) {
    background: var(--accent-hover-color);
    border-color: var(--accent-hover-color);
}

.ui-btn--primary:active:not(:disabled) {
    background: var(--accent-active-color);
    border-color: var(--accent-active-color);
}

.ui-btn--subtle {
    background: var(--bg-soft);
    color: var(--fg);
    border-color: var(--border);
}

.ui-btn--subtle:hover:not(:disabled) {
    background: var(--bg-elev);
    border-color: var(--border-strong);
}

.ui-btn--ghost {
    background: transparent;
    color: var(--fg-muted);
    border-color: transparent;
}

.ui-btn--ghost:hover:not(:disabled) {
    background: var(--accent-soft);
    color: var(--accent);
}

.ui-btn--danger {
    background: var(--danger);
    color: #fff;
    border-color: var(--danger);
}

.ui-btn--danger:hover:not(:disabled) {
    filter: brightness(1.05);
}

.ui-btn:disabled,
.ui-btn[aria-disabled='true'] {
    opacity: 0.5;
    cursor: not-allowed;
}

.ui-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
}

.ui-btn__icon {
    display: inline-flex;
    align-items: center;
}

.ui-btn__spinner {
    width: 12px;
    height: 12px;
    border-radius: var(--radius-circle);
    border: 2px solid currentColor;
    border-right-color: transparent;
    animation: ui-btn-spin 0.7s linear infinite;
}

@keyframes ui-btn-spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
