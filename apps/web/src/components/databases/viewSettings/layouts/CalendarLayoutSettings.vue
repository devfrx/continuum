<script setup lang="ts">
/**
 * CalendarLayoutSettings.vue — knobs specific to the Calendar renderer.
 *
 * Mirrors `CalendarView.vue` consumption from `config.layout`:
 *   – `datePropertyId`  `date` / `dateRange` property used to schedule rows
 */
import { computed } from 'vue';
import { UiSelect } from '@/components/ui';
import CommonDisplayToggles from './CommonDisplayToggles.vue';
import type { LayoutSettingsProps, LayoutSettingsEmits } from './types';

const props = defineProps<LayoutSettingsProps>();
const emit = defineEmits<LayoutSettingsEmits>();

const dateable = computed(() =>
    props.schema.filter((p) => p.type === 'date' || p.type === 'dateRange'),
);

const datePropertyId = computed<string>(() => {
    const v = (props.view.config.layout as { datePropertyId?: unknown } | null | undefined)
        ?.datePropertyId;
    return typeof v === 'string' ? v : (dateable.value[0]?.id ?? '');
});

const options = computed(() =>
    dateable.value.map((p) => ({ value: p.id, label: p.label })),
);

function patch(p: Record<string, unknown>): void {
    emit('patch-layout', p);
}
</script>

<template>
    <div class="calendar-layout">
        <div v-if="dateable.length === 0" class="calendar-layout__hint">
            Add a <strong>date</strong> or <strong>date range</strong> property to schedule rows.
        </div>
        <div v-else class="calendar-layout__row calendar-layout__row--stack">
            <span class="calendar-layout__label">Schedule by</span>
            <UiSelect
                :model-value="datePropertyId"
                :options="options"
                aria-label="Date property"
                @update:model-value="(v: string) => patch({ datePropertyId: v })" />
        </div>
        <CommonDisplayToggles :view="view" @patch-layout="patch" />
    </div>
</template>

<style scoped>
.calendar-layout {
    display: flex;
    flex-direction: column;
}

.calendar-layout__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.1rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.05));
}

.calendar-layout__row--stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
}

.calendar-layout__label {
    font-size: 0.78rem;
    color: var(--fg, #ededed);
}

.calendar-layout__hint {
    padding: 0.5rem 0.6rem;
    border-radius: 4px;
    background: var(--bg-soft, rgba(255, 255, 255, 0.04));
    color: var(--fg-muted, #a09b90);
    font-size: 0.72rem;
    line-height: 1.4;
    margin-bottom: 0.4rem;
}
</style>
