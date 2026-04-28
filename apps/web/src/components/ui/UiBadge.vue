<script setup lang="ts">
import { computed } from 'vue';

interface Props {
    tone?: 'neutral' | 'accent' | 'success' | 'danger';
    size?: 'sm' | 'md';
    dot?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    tone: 'neutral',
    size: 'md',
    dot: false,
});

const classes = computed(() => ['ui-badge', `ui-badge--${props.tone}`, `ui-badge--${props.size}`]);
</script>

<template>
    <span :class="classes">
        <span v-if="dot" class="ui-badge__dot" aria-hidden="true" />
        <slot />
    </span>
</template>

<style scoped>
.ui-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    border-radius: var(--radius-sm);
    font-weight: var(--font-weight-medium);
    line-height: 1;
    border: var(--border-width-1) solid transparent;
    white-space: nowrap;
}

.ui-badge--md {
    padding: var(--space-2) var(--space-5);
    font-size: var(--text-sm);
}

.ui-badge--sm {
    padding: var(--space-1) var(--space-4);
    font-size: var(--text-xs);
}

.ui-badge--neutral {
    background: var(--bg-soft);
    color: var(--fg-muted);
    border-color: var(--border);
}

.ui-badge--accent {
    background: var(--accent-soft);
    color: var(--accent);
}

.ui-badge--success {
    background: var(--success-soft);
    color: var(--success);
}

.ui-badge--danger {
    background: var(--danger-soft);
    color: var(--danger);
}

.ui-badge__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
}
</style>
