<script setup lang="ts">
/**
 * TimelineLayoutSettings.vue — knobs specific to the Timeline renderer.
 *
 * Mirrors `TimelineView.vue` consumption from `config.layout`:
 *   – `datePropertyId`  date / date-range / system-timestamp property
 *
 * The renderer auto-detects the first eligible property when no
 * explicit id is set, so this surface only validates and persists the
 * user's choice.
 */
import { computed } from 'vue';
import { UiSelect } from '@/components/ui';
import CommonDisplayToggles from './CommonDisplayToggles.vue';
import type { LayoutSettingsProps, LayoutSettingsEmits } from './types';

const props = defineProps<LayoutSettingsProps>();
const emit = defineEmits<LayoutSettingsEmits>();

const TIMELINE_TYPES = ['date', 'dateRange', 'createdTime', 'lastEditedTime'] as const;

const dateable = computed(() =>
    props.schema.filter((p) => (TIMELINE_TYPES as readonly string[]).includes(p.type)),
);

const datePropertyId = computed<string>(() => {
    const v = (props.view.config.layout as { datePropertyId?: unknown } | null | undefined)
        ?.datePropertyId;
    if (typeof v === 'string' && dateable.value.some((p) => p.id === v)) return v;
    return dateable.value[0]?.id ?? '';
});

const options = computed(() =>
    dateable.value.map((p) => ({ value: p.id, label: p.label })),
);

function patch(p: Record<string, unknown>): void {
    emit('patch-layout', p);
}
</script>

<template>
    <div class="timeline-layout">
        <div v-if="dateable.length === 0" class="timeline-layout__hint">
            Add a <strong>date</strong> or <strong>date range</strong> property to plot rows along
            the timeline.
        </div>
        <div v-else class="timeline-layout__row timeline-layout__row--stack">
            <span class="timeline-layout__label">Schedule by</span>
            <UiSelect
                :model-value="datePropertyId"
                :options="options"
                aria-label="Date property"
                @update:model-value="(v) => patch({ datePropertyId: String(v) })" />
        </div>
        <CommonDisplayToggles :view="view" @patch-layout="patch" />
    </div>
</template>

<style scoped>
.timeline-layout {
    display: flex;
    flex-direction: column;
}

.timeline-layout__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.1rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.05));
}

.timeline-layout__row--stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
}

.timeline-layout__label {
    font-size: 0.78rem;
    color: var(--fg, #ededed);
}

.timeline-layout__hint {
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--bg-soft, rgba(255, 255, 255, 0.04));
    color: var(--fg-muted, #a09b90);
    font-size: 0.72rem;
    line-height: 1.4;
    margin-bottom: 0.4rem;
}
</style>
