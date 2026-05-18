<script setup lang="ts">
/**
 * DatabaseViewSettings.vue — Notion-style per-view settings popover (shell).
 *
 * Owns ONLY the popover-level concerns:
 *
 *   – Teleport into <body> so the popover escapes any ancestor with
 *     `overflow: hidden` (the database block clips its content).
 *   – Viewport-aware positioning (flips above when no room below,
 *     clamps to the viewport horizontally).
 *   – Outside-click / Escape close. Listener registration is deferred
 *     by one tick so the very click that opened the popover doesn't
 *     bubble back up and close it instantly.
 *   – Section navigation via a drill-in pattern: the root view shows a
 *     flat list of sections; clicking one swaps the body to a typed
 *     panel component with a back-arrow header. Mirrors Notion's
 *     "View options" drawer and avoids a sidebar that doesn't scale.
 *
 * All business logic lives in the section panels under
 * `./viewSettings/`. Each panel emits a typed intent that this shell
 * forwards to `DatabaseToolbar`, which lifts it to
 * `DatabaseBody → useDatabaseBundle.patchView`.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Icon } from '@/components/ui';
import type {
    DatabaseView,
    DatabaseViewType,
    PropertyDefinition,
} from '@continuum/shared';
import { SECTIONS, sectionById, type SectionId } from './viewSettings/sections';
import { viewEntryFor } from './views/registry';
import LayoutPanel from './viewSettings/LayoutPanel.vue';
import DataSourcePanel from './viewSettings/DataSourcePanel.vue';
import PlannedSectionPanel from './viewSettings/PlannedSectionPanel.vue';

const props = defineProps<{
    modelValue: boolean;
    view: DatabaseView;
    /**
     * Schema of the effective database backing this view. Layout
     * pickers (group-by, cover, date) probe this to populate options.
     */
    schema: readonly PropertyDefinition[];
    /** Database id this view currently resolves against (parent or override). */
    effectiveDatabaseId: string;
    /** Parent block's database id — used as the fallback target. */
    parentDatabaseId: string;
    /**
     * Viewport-coords rect of the trigger element (the gear button).
     * Passing a rect lets the popover render via `<Teleport>` into
     * `<body>` so it escapes any clipping ancestor.
     */
    anchorRect?: { top: number; left: number; bottom: number; right: number } | null;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    /** Per-view datasource override change (or clear when `null`). */
    'change-source': [databaseId: string | null];
    /** Swap the view's renderer type. */
    'change-type': [type: DatabaseViewType];
    /** Partial patch merged into `view.config.layout`. */
    'patch-layout': [patch: Record<string, unknown>];
}>();

// ── Drill-in navigation ──────────────────────────────────────────────
// `null` = root menu (list of sections); a section id = drilled into
// that section's panel with a back-arrow header.
const drilledSection = ref<SectionId | null>(null);

function openSection(id: SectionId): void {
    drilledSection.value = id;
}

function backToRoot(): void {
    drilledSection.value = null;
}

const currentSection = computed(() =>
    drilledSection.value ? sectionById(drilledSection.value) : null,
);

// ── Section preview value (shown next to the row in root menu) ───────
// Mirrors Notion's habit of showing the current value on each row so
// the user knows the state without having to drill in.
const layoutPreview = computed(() => viewEntryFor(props.view.type).label);
const dataSourcePreview = computed(() =>
    props.view.dataSourceDatabaseId
        && props.view.dataSourceDatabaseId !== props.parentDatabaseId
        ? 'Custom'
        : 'Block default',
);

function previewFor(id: SectionId): string | null {
    if (id === 'layout') return layoutPreview.value;
    if (id === 'dataSource') return dataSourcePreview.value;
    return null;
}

// ── Positioning (teleported, viewport-clamped) ───────────────────────
const POPOVER_WIDTH = 360;
const POPOVER_MAX_HEIGHT = 480;
const popoverStyle = computed<Record<string, string>>(() => {
    const rect = props.anchorRect;
    if (!rect || typeof window === 'undefined') {
        return {
            top: '0px',
            left: '0px',
            width: `${POPOVER_WIDTH}px`,
            maxHeight: `${POPOVER_MAX_HEIGHT}px`,
        };
    }
    const margin = 6;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let left = rect.left;
    if (left + POPOVER_WIDTH > viewportW - margin) {
        left = Math.max(margin, viewportW - POPOVER_WIDTH - margin);
    }
    let top = rect.bottom + margin;
    if (top + POPOVER_MAX_HEIGHT > viewportH - margin) {
        top = Math.max(margin, rect.top - POPOVER_MAX_HEIGHT - margin);
    }
    return {
        top: `${top}px`,
        left: `${left}px`,
        width: `${POPOVER_WIDTH}px`,
        maxHeight: `${POPOVER_MAX_HEIGHT}px`,
    };
});

// ── Outside-click + Escape close ─────────────────────────────────────
const rootRef = ref<HTMLDivElement | null>(null);

function onDocPointer(event: PointerEvent): void {
    if (!props.modelValue) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (rootRef.value && rootRef.value.contains(target)) return;
    // UiSelect (and other UI primitives) teleport their popups to <body>
    // outside our rootRef — closing on every <body> click would dismiss
    // the popover whenever the user opens a nested dropdown. Detect
    // ".ui-select__panel" (and similar teleported portals) and ignore.
    if (target.closest('.ui-select__panel')) return;
    emit('update:modelValue', false);
}

function onKey(event: KeyboardEvent): void {
    if (!props.modelValue) return;
    if (event.key === 'Escape') {
        if (drilledSection.value) {
            backToRoot();
        } else {
            emit('update:modelValue', false);
        }
    }
}

onMounted(() => {
    void nextTick(() => {
        document.addEventListener('pointerdown', onDocPointer, true);
    });
    document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointer, true);
    document.removeEventListener('keydown', onKey);
});

function close(): void {
    drilledSection.value = null;
    emit('update:modelValue', false);
}
</script>

<template>
    <Teleport to="body">
        <div
            v-if="modelValue"
            ref="rootRef"
            class="view-settings"
            role="dialog"
            aria-label="View settings"
            :style="popoverStyle"
            @pointerdown.stop
            @contextmenu.stop.prevent>
            <!-- Header: differs between root menu and drilled-in section. -->
            <header class="view-settings__head">
                <button
                    v-if="currentSection"
                    type="button"
                    class="view-settings__icon-btn"
                    title="Back"
                    aria-label="Back"
                    @click="backToRoot">
                    <Icon name="arrow-left" :size="12" />
                </button>
                <span v-else class="view-settings__icon-btn view-settings__icon-btn--placeholder" aria-hidden="true" />
                <strong class="view-settings__title">
                    {{ currentSection ? currentSection.label : 'View options' }}
                </strong>
                <button
                    type="button"
                    class="view-settings__icon-btn"
                    title="Close"
                    aria-label="Close"
                    @click="close">
                    <Icon name="close" :size="12" />
                </button>
            </header>

            <!-- Root menu: flat list of sections. -->
            <ul v-if="!currentSection" class="view-settings__menu">
                <li v-for="section in SECTIONS" :key="section.id">
                    <button
                        type="button"
                        class="view-settings__menu-item"
                        :class="{ 'is-planned': section.status === 'planned' }"
                        @click="openSection(section.id)">
                        <Icon :name="section.icon" :size="13" />
                        <span class="view-settings__menu-label">{{ section.label }}</span>
                        <span v-if="previewFor(section.id)" class="view-settings__menu-preview">
                            {{ previewFor(section.id) }}
                        </span>
                        <span v-else-if="section.status === 'planned'" class="view-settings__menu-tag">soon</span>
                        <Icon name="chevron-right" :size="11" class="view-settings__menu-caret" />
                    </button>
                </li>
            </ul>

            <!-- Drilled-in section body. -->
            <div v-else class="view-settings__body">
                <LayoutPanel
                    v-if="currentSection.id === 'layout'"
                    :view="view"
                    :schema="schema"
                    @change-type="(t) => emit('change-type', t)"
                    @patch-layout="(p) => emit('patch-layout', p)" />
                <DataSourcePanel
                    v-else-if="currentSection.id === 'dataSource'"
                    :view="view"
                    :effective-database-id="effectiveDatabaseId"
                    :parent-database-id="parentDatabaseId"
                    @change-source="(id) => emit('change-source', id)" />
                <PlannedSectionPanel v-else :label="currentSection.label" />
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
.view-settings {
    position: fixed;
    z-index: 1000;
    display: flex;
    flex-direction: column;
    background: var(--bg-elev, #232323);
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55);
    overflow: hidden;
    font-size: 0.8rem;
}

.view-settings__head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.45rem 0.6rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
}

.view-settings__title {
    flex: 1;
    min-width: 0;
    text-align: center;
    font-size: 0.78rem;
    color: var(--fg, #ededed);
}

.view-settings__icon-btn {
    border: none;
    background: transparent;
    color: var(--fg-muted, #a09b90);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    flex: 0 0 22px;
}

.view-settings__icon-btn:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.06));
    color: var(--fg, #ededed);
}

.view-settings__icon-btn--placeholder {
    cursor: default;
    pointer-events: none;
}

.view-settings__icon-btn--placeholder:hover {
    background: transparent;
}

.view-settings__menu {
    list-style: none;
    margin: 0;
    padding: 0.3rem 0.3rem 0.4rem;
    display: flex;
    flex-direction: column;
    overflow: auto;
    max-height: calc(60vh - 32px);
}

.view-settings__menu-item {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    width: 100%;
    padding: 0.4rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--fg, #ededed);
    cursor: pointer;
    text-align: left;
    font: inherit;
    border-radius: 4px;
}

.view-settings__menu-item:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.04));
}

.view-settings__menu-item.is-planned {
    color: var(--fg-muted, #a09b90);
}

.view-settings__menu-label {
    flex: 1;
    min-width: 0;
}

.view-settings__menu-preview {
    font-size: 0.7rem;
    color: var(--fg-muted, #a09b90);
    max-width: 110px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.view-settings__menu-tag {
    font-size: 0.62rem;
    padding: 0.05rem 0.3rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
    color: var(--fg-muted, #a09b90);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.view-settings__menu-caret {
    color: var(--fg-muted, #a09b90);
    opacity: 0.7;
}

.view-settings__body {
    padding: 0.6rem 0.7rem 0.7rem;
    overflow: auto;
    max-height: calc(60vh - 32px);
}
</style>
