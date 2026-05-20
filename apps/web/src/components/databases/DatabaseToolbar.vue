<script setup lang="ts">
/**
 * Toolbar shown above the active view body.
 *
 *   – Horizontal tab strip of saved block-views with:
 *       • single click → switch to that view,
 *       • double click → inline rename,
 *       • right click  → context menu with rename / settings / delete,
 *       • gear button  → per-view settings (datasource, type, layout).
 *   – Trailing "+" → `AddViewModal`, which collects a `type` and a
 *     `dataSourceDatabaseId` before bubbling `add-view` to the parent.
 *   – Right-side actions: "New row" (primary) and "Delete block".
 *
 * The toolbar no longer exposes a database title: a block doesn't have
 * a parent datasource any more — each view is independently sourced.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import { Icon, UiConfirmModal } from '@/components/ui';
import { useContinuumScrollLock } from '@/composables/useContinuumScrollLock';
import type { AppIconName } from '@/assets/icons';
import type {
    DatabaseView,
    DatabaseViewType,
} from '@continuum/shared';
import AddViewModal from './AddViewModal.vue';
import DatabaseViewSourceBadge from './DatabaseViewSourceBadge.vue';

export interface AnchorRect {
    top: number;
    left: number;
    bottom: number;
    right: number;
}

const props = defineProps<{
    views: DatabaseView[];
    activeViewId: string | null;
    editable: boolean;
    sourceLabels: Record<string, string>;
    showSourceTableAction: boolean;
    sourceTableActionLabel: string;
    sourceTableActionTitle: string;
}>();

const emit = defineEmits<{
    'select-view': [viewId: string];
    /** New view payload — `AddViewModal` collects both type and source. */
    'add-view': [payload: { type: DatabaseViewType; dataSourceDatabaseId: string; name?: string }];
    'add-row': [];
    /** Open the link-existing-note flow scoped to the active datasource. */
    'link-existing': [];
    /** Open or create a table view for the active datasource. */
    'open-source-table': [];
    'rename-view': [viewId: string, name: string];
    'delete-view': [viewId: string];
    /**
     * Request the parent (DatabaseBody) to open the view options
     * popover anchored to the supplied rect. The toolbar no longer
     * owns the popover so that the summary chip bar can use the same
     * mechanism without prop-drilling through the tab loop.
     */
    'open-settings': [viewId: string, anchorRect: AnchorRect];
    delete: [];
}>();

const showAddView = ref(false);

function openAddView(): void {
    if (!props.editable) return;
    showAddView.value = true;
}

function sourceLabelFor(view: DatabaseView): string {
    return props.sourceLabels[view.dataSourceDatabaseId] ?? view.dataSourceDatabaseId.slice(0, 6);
}

function viewIconFor(type: DatabaseViewType): AppIconName {
    switch (type) {
        case 'table': return 'view-table';
        case 'board': return 'view-board';
        case 'gallery': return 'view-gallery';
        case 'list': return 'view-list';
        case 'calendar': return 'view-calendar';
        case 'timeline': return 'view-timeline';
        case 'chart': return 'view-chart';
        case 'dashboard': return 'view-dashboard';
        case 'feed': return 'view-feed';
        case 'map': return 'view-map';
        case 'form': return 'view-form';
    }
}

function onPickNewView(payload: { type: DatabaseViewType; dataSourceDatabaseId: string }): void {
    emit('add-view', payload);
}

// ── View tab rename ───────────────────────────────────────────────────────
const renamingViewId = ref<string | null>(null);
const renameDraft = ref('');

function startRename(view: DatabaseView): void {
    if (!props.editable) return;
    renamingViewId.value = view.id;
    renameDraft.value = view.name;
    closeMenu();
}

function cancelRename(): void {
    renamingViewId.value = null;
    renameDraft.value = '';
}

function commitRename(view: DatabaseView): void {
    const next = renameDraft.value.trim();
    cancelRename();
    if (!next || next === view.name) return;
    emit('rename-view', view.id, next);
}

// ── View tab context menu (rename / delete) ───────────────────────────────
const menuForViewId = ref<string | null>(null);
const menuAnchorRect = ref<AnchorRect | null>(null);

function openMenu(viewId: string, event: MouseEvent): void {
    if (!props.editable) return;
    event.preventDefault();
    event.stopPropagation();
    if (menuForViewId.value === viewId) {
        closeMenu();
        return;
    }
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    menuAnchorRect.value = rect
        ? { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right }
        : { top: event.clientY, left: event.clientX, bottom: event.clientY, right: event.clientX };
    menuForViewId.value = viewId;
}

function stopToolbarContext(event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
}

function closeMenu(): void {
    menuForViewId.value = null;
    menuAnchorRect.value = null;
}

const menuView = computed<DatabaseView | null>(
    () => props.views.find((v) => v.id === menuForViewId.value) ?? null,
);
useContinuumScrollLock(() => menuForViewId.value !== null);

function requestDelete(view: DatabaseView): void {
    closeMenu();
    deleteTargetView.value = view;
}

function confirmDeleteView(): void {
    const target = deleteTargetView.value;
    deleteTargetView.value = null;
    if (!target) return;
    emit('delete-view', target.id);
}

const deleteTargetView = ref<DatabaseView | null>(null);
const deleteMessage = computed(() => {
    const target = deleteTargetView.value;
    if (!target) return '';
    const tail = props.views.length <= 1
        ? ' This is the only view of the block — the block will return to its empty state.'
        : '';
    return `Delete view "${target.name}"?${tail} This cannot be undone.`;
});

function onDocClick(event: MouseEvent): void {
    if (!menuForViewId.value) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.db-toolbar__tab-menu')
        && !target.closest('.db-toolbar__tab')
        && !target.closest('.db-toolbar__tab-settings')) {
        closeMenu();
    }
}

// ── View settings popover trigger ────────────────────────────────────────
// The popover itself lives in DatabaseBody so that the summary chip bar
// and the per-tab gear can both open it without duplicating state. Here
// we just emit `open-settings` with the anchor rect of whichever
// control the user clicked.

function openSettings(viewId: string, event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    const anchor: AnchorRect = rect
        ? { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right }
        : menuAnchorRect.value
            ?? { top: 0, left: 0, bottom: 0, right: 0 };
    closeMenu();
    emit('open-settings', viewId, anchor);
}

function openSettingsFromMenu(viewId: string): void {
    const anchor = menuAnchorRect.value ?? { top: 0, left: 0, bottom: 0, right: 0 };
    closeMenu();
    emit('open-settings', viewId, anchor);
}

const TAB_MENU_WIDTH = 200;
const TAB_MENU_HEIGHT = 160;
const tabMenuStyle = computed<Record<string, string>>(() => {
    const rect = menuAnchorRect.value;
    if (!rect || typeof window === 'undefined') {
        return { position: 'fixed', top: '0px', left: '0px', zIndex: '1000' };
    }
    const margin = 6;
    const top = Math.min(rect.bottom + 4, window.innerHeight - TAB_MENU_HEIGHT - margin);
    const left = Math.min(rect.left, window.innerWidth - TAB_MENU_WIDTH - margin);
    return {
        position: 'fixed',
        top: `${Math.max(margin, top)}px`,
        left: `${Math.max(margin, left)}px`,
        zIndex: '1000',
    };
});

document.addEventListener('mousedown', onDocClick);
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick));
</script>

<template>
    <div class="db-toolbar-shell">
        <header class="db-toolbar" @contextmenu="stopToolbarContext">
            <nav class="db-toolbar__tabs">
                <div
                    v-for="view in views"
                    :key="view.id"
                    class="db-toolbar__tab-wrap"
                    :class="{ 'is-active': view.id === activeViewId }">
                    <input
                        v-if="renamingViewId === view.id"
                        v-model="renameDraft"
                        class="db-toolbar__tab-rename"
                        autofocus
                        @keydown.enter="commitRename(view)"
                        @keydown.escape="cancelRename"
                        @blur="commitRename(view)" />
                    <button
                        v-else
                        type="button"
                        class="db-toolbar__tab"
                        :class="{ 'is-active': view.id === activeViewId }"
                        :title="editable ? `${view.name} · ${sourceLabelFor(view)} (double-click to rename, right-click for more)` : `${view.name} · ${sourceLabelFor(view)}`"
                        @click="emit('select-view', view.id)"
                        @dblclick="startRename(view)"
                        @contextmenu.stop.prevent="openMenu(view.id, $event)">
                        <span class="db-toolbar__tab-main">
                            <Icon :name="viewIconFor(view.type)" :size="13" class="db-toolbar__tab-icon" />
                            <span class="db-toolbar__tab-name">{{ view.name }}</span>
                            <DatabaseViewSourceBadge :label="sourceLabelFor(view)" />
                        </span>
                    </button>
                    <button
                        v-if="editable && renamingViewId !== view.id"
                        type="button"
                        class="db-toolbar__tab-settings"
                        title="View settings"
                        @click.stop="openSettings(view.id, $event)"
                        @contextmenu.stop.prevent="openMenu(view.id, $event)">
                        <Icon name="settings" :size="12" />
                    </button>
                    <Teleport to="body">
                        <div
                            v-if="menuForViewId === view.id && menuView && menuAnchorRect"
                            class="db-toolbar__tab-menu"
                            role="menu"
                            data-continuum-scroll-lock-allow="true"
                            :style="tabMenuStyle"
                            @contextmenu.stop.prevent>
                            <button type="button" class="db-toolbar__tab-menu-item" @click="startRename(menuView)">
                                <Icon name="edit" :size="12" />
                                <span>Rename view</span>
                            </button>
                            <button type="button" class="db-toolbar__tab-menu-item" @click="openSettingsFromMenu(menuView.id)">
                                <Icon name="settings" :size="12" />
                                <span>View settings</span>
                            </button>
                            <button type="button" class="db-toolbar__tab-menu-item db-toolbar__tab-menu-item--danger" @click="requestDelete(menuView)">
                                <Icon name="trash" :size="12" />
                                <span>Delete view</span>
                            </button>
                        </div>
                    </Teleport>
                </div>
                <button
                    v-if="editable"
                    class="db-toolbar__tab db-toolbar__tab--add"
                    title="Add view"
                    @click="openAddView">
                    <Icon name="plus" />
                </button>
            </nav>

            <div class="db-toolbar__actions">
                <button
                    v-if="editable"
                    class="db-toolbar__action db-toolbar__action--primary"
                    @click="emit('add-row')">
                    <Icon name="plus" />
                    <span>New row</span>
                </button>
                <button
                    v-if="editable"
                    class="db-toolbar__action"
                    title="Link an existing note as a row"
                    @click="emit('link-existing')">
                    <Icon name="link" />
                    <span>Link note</span>
                </button>
                <button
                    v-if="showSourceTableAction"
                    class="db-toolbar__action"
                    :title="sourceTableActionTitle"
                    @click="emit('open-source-table')">
                    <Icon name="view-table" />
                    <span>{{ sourceTableActionLabel }}</span>
                </button>
                <button
                    v-if="editable"
                    class="db-toolbar__action db-toolbar__action--icon db-toolbar__action--danger"
                    title="Remove block"
                    aria-label="Remove block"
                    @click="emit('delete')">
                    <Icon name="trash" />
                </button>
            </div>
        </header>
        <AddViewModal v-model="showAddView" @select="onPickNewView" />
        <UiConfirmModal
            :model-value="!!deleteTargetView"
            title="Delete view"
            :message="deleteMessage"
            confirm-label="Delete"
            confirm-variant="danger"
            @update:model-value="(v) => { if (!v) deleteTargetView = null; }"
            @confirm="confirmDeleteView" />
    </div>
</template>

<style scoped>
/**
 * Toolbar shell — sits between the block frame and the active
 * renderer. Borrows the rhythm of Notion's view bar but stays inside
 * Continuum's design system: pure design tokens, no glass effects,
 * subtle horizontal divider and underline-style active tab.
 */
.db-toolbar-shell {
    display: contents;
}

.db-toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width-1) solid var(--border);
    color: var(--text-primary);
}

.db-toolbar__tabs {
    display: flex;
    align-items: stretch;
    gap: var(--space-px);
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
}

.db-toolbar__tabs::-webkit-scrollbar {
    display: none;
}

.db-toolbar__tab-wrap {
    position: relative;
    display: inline-flex;
    align-items: stretch;
    min-width: 0;
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.db-toolbar__tab-wrap:hover {
    background: var(--surface-hover);
}

.db-toolbar__tab-wrap.is-active {
    background: var(--surface-1);
    border-color: color-mix(in srgb, var(--border) 72%, transparent);
}

.db-toolbar__tab {
    appearance: none;
    border: 0;
    background: transparent;
    min-height: 30px;
    padding: var(--space-1) var(--space-2);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-secondary);
    cursor: pointer;
    position: relative;
    text-align: left;
    transition: color var(--duration-fast) var(--ease-standard);
}

.db-toolbar__tab-main {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    max-width: 18rem;
}

.db-toolbar__tab-icon {
    color: var(--text-muted);
}

.db-toolbar__tab-name {
    max-width: 9rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-toolbar__tab::after {
    content: '';
    position: absolute;
    left: var(--space-2);
    right: var(--space-2);
    bottom: -1px;
    height: 2px;
    background: transparent;
    border-radius: var(--radius-sm);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.db-toolbar__tab:hover {
    color: var(--text-primary);
}

.db-toolbar__tab.is-active {
    color: var(--text-primary);
}

.db-toolbar__tab.is-active::after {
    background: var(--accent);
}

.db-toolbar__tab-settings {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    margin: auto var(--space-1) auto 0;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    opacity: 0;
    transition:
        opacity var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.db-toolbar__tab-wrap:hover .db-toolbar__tab-settings,
.db-toolbar__tab-wrap.is-active .db-toolbar__tab-settings,
.db-toolbar__tab-settings:focus-visible {
    opacity: 1;
}

.db-toolbar__tab-settings:hover,
.db-toolbar__tab-settings:focus-visible {
    background: var(--surface-active);
    color: var(--text-primary);
    outline: none;
}

.db-toolbar__tab--add {
    color: var(--text-muted);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
}

.db-toolbar__tab--add:hover {
    color: var(--text-primary);
    background: var(--surface-hover);
}

.db-toolbar__tab-rename {
    border: var(--border-width-1) solid var(--accent);
    background: var(--surface-2);
    color: var(--text-primary);
    font: inherit;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    width: 9rem;
    outline: none;
}

/* Teleported view-tab menu (rename / settings / delete). */
.db-toolbar__tab-menu {
    min-width: 180px;
    background: var(--surface-2);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-dropdown);
    display: flex;
    flex-direction: column;
    padding: var(--space-1);
}

.db-toolbar__tab-menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: 0;
    background: transparent;
    color: var(--text-primary);
    font: inherit;
    font-size: var(--text-sm);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.db-toolbar__tab-menu-item:hover {
    background: var(--surface-hover);
}

.db-toolbar__tab-menu-item--danger { color: var(--danger); }
.db-toolbar__tab-menu-item--danger:hover { background: var(--danger-faint); }

.db-toolbar__actions {
    display: flex;
    align-items: center;
    gap: var(--space-px);
    flex-shrink: 0;
    padding: var(--space-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-1);
}

.db-toolbar__action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: 30px;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.db-toolbar__action:hover {
    background: var(--surface-active);
    color: var(--text-primary);
}

.db-toolbar__action--primary {
    background: var(--surface-2);
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
}

.db-toolbar__action--primary:hover {
    background: var(--accent-faint);
    color: var(--accent);
}

.db-toolbar__action--icon {
    width: 30px;
    padding: 0;
}

.db-toolbar__action--danger:hover {
    background: var(--danger-faint);
    color: var(--danger);
}
</style>
