<script setup lang="ts">
/**
 * TableLayoutSettings.vue — knobs specific to the Table renderer.
 *
 * Adds `showVerticalLines` on top of the shared common-display toggles.
 * Persisted under `view.config.layout.showVerticalLines` so the Table
 * renderer can pick it up via `readCommonDisplay()` + its own probe.
 */
import { computed } from 'vue';
import { UiSwitch } from '@/components/ui';
import CommonDisplayToggles from './CommonDisplayToggles.vue';
import type { LayoutSettingsProps, LayoutSettingsEmits } from './types';

const props = defineProps<LayoutSettingsProps>();
const emit = defineEmits<LayoutSettingsEmits>();

const showVerticalLines = computed<boolean>(() => {
    const v = (props.view.config.layout as { showVerticalLines?: boolean } | null | undefined)?.showVerticalLines;
    return v ?? true;
});

function patch(p: Record<string, unknown>): void {
    emit('patch-layout', p);
}
</script>

<template>
    <div class="table-layout">
        <label class="table-layout__row">
            <span class="table-layout__label">Show vertical lines</span>
            <UiSwitch
                :model-value="showVerticalLines"
                aria-label="Show vertical lines"
                @update:model-value="(v) => patch({ showVerticalLines: v })" />
        </label>
        <CommonDisplayToggles :view="view" @patch-layout="patch" />
    </div>
</template>

<style scoped>
.table-layout {
    display: flex;
    flex-direction: column;
}

.table-layout__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.1rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.05));
}

.table-layout__label {
    font-size: 0.78rem;
    color: var(--fg, #ededed);
}
</style>
