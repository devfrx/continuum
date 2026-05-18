<script setup lang="ts">
/**
 * Toolbar shown above the active view body.
 *
 *   – Editable database title (commits on blur / Enter).
 *   – Horizontal tab strip of saved views with:
 *       • single click → switch to that view,
 *       • double click → inline rename,
 *       • right click  → context menu with rename / settings / delete,
 *       • gear button  → per-view settings (including datasource),
 *     plus a trailing "+" to add a new view.
 *   – Right-side actions: "New row" (primary) and "Delete block".
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Icon, UiConfirmModal } from '@/components/ui';
import type {
    Database,
    DatabaseView,
    DatabaseViewType,
    PropertyDefinition,
} from '@continuum/shared';
import AddViewModal from './AddViewModal.vue';
import DatabaseViewSettings from './DatabaseViewSettings.vue';

const props = defineProps<{
    database: Database;
    views: DatabaseView[];
    /**
     * Schema of the *parent* database. Passed into the view-settings
     * popover so layout pickers (group-by, cover, date) can populate
     * their options. Views with a `dataSourceDatabaseId` override use
     * the same schema as a baseline — see `DatabaseViewSettings` for
     * the known v1 limitation.
     */
    schema: PropertyDefinition[];
    activeViewId: string | null;
    /**
     * Effective database id for the *active* view — equals the parent
     * `database.id` unless the active view has a `dataSourceDatabaseId`
     * override, in which case it equals that override. Passed through
     * to `DatabaseViewSettings` so the picker can highlight the right
     * row.
     */
    effectiveDatabaseId: string;
    editable: boolean;
}>();

const emit = defineEmits<{
    'select-view': [viewId: string];
    'add-view': [type: DatabaseViewType];
    'add-row': [];
    'rename-view': [viewId: string, name: string];
    'delete-view': [viewId: string];
    /** Per-view datasource override change (or clear when `null`). */
    'change-view-source': [viewId: string, databaseId: string | null];
    /** Swap a view's renderer type. */
    'change-view-type': [viewId: string, type: DatabaseViewType];
    /** Partial patch merged into a view's `config.layout`. */
    'patch-view-layout': [viewId: string, patch: Record<string, unknown>];
    rename: [title: string];
    delete: [];
}>();

const showAddView = ref(false);

function openAddView(): void {
    if (!props.editable) return;
    showAddView.value = true;
}

function onPickViewType(type: DatabaseViewType): void {
    emit('add-view', type);
}

// ── Database title editing ────────────────────────────────────────────────
const titleDraft = ref(props.database.title);

watch(
    () => props.database.title,
    (value) => {
        titleDraft.value = value;
    },
);

function commitTitle(): void {
    if (!props.editable) return;
    const next = titleDraft.value.trim();
    if (next === props.database.title) return;
    emit('rename', next);
}

function onTitleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        event.preventDefault();
        (event.target as HTMLElement).blur();
    } else if (event.key === 'Escape') {
        titleDraft.value = props.database.title;
        (event.target as HTMLElement).blur();
    }
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
interface AnchorRect {
    top: number;
    left: number;
    bottom: number;
    right: number;
}
const menuForViewId = ref<string | null>(null);
// Captured at open time so the menu can be teleported into <body> and
// positioned with `position: fixed`, escaping the database block's
// `overflow: hidden`.
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

function requestDelete(view: DatabaseView): void {
    closeMenu();
    if (props.views.length <= 1) {
        lastViewError.value = true;
        return;
    }
    deleteTargetView.value = view;
}

function confirmDeleteView(): void {
    const target = deleteTargetView.value;
    deleteTargetView.value = null;
    if (!target) return;
    emit('delete-view', target.id);
}

// In-app dialog state replaces native confirm/alert so it matches the
// rest of the design system and stays inside the editor surface.
const deleteTargetView = ref<DatabaseView | null>(null);
const lastViewError = ref(false);
const deleteMessage = computed(() => {
    const target = deleteTargetView.value;
    return target ? `Delete view "${target.name}"? This cannot be undone.` : '';
});

function onDocClick(event: MouseEvent): void {
    if (!menuForViewId.value) return;
    const target = event.target as HTMLElement;
    if (!target.closest('.db-toolbar__tab-menu') && !target.closest('.db-toolbar__tab') && !target.closest('.db-toolbar__tab-settings')) {
        closeMenu();
    }
}

// ── Per-view settings popover ────────────────────────────────────────────
// Opened by the gear button (or from the tab context menu "View
// settings" item). The popover lives in a <Teleport to="body"> and
// uses `position: fixed`, so we hand it the trigger rect captured at
// open time. This keeps it visible even when the database block clips
// its overflow.
const settingsForViewId = ref<string | null>(null);
const settingsAnchorRect = ref<AnchorRect | null>(null);

function openSettings(viewId: string, event: MouseEvent): void {
    const target = event.currentTarget as HTMLElement | null;
    const rect = target?.getBoundingClientRect();
    settingsAnchorRect.value = rect
        ? { top: rect.top, left: rect.left, bottom: rect.bottom, right: rect.right }
        : menuAnchorRect.value;
    closeMenu();
    settingsForViewId.value = viewId;
}

function openSettingsFromMenu(viewId: string): void {
    // Reuse the menu's anchor so the popover lines up with the
    // original right-click position.
    if (menuAnchorRect.value) settingsAnchorRect.value = menuAnchorRect.value;
    closeMenu();
    settingsForViewId.value = viewId;
}

function onSettingsModelValue(viewId: string, value: boolean): void {
    if (!value && settingsForViewId.value === viewId) {
        settingsForViewId.value = null;
        settingsAnchorRect.value = null;
    }
}

function onViewSourceChange(viewId: string, databaseId: string | null): void {
    settingsForViewId.value = null;
    settingsAnchorRect.value = null;
    emit('change-view-source', viewId, databaseId);
}

function onViewTypeChange(viewId: string, type: DatabaseViewType): void {
    // Keep the popover open so the user immediately sees the new
    // layout reflected in the type grid + see/edit its specific knobs.
    emit('change-view-type', viewId, type);
}

function onViewLayoutPatch(viewId: string, patch: Record<string, unknown>): void {
    emit('patch-view-layout', viewId, patch);
}

// Computed inline style for the (teleported, fixed-position) tab
// context menu. Clamps so it never spills outside the viewport.
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
    <header class="db-toolbar" @contextmenu="stopToolbarContext">
        <div class="db-toolbar__title">
            <Icon :name="database.icon ?? 'database'" />
            <input
                v-model="titleDraft"
                class="db-toolbar__title-input"
                placeholder="Untitled database"
                :readonly="!editable"
                @blur="commitTitle"
                @keydown="onTitleKeydown" />
        </div>

        <nav class="db-toolbar__tabs">
            <div
                v-for="view in views"
                :key="view.id"
                class="db-toolbar__tab-wrap">
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
                    :title="editable ? `${view.name} (double-click to rename, right-click for more)` : view.name"
                    @click="emit('select-view', view.id)"
                    @dblclick="startRename(view)"
                    @contextmenu.stop.prevent="openMenu(view.id, $event)">
                    {{ view.name }}
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
                <DatabaseViewSettings
                    v-if="settingsForViewId === view.id"
                    :model-value="true"
                    :view="view"
                    :schema="schema"
                    :effective-database-id="view.id === activeViewId ? effectiveDatabaseId : (view.dataSourceDatabaseId ?? database.id)"
                    :parent-database-id="database.id"
                    :anchor-rect="settingsAnchorRect"
                    @update:model-value="(value: boolean) => onSettingsModelValue(view.id, value)"
                    @change-source="(databaseId: string | null) => onViewSourceChange(view.id, databaseId)"
                    @change-type="(type: DatabaseViewType) => onViewTypeChange(view.id, type)"
                    @patch-layout="(patch: Record<string, unknown>) => onViewLayoutPatch(view.id, patch)" />
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
                title="Remove block"
                @click="emit('delete')">
                <Icon name="trash" />
            </button>
        </div>
    </header>
    <AddViewModal v-model="showAddView" @select="onPickViewType" />
    <UiConfirmModal
        :model-value="!!deleteTargetView"
        title="Delete view"
        :message="deleteMessage"
        confirm-label="Delete"
        confirm-variant="danger"
        @update:model-value="(v) => { if (!v) deleteTargetView = null; }"
        @confirm="confirmDeleteView" />
    <UiConfirmModal
        :model-value="lastViewError"
        title="Cannot delete view"
        message="This is the last view of the database. Add another view first, then delete this one."
        confirm-label="OK"
        cancel-label="Close"
        @update:model-value="(v) => { if (!v) lastViewError = false; }"
        @confirm="lastViewError = false" />
</template>

<style scoped>
.db-toolbar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    background: var(--bg-elev, #232323);
    color: var(--fg, #ededed);
}

.db-toolbar__title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    flex-shrink: 0;
}

.db-toolbar__title-input {
    border: none;
    background: transparent;
    font-size: 1rem;
    font-weight: 600;
    color: inherit;
    width: 14rem;
    max-width: 14rem;
    padding: 0.15rem 0.25rem;
    border-radius: 4px;
}

.db-toolbar__title-input:focus {
    outline: var(--border-width-2, 2px) solid var(--focus-ring-color, rgba(232, 220, 200, 0.5));
}

.db-toolbar__tabs {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
}

.db-toolbar__tab-wrap {
    position: relative;
    display: flex;
    align-items: center;
}

.db-toolbar__tab {
    border: none;
    background: transparent;
    padding: 0.3rem 0.6rem;
    font-size: 0.825rem;
    color: var(--fg-muted, #a09b90);
    border-bottom: 2px solid transparent;
    cursor: pointer;
    white-space: nowrap;
}

.db-toolbar__tab-settings {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.45rem;
    height: 1.45rem;
    margin-left: -0.35rem;
    border: none;
    background: transparent;
    color: var(--fg-muted, #a09b90);
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 80ms ease, background 80ms ease, color 80ms ease;
}

.db-toolbar__tab-wrap:hover .db-toolbar__tab-settings,
.db-toolbar__tab.is-active + .db-toolbar__tab-settings,
.db-toolbar__tab-settings:focus-visible {
    opacity: 1;
}

.db-toolbar__tab-settings:hover,
.db-toolbar__tab-settings:focus-visible {
    background: var(--surface-hover, rgba(255, 255, 255, 0.05));
    color: var(--fg, #ededed);
}

.db-toolbar__tab:hover {
    color: var(--fg, #ededed);
}

.db-toolbar__tab.is-active {
    color: var(--fg, #ededed);
    border-bottom-color: var(--accent, #e8dcc8);
}

.db-toolbar__tab--add {
    color: var(--fg-muted, #a09b90);
    padding: 0.3rem;
}

.db-toolbar__tab-rename {
    border: var(--border-width-1, 1px) solid var(--accent, #e8dcc8);
    background: var(--bg-elev, #232323);
    color: var(--fg, #ededed);
    font-size: 0.825rem;
    padding: 0.2rem 0.35rem;
    border-radius: 4px;
    width: 8rem;
}

.db-toolbar__tab-menu {
    position: absolute;
    top: 100%;
    left: 0;
    margin-top: 4px;
    min-width: 160px;
    background: var(--bg-elev, #232323);
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 10;
    display: flex;
    flex-direction: column;
    padding: 4px;
}

.db-toolbar__tab-menu-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0.55rem;
    border: none;
    background: transparent;
    color: var(--fg, #ededed);
    font-size: 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
}

.db-toolbar__tab-menu-item:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.05));
}

.db-toolbar__tab-menu-item--danger {
    color: var(--danger, #b85c5c);
}

.db-toolbar__tab-menu-item--danger:hover {
    background: var(--danger-faint, rgba(184, 92, 92, 0.08));
}

.db-toolbar__actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    flex-shrink: 0;
}

.db-toolbar__action {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
    background: var(--bg-elev, #232323);
    color: var(--fg, #ededed);
    padding: 0.3rem 0.55rem;
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
}

.db-toolbar__action:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.04));
}

.db-toolbar__action--primary {
    background: var(--accent, #e8dcc8);
    border-color: transparent;
    color: var(--fg-on-accent, #161616);
}

.db-toolbar__action--primary:hover {
    background: var(--accent-hover, #f5ede0);
}
</style>
