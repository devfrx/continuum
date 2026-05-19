<script setup lang="ts">
/**
 * GalleryLayoutSettings.vue — knobs specific to the Gallery renderer.
 *
 * Mirrors `GalleryView.vue` consumption from `config.layout`:
 *   – `showNoteCover`    whether the note-level cover can fill card covers
 *   – `coverPropertyId`  `files` / `url` property used for the card cover
 *
 * The "None" option clears the cover so cards render as title-only
 * tiles — handled by emitting `null`.
 */
import { computed } from 'vue';
import { UiSelect, UiSwitch } from '@/components/ui';
import CommonDisplayToggles from './CommonDisplayToggles.vue';
import type { LayoutSettingsProps, LayoutSettingsEmits } from './types';

const props = defineProps<LayoutSettingsProps>();
const emit = defineEmits<LayoutSettingsEmits>();

const NONE = '__none__';

const coverable = computed(() =>
    props.schema.filter((p) => p.type === 'files' || p.type === 'url'),
);

const coverPropertyId = computed<string>(() => {
    const v = (props.view.config.layout as { coverPropertyId?: unknown } | null | undefined)
        ?.coverPropertyId;
    if (typeof v === 'string' && coverable.value.some((p) => p.id === v)) return v;
    if (v === null) return NONE;
    return coverable.value[0]?.id ?? NONE;
});

const showNoteCover = computed<boolean>(() => {
    const v = (props.view.config.layout as { showNoteCover?: unknown } | null | undefined)
        ?.showNoteCover;
    return v !== false;
});

const options = computed(() => [
    { value: NONE, label: 'No cover' },
    ...coverable.value.map((p) => ({ value: p.id, label: p.label })),
]);

function patch(p: Record<string, unknown>): void {
    emit('patch-layout', p);
}

function onCoverChange(value: string): void {
    patch({ coverPropertyId: value === NONE ? null : value });
}

function onShowNoteCoverChange(value: boolean): void {
    patch({ showNoteCover: value });
}
</script>

<template>
    <div class="gallery-layout">
        <div class="gallery-layout__row">
            <UiSwitch
                :model-value="showNoteCover"
                label="Show note cover"
                block
                @update:model-value="onShowNoteCoverChange" />
        </div>
        <div v-if="coverable.length === 0" class="gallery-layout__hint">
            Add a <strong>files</strong> or <strong>url</strong> property to display card covers.
        </div>
        <div v-else class="gallery-layout__row gallery-layout__row--stack">
            <span class="gallery-layout__label">Card cover</span>
            <UiSelect
                :model-value="coverPropertyId"
                :options="options"
                aria-label="Card cover property"
                @update:model-value="(v) => onCoverChange(String(v))" />
        </div>
        <CommonDisplayToggles :view="view" @patch-layout="patch" />
    </div>
</template>

<style scoped>
.gallery-layout {
    display: flex;
    flex-direction: column;
}

.gallery-layout__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.1rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.05));
}

.gallery-layout__row--stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
}

.gallery-layout__label {
    font-size: 0.78rem;
    color: var(--fg, #ededed);
}

.gallery-layout__hint {
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-sm);
    background: var(--bg-soft, rgba(255, 255, 255, 0.04));
    color: var(--fg-muted, #a09b90);
    font-size: 0.72rem;
    line-height: 1.4;
    margin-bottom: 0.4rem;
}
</style>
