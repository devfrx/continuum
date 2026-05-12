<script setup lang="ts">
/**
 * Top-left floating toolbar: New note CTA + reload + view-mode +
 * layout + zoom/fit/home + 3D axis snap + filters toggle + search.
 *
 * Pure presentation component: state lives in the parent shell;
 * actions emit out via typed events.
 */
import { computed } from 'vue';
import { Icon, UiInput } from '@/components/ui';
import type { LayoutMode, ViewMode } from '@/composables/graph/useGraphPreferences';
import type { GraphAxisView } from '@/composables/graph/useGraphSigma';

interface Props {
    loading: boolean;
    viewMode: ViewMode;
    layoutMode: LayoutMode;
    filtersOpen: boolean;
    searchQuery: string;
}
const props = defineProps<Props>();

const emit = defineEmits<{
    'create-note': [];
    reload: [];
    'set-view-mode': [mode: ViewMode];
    'set-layout': [mode: LayoutMode];
    zoom: [direction: 1 | -1];
    'fit-to-view': [];
    'home-view': [];
    'view-axis': [axis: GraphAxisView];
    'toggle-filters': [];
    'update:search-query': [value: string];
    'clear-search': [];
    'submit-search': [];
}>();

const search = computed<string>({
    get: () => props.searchQuery,
    set: (v) => emit('update:search-query', v),
});
</script>

<template>
    <div class="panel toolbar" @click.stop>
        <button class="tb-btn tb-btn--primary" title="New note (N)" aria-label="Create a new note"
            @click="emit('create-note')">
            <Icon name="plus" size="16" />
            <span class="tb-btn__label">New note</span>
        </button>
        <span class="tb-sep" />
        <button class="tb-btn" :disabled="loading" title="Reload" @click="emit('reload')">
            <Icon name="refresh" size="16" />
        </button>
        <span class="tb-sep" />
        <!-- View mode: 3D (neural-network) is the core base view. -->
        <button class="tb-btn" :class="{ active: viewMode === '3d' }" title="3D view — neural-network style"
            @click="emit('set-view-mode', '3d')">
            <Icon name="cube" size="16" />
        </button>
        <button class="tb-btn" :class="{ active: viewMode === '2d' }" title="2D view — classic Sigma layout"
            @click="emit('set-view-mode', '2d')">
            <Icon name="grid" size="16" />
        </button>
        <span v-if="viewMode === '2d'" class="tb-sep" />
        <button v-if="viewMode === '2d'" class="tb-btn" :class="{ active: layoutMode === 'force' }"
            title="Live physics — nodes float and self-organise" @click="emit('set-layout', 'force')">
            <Icon name="activity" size="16" />
        </button>
        <button v-if="viewMode === '2d'" class="tb-btn" :class="{ active: layoutMode === 'circular' }"
            title="Freeze layout — pin nodes on a static ring" @click="emit('set-layout', 'circular')">
            <Icon name="snowflake" size="16" />
        </button>
        <span class="tb-sep" />
        <button class="tb-btn" title="Zoom in (+)" @click="emit('zoom', 1)">
            <Icon name="zoom-in" size="16" />
        </button>
        <button class="tb-btn" title="Zoom out (−)" @click="emit('zoom', -1)">
            <Icon name="zoom-out" size="16" />
        </button>
        <button class="tb-btn" title="Fit to view (0)" @click="emit('fit-to-view')">
            <Icon name="fit-screen" size="16" />
        </button>
        <button class="tb-btn" title="Home orientation (H)" @click="emit('home-view')">
            <Icon name="home" size="16" />
        </button>
        <span v-if="viewMode === '3d'" class="tb-sep" />
        <button v-if="viewMode === '3d'" class="tb-btn tb-axis-btn" title="View from Y axis — top"
            @click="emit('view-axis', 'y')">
            <span>Y</span>
        </button>
        <button v-if="viewMode === '3d'" class="tb-btn tb-axis-btn" title="View from Z axis"
            @click="emit('view-axis', 'z')">
            <span>Z</span>
        </button>
        <button v-if="viewMode === '3d'" class="tb-btn tb-axis-btn" title="View from X axis"
            @click="emit('view-axis', 'x')">
            <span>X</span>
        </button>
        <span v-if="viewMode === '2d'" class="tb-sep" />
        <button v-if="viewMode === '2d'" class="tb-btn" :class="{ active: filtersOpen }"
            title="Filters, appearance & forces" aria-label="Open graph filters panel" @click="emit('toggle-filters')">
            <Icon name="filter" size="16" />
        </button>
        <span class="tb-sep" />
        <div class="tb-search">
            <UiInput v-model="search" size="sm" placeholder="Search nodes…" variant="bare"
                @keydown.enter.stop.prevent="emit('submit-search')" />
            <button v-if="search" class="tb-clear" @click="emit('clear-search')" aria-label="Clear search">
                <Icon name="close" :size="12" />
            </button>
        </div>
    </div>
</template>

<style scoped>
.panel {
    position: absolute;
    background: color-mix(in srgb, var(--surface-1) 94%, transparent);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    color: var(--fg);
    z-index: var(--z-raised);
    transition:
        opacity var(--duration-base) var(--ease-standard),
        transform var(--duration-base) var(--ease-standard),
        box-shadow var(--duration-base) var(--ease-standard);
}

.toolbar {
    top: var(--space-5);
    left: var(--space-5);
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2);
    max-width: calc(100% - 390px);
    flex-wrap: nowrap;
}

.tb-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.tb-btn:hover:not(:disabled) {
    background: var(--surface-hover);
    color: var(--fg);
    border-color: var(--border);
}

.tb-btn.active {
    background: var(--surface-selected);
    color: var(--fg-strong);
    border-color: var(--accent-border);
}

.tb-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

/*
 * Primary toolbar action — anchors the user's eye on the most-used CTA
 * (creating a note from the graph view). Uses the workspace accent so it
 * stays consistent with primary buttons elsewhere; the colour shifts on
 * hover but the shape stays identical to neighbouring icon buttons so
 * the toolbar reads as a unified rail.
 */
.tb-btn--primary {
    width: auto;
    padding: 0 var(--space-4);
    gap: var(--space-2);
    background: var(--accent);
    color: var(--fg-on-accent);
    border-color: var(--accent);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    letter-spacing: var(--tracking-tight);
    box-shadow: var(--shadow-sm);
}

.tb-btn--primary:hover:not(:disabled) {
    background: var(--accent-hover-color);
    color: var(--fg-on-accent);
    border-color: var(--accent-hover-color);
    box-shadow: var(--shadow-md);
}

.tb-btn--primary:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
}

.tb-btn__label {
    display: inline-flex;
    align-items: center;
    white-space: nowrap;
}

@media (max-width: 900px) {
    .tb-btn--primary .tb-btn__label {
        display: none;
    }

    .tb-btn--primary {
        width: 40px;
        padding: 0;
    }
}

.tb-axis-btn span {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    font-family: var(--font-mono);
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
}

.tb-sep {
    width: 1px;
    height: 18px;
    background: var(--border);
    margin: 0 var(--space-1);
}

.tb-search {
    display: flex;
    align-items: center;
    flex: 0 0 190px;
    min-width: 0;
    padding-left: var(--space-1);
    position: relative;
}

.tb-clear {
    position: absolute;
    right: var(--space-1);
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    font-size: var(--text-lg);
    line-height: 1;
    padding: var(--space-1) var(--space-3);
}

.tb-clear:hover {
    color: var(--fg);
}

@media (max-width: 1100px) {
    .toolbar {
        max-width: calc(100% - 2 * var(--space-5));
        flex-wrap: wrap;
    }
}

@media (max-width: 720px) {
    .toolbar {
        left: var(--space-3);
        right: var(--space-3);
        top: var(--space-3);
    }
}
</style>
