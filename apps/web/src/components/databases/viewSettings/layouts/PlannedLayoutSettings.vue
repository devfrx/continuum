<script setup lang="ts">
/**
 * PlannedLayoutSettings.vue — fallback for `status: 'planned'` view types.
 *
 * The planned view types (`timeline`, `chart`, `dashboard`, `feed`,
 * `map`, `form`) currently render through `PlaceholderView`, so their
 * settings panel is just an advisory message + the shared common
 * toggles (which still persist so the values are ready when the real
 * renderer ships).
 */
import { Icon } from '@/components/ui';
import CommonDisplayToggles from './CommonDisplayToggles.vue';
import type { LayoutSettingsProps, LayoutSettingsEmits } from './types';

defineProps<LayoutSettingsProps>();
const emit = defineEmits<LayoutSettingsEmits>();

function patch(p: Record<string, unknown>): void {
    emit('patch-layout', p);
}
</script>

<template>
    <div class="planned-layout">
        <div class="planned-layout__notice">
            <Icon name="settings" :size="14" />
            <span>This view type is on the roadmap — common display options still apply.</span>
        </div>
        <CommonDisplayToggles :view="view" @patch-layout="patch" />
    </div>
</template>

<style scoped>
.planned-layout {
    display: flex;
    flex-direction: column;
}

.planned-layout__notice {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.5rem 0.6rem;
    border-radius: 4px;
    background: var(--bg-soft, rgba(255, 255, 255, 0.04));
    color: var(--fg-muted, #a09b90);
    font-size: 0.72rem;
    line-height: 1.4;
    margin-bottom: 0.4rem;
}
</style>
