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

function forwardPatch(patch: Record<string, unknown>): void {
    emit('patch-layout', patch);
}
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
            @patch-layout="forwardPatch" />
    </div>
</template>

<style scoped>
.layout-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.layout-panel__grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
}

.layout-panel__card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3) var(--space-2);
    border: var(--border-width-1) solid var(--border);
    background: var(--surface-1);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font: inherit;
    text-align: center;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.layout-panel__card:hover {
    background: var(--surface-hover);
    border-color: var(--border-strong);
}

.layout-panel__card.is-active {
    background: var(--accent-faint);
    border-color: var(--accent);
    color: var(--accent);
}

.layout-panel__card.is-planned {
    color: var(--text-muted);
}

.layout-panel__card-label {
    font-size: var(--text-xs);
    font-weight: var(--font-weight-medium);
    line-height: var(--leading-tight);
}

.layout-panel__card-tag {
    position: absolute;
    top: var(--space-1);
    right: var(--space-1);
    font-size: var(--text-2xs);
    padding: 1px var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: var(--font-weight-semibold);
}

.layout-panel__divider {
    height: 1px;
    background: var(--border);
}
</style>
