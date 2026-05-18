<script setup lang="ts">
/**
 * FeedLayoutSettings.vue — knobs specific to the Feed renderer.
 *
 * Mirrors `FeedView.vue` consumption from `config.layout`:
 *   – `datePropertyId`  property used to sort the feed
 *   – `direction`       `'desc'` (newest first, default) | `'asc'`
 *
 * Surface stays compact: a property picker over the schema's
 * date / dateRange / createdTime / lastEditedTime properties plus a
 * direction toggle. Both knobs validate against the live schema so a
 * deleted property cleanly falls back to the auto-detected default
 * resolved by the renderer.
 */
import { computed } from 'vue';
import { UiSelect } from '@/components/ui';
import CommonDisplayToggles from './CommonDisplayToggles.vue';
import type { LayoutSettingsProps, LayoutSettingsEmits } from './types';

const props = defineProps<LayoutSettingsProps>();
const emit = defineEmits<LayoutSettingsEmits>();

const FEED_TYPES = ['date', 'dateRange', 'createdTime', 'lastEditedTime'] as const;

const feedable = computed(() =>
    props.schema.filter((p) => (FEED_TYPES as readonly string[]).includes(p.type)),
);

const datePropertyId = computed<string>(() => {
    const v = (props.view.config.layout as { datePropertyId?: unknown } | null | undefined)
        ?.datePropertyId;
    if (typeof v === 'string' && feedable.value.some((p) => p.id === v)) return v;
    return feedable.value[0]?.id ?? '';
});

const direction = computed<'asc' | 'desc'>(() => {
    const v = (props.view.config.layout as { direction?: unknown } | null | undefined)?.direction;
    return v === 'asc' ? 'asc' : 'desc';
});

const propertyOptions = computed(() =>
    feedable.value.map((p) => ({ value: p.id, label: p.label })),
);

const DIRECTION_OPTIONS = [
    { value: 'desc', label: 'Newest first' },
    { value: 'asc', label: 'Oldest first' },
];

function patch(p: Record<string, unknown>): void {
    emit('patch-layout', p);
}
</script>

<template>
    <div class="feed-layout">
        <div v-if="feedable.length === 0" class="feed-layout__hint">
            Add a <strong>date</strong>, <strong>created time</strong> or
            <strong>last edited time</strong> property to sort the feed.
        </div>
        <template v-else>
            <div class="feed-layout__row feed-layout__row--stack">
                <span class="feed-layout__label">Sort by</span>
                <UiSelect
                    :model-value="datePropertyId"
                    :options="propertyOptions"
                    aria-label="Sort property"
                    @update:model-value="(v) => patch({ datePropertyId: String(v) })" />
            </div>
            <div class="feed-layout__row feed-layout__row--stack">
                <span class="feed-layout__label">Direction</span>
                <UiSelect
                    :model-value="direction"
                    :options="DIRECTION_OPTIONS"
                    aria-label="Sort direction"
                    @update:model-value="(v) => patch({ direction: String(v) })" />
            </div>
        </template>
        <CommonDisplayToggles :view="view" @patch-layout="patch" />
    </div>
</template>

<style scoped>
.feed-layout {
    display: flex;
    flex-direction: column;
}

.feed-layout__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.1rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.05));
}

.feed-layout__row--stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
}

.feed-layout__label {
    font-size: 0.78rem;
    color: var(--fg, #ededed);
}

.feed-layout__hint {
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--bg-soft, rgba(255, 255, 255, 0.04));
    color: var(--fg-muted, #a09b90);
    font-size: 0.72rem;
    line-height: 1.4;
    margin-bottom: 0.4rem;
}
</style>
