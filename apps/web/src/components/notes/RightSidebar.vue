<script setup lang="ts">
/**
 * Right sidebar (note "details").
 *
 * Resizable: a thin drag handle on the inner-left edge lets the user
 * change the pane width. The active width is owned by the parent so it
 * can drive the layout grid; we just emit `update:width` while dragging.
 *
 * Collapsible sections: each panel (Properties, Linked notes, Backlinks,
 * Tags) is wrapped in a small disclosure with persisted open / closed
 * state, so the user can hide what they don't care about for a given
 * note kind.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { UiButton, Icon } from '@/components/ui';
import BacklinksPanel from './BacklinksPanel.vue';
import LinkedNotesPanel from './LinkedNotesPanel.vue';
import PropertyPanel from '../properties/PropertyPanel.vue';
import TagsPanel from './TagsPanel.vue';
import type { Note } from '@continuum/shared';
import type { BacklinkEntry } from '@/api';

const props = withDefaults(
    defineProps<{
        note: Note | null;
        notes: Note[];
        backlinks: BacklinkEntry[];
        backlinksLoading: boolean;
        collapsed: boolean;
        width: number;
        minWidth?: number;
        maxWidth?: number;
    }>(),
    {
        minWidth: 260,
        maxWidth: 540,
    },
);

const emit = defineEmits<{
    (e: 'update:collapsed', value: boolean): void;
    (e: 'update:width', value: number): void;
    (e: 'select', id: string): void;
}>();

function onSelect(id: string): void { emit('select', id); }
function toggle(): void { emit('update:collapsed', !props.collapsed); }

// ─── Section open/closed state ─────────────────────────────────────────
type SectionKey = 'properties' | 'linked' | 'backlinks' | 'tags';

const STORAGE_KEY = 'continuum.notesView.rightSections';

interface SectionState {
    properties: boolean;
    linked: boolean;
    backlinks: boolean;
    tags: boolean;
}

const DEFAULT_STATE: SectionState = {
    properties: true,
    linked: true,
    backlinks: true,
    tags: true,
};

function loadState(): SectionState {
    if (typeof window === 'undefined') return { ...DEFAULT_STATE };
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_STATE };
        const parsed = JSON.parse(raw) as Partial<SectionState>;
        return { ...DEFAULT_STATE, ...parsed };
    } catch {
        return { ...DEFAULT_STATE };
    }
}

const sections = ref<SectionState>(loadState());

function persistSections(): void {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sections.value));
}

function toggleSection(key: SectionKey): void {
    sections.value[key] = !sections.value[key];
    persistSections();
}

// ─── Drag-to-resize ────────────────────────────────────────────────────
const dragging = ref(false);
let dragStartX = 0;
let dragStartWidth = 0;

function onResizeStart(e: PointerEvent): void {
    if (props.collapsed) return;
    dragging.value = true;
    dragStartX = e.clientX;
    dragStartWidth = props.width;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
}

function onResizeMove(e: PointerEvent): void {
    if (!dragging.value) return;
    // Handle is on the LEFT edge of the right pane: dragging left grows it.
    const next = dragStartWidth - (e.clientX - dragStartX);
    const clamped = Math.min(Math.max(next, props.minWidth), props.maxWidth);
    emit('update:width', clamped);
}

function onResizeEnd(e: PointerEvent): void {
    if (!dragging.value) return;
    dragging.value = false;
    try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
        /* element may have been unmounted */
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
}

onBeforeUnmount(() => {
    if (dragging.value) {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
});

// ─── Counts shown in disclosure headers ───────────────────────────────
const linkedCount = computed(() => {
    const text = props.note?.content ?? '';
    if (!text) return 0;
    const matches = text.match(/\[\[([^\]]+)\]\]/g);
    return matches ? new Set(matches).size : 0;
});
const backlinksCount = computed(() => props.backlinks.length);
const tagsCount = computed(() => (props.note?.tags ?? []).length);
</script>

<template>
    <aside class="right-sidebar" :class="{ collapsed, dragging }">
        <span v-if="!collapsed" class="resize-handle" :class="{ active: dragging }" role="separator"
            aria-orientation="vertical" aria-label="Resize details panel" @pointerdown="onResizeStart"
            @pointermove="onResizeMove" @pointerup="onResizeEnd" @pointercancel="onResizeEnd" />

        <header class="header">
            <h3 v-if="!collapsed" class="header__title">
                <Icon name="info" :size="13" class="header__title-ico" />
                <span>Details</span>
            </h3>
            <UiButton variant="ghost" size="sm" class="toggle-btn"
                :title="collapsed ? 'Expand details' : 'Collapse details'"
                :aria-label="collapsed ? 'Expand details' : 'Collapse details'" @click="toggle">
                <Icon :name="collapsed ? 'chevron-left' : 'chevron-right'" :size="14" />
            </UiButton>
        </header>

        <div v-if="!collapsed" class="body">
            <template v-if="note">
                <!-- Properties -->
                <div class="group">
                    <button type="button" class="group__head" :aria-expanded="sections.properties"
                        @click="toggleSection('properties')">
                        <Icon name="prop-text" :size="12" class="group__icon" />
                        <span class="group__title">Properties</span>
                        <Icon name="chevron-down" :size="12" class="group__chev"
                            :class="{ 'is-open': sections.properties }" />
                    </button>
                    <div v-if="sections.properties" class="group__body">
                        <PropertyPanel :note-id="note.id" :kind-id="note.kind" />
                    </div>
                </div>

                <!-- Linked notes -->
                <div class="group">
                    <button type="button" class="group__head" :aria-expanded="sections.linked"
                        @click="toggleSection('linked')">
                        <Icon name="connection" :size="12" class="group__icon" />
                        <span class="group__title">Linked notes</span>
                        <span v-if="linkedCount" class="group__count">{{ linkedCount }}</span>
                        <Icon name="chevron-down" :size="12" class="group__chev"
                            :class="{ 'is-open': sections.linked }" />
                    </button>
                    <div v-if="sections.linked" class="group__body">
                        <LinkedNotesPanel :content="note.content" :notes="notes" @select="onSelect" />
                    </div>
                </div>

                <!-- Backlinks -->
                <div class="group">
                    <button type="button" class="group__head" :aria-expanded="sections.backlinks"
                        @click="toggleSection('backlinks')">
                        <Icon name="prop-relation" :size="12" class="group__icon" />
                        <span class="group__title">Backlinks</span>
                        <span v-if="backlinksCount" class="group__count">{{ backlinksCount }}</span>
                        <Icon name="chevron-down" :size="12" class="group__chev"
                            :class="{ 'is-open': sections.backlinks }" />
                    </button>
                    <div v-if="sections.backlinks" class="group__body">
                        <BacklinksPanel :backlinks="backlinks" :loading="backlinksLoading" @select="onSelect" />
                    </div>
                </div>

                <!-- Tags -->
                <div class="group">
                    <button type="button" class="group__head" :aria-expanded="sections.tags"
                        @click="toggleSection('tags')">
                        <Icon name="tag" :size="12" class="group__icon" />
                        <span class="group__title">Tags</span>
                        <span v-if="tagsCount" class="group__count">{{ tagsCount }}</span>
                        <Icon name="chevron-down" :size="12" class="group__chev"
                            :class="{ 'is-open': sections.tags }" />
                    </button>
                    <div v-if="sections.tags" class="group__body">
                        <TagsPanel :tags="note.tags ?? []" />
                    </div>
                </div>
            </template>
            <p v-else class="empty-details">No selection</p>
        </div>
    </aside>
</template>

<style scoped>
.right-sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    height: 100%;
    min-height: 0;
}

.resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--space-6) * -1);
    width: 8px;
    cursor: col-resize;
    z-index: 5;
    background: transparent;
    transition: background var(--duration-fast) var(--ease-standard);
}

.resize-handle::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 2px;
    background: transparent;
    transform: translateX(-50%);
    transition: background var(--duration-fast) var(--ease-standard);
}

.resize-handle:hover::before,
.resize-handle.active::before {
    background: var(--accent, var(--border-strong));
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
    padding-bottom: var(--space-2);
    border-bottom: var(--border-width-1) solid var(--border);
}

.right-sidebar.collapsed .header {
    justify-content: center;
    border-bottom: none;
    padding-bottom: 0;
}

.header__title {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--fg-muted);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.header__title-ico {
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.toggle-btn {
    flex-shrink: 0;
}

.body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    overflow: auto;
    min-height: 0;
}

.empty-details {
    margin: 0;
    padding: var(--space-2) 0;
    color: var(--fg-subtle);
    font-size: var(--text-sm);
}

/* ─── Disclosure groups ────────────────────────────────────────── */

.group {
    display: flex;
    flex-direction: column;
}

.group__head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    padding: var(--space-2);
    margin-left: calc(var(--space-2) * -1);
    border-radius: var(--radius-sm);
    text-align: left;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    transition: background var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.group__head:hover {
    background: var(--bg-soft);
    color: var(--fg);
}

.group__icon {
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.group__title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.group__count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 16px;
    padding: 0 5px;
    background: var(--bg-soft);
    border-radius: var(--radius-pill, 999px);
    color: var(--fg-muted);
    font-size: 10px;
    font-weight: var(--font-weight-medium);
    letter-spacing: 0;
    text-transform: none;
    flex-shrink: 0;
}

.group__chev {
    color: var(--fg-subtle);
    flex-shrink: 0;
    transform: rotate(-90deg);
    transition: transform var(--duration-fast) var(--ease-standard);
}

.group__chev.is-open {
    transform: rotate(0deg);
}

.group__body {
    padding: var(--space-1) 0 var(--space-3);
}
</style>
