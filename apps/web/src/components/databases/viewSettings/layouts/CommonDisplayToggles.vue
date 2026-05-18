<script setup lang="ts">
/**
 * CommonDisplayToggles.vue — reusable display knobs shared across layouts.
 *
 * Renders the rows visible in the Layout panel under the view-type grid:
 * show page icon, wrap content and the "Open pages in" segmented control.
 *
 * Stateless — reads the current layout, emits partial patches. Each
 * layout component composes this plus its own type-specific knobs.
 *
 * Props:
 *   – `view`            the active view (source of truth)
 * Emits:
 *   – `patch-layout`    partial patch merged into `config.layout`
 */
import { computed } from 'vue';
import { Icon, UiSwitch } from '@/components/ui';
import type { AppIconName } from '@/assets/icons';
import type { DatabaseView } from '@continuum/shared';
import { readCommonDisplay, type OpenInMode } from './types';

const props = defineProps<{ view: DatabaseView }>();

const emit = defineEmits<{
    'patch-layout': [patch: Record<string, unknown>];
}>();

const current = computed(() => readCommonDisplay(props.view.config.layout));

const OPEN_IN_MODES: ReadonlyArray<{ value: OpenInMode; label: string; icon: AppIconName }> = [
    { value: 'sidePeek', label: 'Side peek', icon: 'sidebar' },
    { value: 'centerPeek', label: 'Center peek', icon: 'layout' },
    { value: 'fullPage', label: 'Full page', icon: 'maximize' },
];

function patch(key: keyof ReturnType<typeof readCommonDisplay>, value: unknown): void {
    emit('patch-layout', { [key]: value });
}
</script>

<template>
    <div class="common-display">
        <label class="common-display__row">
            <span class="common-display__label">Show page icon</span>
            <UiSwitch
                :model-value="current.showPageIcon"
                aria-label="Show page icon"
                @update:model-value="(v) => patch('showPageIcon', v)" />
        </label>

        <label class="common-display__row">
            <span class="common-display__label">Wrap all content</span>
            <UiSwitch
                :model-value="current.wrapContent"
                aria-label="Wrap all content"
                @update:model-value="(v) => patch('wrapContent', v)" />
        </label>

        <div class="common-display__row common-display__row--stack">
            <span class="common-display__label">Open pages in</span>
            <div class="common-display__segmented" role="radiogroup" aria-label="Open pages in">
                <button
                    v-for="mode in OPEN_IN_MODES"
                    :key="mode.value"
                    type="button"
                    role="radio"
                    :aria-checked="current.openIn === mode.value"
                    class="common-display__seg-btn"
                    :class="{ 'is-active': current.openIn === mode.value }"
                    @click="patch('openIn', mode.value)">
                    <Icon :name="mode.icon" :size="12" />
                    <span>{{ mode.label }}</span>
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.common-display {
    display: flex;
    flex-direction: column;
}

.common-display__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.45rem 0.1rem;
    border-top: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.05));
}

.common-display__row:first-child {
    border-top: none;
}

.common-display__row--stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.4rem;
}

.common-display__label {
    font-size: 0.78rem;
    color: var(--fg, #ededed);
}

.common-display__segmented {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.25rem;
    padding: 0.2rem;
    background: var(--bg-soft, rgba(255, 255, 255, 0.04));
    border-radius: var(--radius-sm);
}

.common-display__seg-btn {
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

.common-display__seg-btn:hover {
    color: var(--fg, #ededed);
}

.common-display__seg-btn.is-active {
    background: var(--surface-hover, rgba(255, 255, 255, 0.08));
    color: var(--accent, #e8dcc8);
}
</style>
