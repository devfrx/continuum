<script setup lang="ts">
/**
 * BoardLayoutSettings.vue — knobs specific to the Board renderer.
 *
 * Mirrors what `BoardView.vue` consumes from `config.layout`:
 *   – `groupByPropertyId`   `select`/`status` property used for columns
 *
 * Falls back to a "no group-by available" hint when the schema exposes
 * no `select`/`status` properties — same UX the renderer surfaces
 * inside the canvas.
 */
import { computed } from 'vue';
import { UiSelect } from '@/components/ui';
import CommonDisplayToggles from './CommonDisplayToggles.vue';
import type { LayoutSettingsProps, LayoutSettingsEmits } from './types';

const props = defineProps<LayoutSettingsProps>();
const emit = defineEmits<LayoutSettingsEmits>();

const groupable = computed(() =>
    props.schema.filter((p) => p.type === 'select' || p.type === 'status'),
);

const groupByPropertyId = computed<string>(() => {
    const v = (props.view.config.layout as { groupByPropertyId?: unknown } | null | undefined)
        ?.groupByPropertyId;
    return typeof v === 'string' ? v : (groupable.value[0]?.id ?? '');
});

const options = computed(() =>
    groupable.value.map((p) => ({ value: p.id, label: p.label })),
);

function patch(p: Record<string, unknown>): void {
    emit('patch-layout', p);
}

function onGroupByChange(value: string): void {
    patch({ groupByPropertyId: value });
}
</script>

<template>
    <div class="board-layout">
        <div v-if="groupable.length === 0" class="board-layout__hint">
            Add a <strong>select</strong> or <strong>status</strong> property to group rows into columns.
        </div>
        <div v-else class="board-layout__row board-layout__row--stack">
            <span class="board-layout__label">Group by</span>
            <UiSelect
                :model-value="groupByPropertyId"
                :options="options"
                aria-label="Group rows by property"
                @update:model-value="(v: string) => onGroupByChange(v)" />
        </div>
        <CommonDisplayToggles :view="view" @patch-layout="patch" />
    </div>
</template>

<style scoped>
.board-layout {
    display: flex;
    flex-direction: column;
}

.board-layout__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.1rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.05));
}

.board-layout__row--stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
}

.board-layout__label {
    font-size: 0.78rem;
    color: var(--fg, #ededed);
}

.board-layout__hint {
    padding: 0.5rem 0.6rem;
    border-radius: 4px;
    background: var(--bg-soft, rgba(255, 255, 255, 0.04));
    color: var(--fg-muted, #a09b90);
    font-size: 0.72rem;
    line-height: 1.4;
    margin-bottom: 0.4rem;
}
</style>
