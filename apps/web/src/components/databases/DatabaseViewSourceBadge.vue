<script setup lang="ts">
/**
 * Compact datasource label used by block-view tabs.
 *
 * A database block can host multiple views and each view can point at a
 * different datasource. This badge keeps that source visible without
 * making the toolbar own datasource loading or mutation concerns.
 */
import { Icon } from '@/components/ui';

defineProps<{
    label: string;
}>();
</script>

<template>
    <span class="db-source-badge" :title="label">
        <Icon name="database" :size="10" />
        <span class="db-source-badge__label">{{ label }}</span>
    </span>
</template>

<style scoped>
.db-source-badge {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 7rem;
    min-width: 0;
    min-height: 18px;
    padding: 0 var(--space-1);
    border: var(--border-width-1) solid color-mix(in srgb, var(--border) 72%, transparent);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--surface-2) 72%, transparent);
    color: var(--text-secondary);
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-semibold);
    line-height: var(--leading-tight);
    letter-spacing: 0;
}

.db-source-badge__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>