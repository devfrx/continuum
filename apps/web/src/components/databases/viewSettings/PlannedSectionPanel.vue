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
        <Icon name="settings" :size="20" />
        <p>{{ label }} — on the roadmap. For now you can configure it from the renderer directly.</p>
    </div>
</template>

<style scoped>
.planned {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    color: var(--fg-muted, #a09b90);
    padding: 1.5rem 0.7rem;
    gap: 0.4rem;
}

.planned p {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.4;
}
</style>
