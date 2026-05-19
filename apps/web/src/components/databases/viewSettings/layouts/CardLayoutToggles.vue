<script setup lang="ts">
/**
 * CardLayoutToggles.vue — card-shaped layout knobs shared by Board and
 * Gallery views.
 *
 * Renders the rows visible in the Layout panel for card layouts:
 *   – Card preview        (none / page cover / properties / page content)
 *   – Card size           (small / medium / large)
 *   – Fit media           (only meaningful when the preview surfaces an image)
 *   – Card layout         (compact grid vs. stacked list)
 *
 * Stateless — reads the active view, emits partial `patch-layout`
 * patches. Each renderer (`BoardView`, `GalleryView`) consumes the
 * persisted values via `readCardDisplay(layout)` so the contract stays
 * centralised.
 *
 * Props:
 *   – `view`           the active view (source of truth)
 *   – `hideFitMedia`   suppress the "Fit media" row when the renderer
 *                      doesn't paint a media surface (Board today).
 */
import { computed } from 'vue';
import { Icon, UiSelect, UiSwitch } from '@/components/ui';
import type { AppIconName } from '@/assets/icons';
import type { DatabaseView } from '@continuum/shared';
import { readCardDisplay, type CardLayout, type CardPreviewMode, type CardSize } from './types';

const props = withDefaults(defineProps<{
    view: DatabaseView;
    hideFitMedia?: boolean;
}>(), { hideFitMedia: false });

const emit = defineEmits<{
    'patch-layout': [patch: Record<string, unknown>];
}>();

const current = computed(() => readCardDisplay(props.view.config.layout));

const PREVIEW_OPTIONS: Array<{ value: CardPreviewMode; label: string }> = [
    { value: 'none', label: 'None' },
    { value: 'pageCover', label: 'Page cover' },
    { value: 'properties', label: 'Page properties' },
    { value: 'pageContent', label: 'Page content' },
];

const SIZE_OPTIONS: Array<{ value: CardSize; label: string }> = [
    { value: 'small', label: 'Small' },
    { value: 'medium', label: 'Medium' },
    { value: 'large', label: 'Large' },
];

const LAYOUT_MODES: ReadonlyArray<{ value: CardLayout; label: string; icon: AppIconName }> = [
    { value: 'compact', label: 'Compact', icon: 'layout' },
    { value: 'list', label: 'List', icon: 'view-list' },
];

function patch(key: keyof ReturnType<typeof readCardDisplay>, value: unknown): void {
    emit('patch-layout', { [key]: value });
}
</script>

<template>
    <div class="card-toggles">
        <div class="card-toggles__row card-toggles__row--stack">
            <span class="card-toggles__label">Card preview</span>
            <UiSelect
                :model-value="current.cardPreview"
                :options="PREVIEW_OPTIONS"
                aria-label="Card preview"
                @update:model-value="(v) => patch('cardPreview', String(v))" />
        </div>

        <div class="card-toggles__row card-toggles__row--stack">
            <span class="card-toggles__label">Card size</span>
            <UiSelect
                :model-value="current.cardSize"
                :options="SIZE_OPTIONS"
                aria-label="Card size"
                @update:model-value="(v) => patch('cardSize', String(v))" />
        </div>

        <label v-if="!hideFitMedia" class="card-toggles__row">
            <span class="card-toggles__label">Fit media</span>
            <UiSwitch
                :model-value="current.fitMedia"
                aria-label="Fit media into card preview"
                @update:model-value="(v) => patch('fitMedia', v)" />
        </label>

        <div class="card-toggles__row card-toggles__row--stack">
            <span class="card-toggles__label">Card layout</span>
            <div class="card-toggles__segmented" role="radiogroup" aria-label="Card layout">
                <button
                    v-for="mode in LAYOUT_MODES"
                    :key="mode.value"
                    type="button"
                    role="radio"
                    :aria-checked="current.cardLayout === mode.value"
                    class="card-toggles__seg-btn"
                    :class="{ 'is-active': current.cardLayout === mode.value }"
                    @click="patch('cardLayout', mode.value)">
                    <Icon :name="mode.icon" :size="12" />
                    <span>{{ mode.label }}</span>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.card-toggles {
    display: flex;
    flex-direction: column;
}

.card-toggles__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.1rem;
    border-top: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.05));
}

.card-toggles__row:first-child {
    border-top: none;
}

.card-toggles__row--stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.35rem;
}

.card-toggles__label {
    font-size: 0.78rem;
    color: var(--fg, #ededed);
}

.card-toggles__segmented {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.25rem;
    padding: 0.2rem;
    background: var(--bg-soft, rgba(255, 255, 255, 0.04));
    border-radius: var(--radius-sm);
}

.card-toggles__seg-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    padding: 0.3rem 0.4rem;
    border: none;
    background: transparent;
    color: var(--fg-muted, #a09b90);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: 0.72rem;
}

.card-toggles__seg-btn:hover {
    color: var(--fg, #ededed);
}

.card-toggles__seg-btn.is-active {
    background: var(--surface-hover, rgba(255, 255, 255, 0.08));
    color: var(--accent, #e8dcc8);
}
</style>
