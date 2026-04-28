<script setup lang="ts">
interface Props {
    tone?: 'neutral' | 'accent';
    closable?: boolean;
}

withDefaults(defineProps<Props>(), {
    tone: 'neutral',
    closable: false,
});

const emit = defineEmits<{ close: [] }>();
</script>

<template>
    <span class="ui-chip" :class="`ui-chip--${tone}`">
        <span v-if="$slots.icon" class="ui-chip__icon">
            <slot name="icon" />
        </span>
        <span class="ui-chip__label">
            <slot />
        </span>
        <button v-if="closable" type="button" class="ui-chip__close" aria-label="Remove" @click="emit('close')">
            ×
        </button>
    </span>
</template>

<style scoped>
.ui-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    line-height: 1.4;
    border: var(--border-width-1) solid var(--border);
    background: var(--bg-soft);
    color: var(--fg-muted);
}

.ui-chip--accent {
    background: var(--accent-soft);
    color: var(--accent);
    border-color: transparent;
}

.ui-chip__icon {
    display: inline-flex;
    align-items: center;
}

.ui-chip__close {
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-size: var(--text-md);
    line-height: 1;
    padding: 0 var(--space-1);
    border-radius: var(--radius-xs);
    opacity: 0.7;
    transition: opacity var(--duration-fast) var(--ease-standard), background-color var(--duration-fast) var(--ease-standard);
}

.ui-chip__close:hover {
    opacity: 1;
    background: var(--bg-elev-2);
}
</style>
