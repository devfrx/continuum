<script setup lang="ts">
/**
 * PlannedSectionPanel.vue — generic placeholder for not-yet-implemented sections.
 *
 * Used by sections like Properties, Filter, Sort, Group, Conditional
 * color, Automations until each gets a dedicated panel. Keeps the
 * structural target visible to the user so the navigation already
 * mirrors the eventual final shape.
 */
import { Icon } from '@/components/ui';

defineProps<{ label: string }>();
</script>

<template>
    <div class="planned">
        <span class="planned__icon">
            <Icon name="settings" :size="22" />
        </span>
        <h4 class="planned__title">{{ label }}</h4>
        <p class="planned__lead">On the roadmap. For now you can configure this from the renderer directly.</p>
    </div>
</template>

<style scoped>
.planned {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    color: var(--text-muted);
    padding: var(--space-6) var(--space-3);
    gap: var(--space-2);
}

.planned__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    color: var(--text-secondary);
    margin-bottom: var(--space-1);
}

.planned__title {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-base);
    font-weight: var(--font-weight-semibold);
}

.planned__lead {
    margin: 0;
    font-size: var(--text-xs);
    line-height: var(--leading-snug, 1.4);
    max-width: 30ch;
}
</style>
