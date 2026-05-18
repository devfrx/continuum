<script setup lang="ts">
/**
 * LayoutPanel.vue — content of the "Layout" section in the view
 * settings popover.
 *
 * Two stacked regions:
 *
 *   1. **View-type grid** — 3-column card grid sourced from
 *      `VIEW_REGISTRY_LIST`. Clicking a card calls `change-type` which
 *      bubbles up to `useDatabaseBundle.patchView({ type })`. Planned
 *      types are pickable (they render via `PlaceholderView`) and are
 *      tagged "soon" so the user knows.
 *
 *   2. **Layout-specific knobs** — `<component :is>` dispatch into the
 *      per-type settings component from `layouts/registry.ts`. Each
 *      emits partial `patch-layout` patches that bubble up to
 *      `patchView({ config: { layout } })`.
 *
 * The panel itself owns no persistence — it's a thin coordinator that
 * keeps the renderer catalogue and the settings catalogue aligned.
 */
import { computed } from 'vue';
import { Icon } from '@/components/ui';
import type { DatabaseView, DatabaseViewType, PropertyDefinition } from '@continuum/shared';
import { VIEW_REGISTRY_LIST } from '../views/registry';
import { layoutSettingsFor } from './layouts/registry';

const props = defineProps<{
    view: DatabaseView;
    schema: readonly PropertyDefinition[];
}>();

const emit = defineEmits<{
    'change-type': [type: DatabaseViewType];
    'patch-layout': [patch: Record<string, unknown>];
}>();

const settingsComponent = computed(() => layoutSettingsFor(props.view.type));
</script>

<template>
    <div class="layout-panel">
        <ul class="layout-panel__grid" role="radiogroup" aria-label="View type">
            <li v-for="entry in VIEW_REGISTRY_LIST" :key="entry.type">
                <button
                    type="button"
                    role="radio"
                    :aria-checked="entry.type === view.type"
                    class="layout-panel__card"
                    :class="{
                        'is-active': entry.type === view.type,
                        'is-planned': entry.status === 'planned',
                    }"
                    :title="entry.description"
                    @click="emit('change-type', entry.type)">
                    <Icon :name="entry.icon" :size="18" />
                    <span class="layout-panel__card-label">{{ entry.label }}</span>
                    <span v-if="entry.status === 'planned'" class="layout-panel__card-tag">soon</span>
                </button>
            </li>
        </ul>

        <div class="layout-panel__divider" aria-hidden="true" />

        <component
            :is="settingsComponent"
            :view="view"
            :schema="schema"
            @patch-layout="(p: Record<string, unknown>) => emit('patch-layout', p)" />
    </div>
</template>

<style scoped>
.layout-panel {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
}

.layout-panel__grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.4rem;
}

.layout-panel__card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    width: 100%;
    padding: 0.6rem 0.4rem;
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.08));
    background: var(--bg-soft, rgba(255, 255, 255, 0.02));
    color: var(--fg, #ededed);
    border-radius: 6px;
    cursor: pointer;
    font: inherit;
    text-align: center;
    transition: background 120ms ease, border-color 120ms ease;
}

.layout-panel__card:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.05));
    border-color: var(--border-strong, rgba(255, 255, 255, 0.18));
}

.layout-panel__card.is-active {
    background: var(--accent-faint, rgba(232, 220, 200, 0.12));
    border-color: var(--accent, #e8dcc8);
    color: var(--accent, #e8dcc8);
}

.layout-panel__card.is-planned {
    color: var(--fg-muted, #a09b90);
}

.layout-panel__card-label {
    font-size: 0.72rem;
    line-height: 1.1;
}

.layout-panel__card-tag {
    position: absolute;
    top: 0.25rem;
    right: 0.3rem;
    font-size: 0.55rem;
    padding: 0.05rem 0.3rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.08);
    color: var(--fg-muted, #a09b90);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.layout-panel__divider {
    height: 1px;
    background: var(--border, rgba(255, 255, 255, 0.06));
    margin: 0.1rem 0;
}
</style>
