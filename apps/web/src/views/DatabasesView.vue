<script setup lang="ts">
/**
 * DatabasesView — central manager for *datasource* entities.
 *
 * Datasources are persistent, first-class objects: they exist
 * independently of any database block in any note and can be referenced
 * from zero or many block views. This view is the single place where
 * the user can:
 *
 *   • Browse every datasource (active or archived, locked or not).
 *   • Rename / re-icon a datasource inline.
 *   • Toggle the "locked" flag (rows can't be added/removed when on).
 *   • Toggle the "archived" flag (hidden from new-view pickers).
 *   • Delete a datasource — the server cascades to every block view
 *     that referenced it, and the realtime bus pushes
 *     `database.deleted` to every open block.
 *
 * Editing of *rows / schema / views* still happens inside notes via the
 * database block. This screen is intentionally schema-agnostic — it
 * surfaces only the metadata that's globally meaningful.
 */
import { computed, onMounted, ref } from 'vue';
import { api } from '@/api';
import { Icon, UiButton, UiInput, UiEmpty, UiConfirmModal } from '@/components/ui';
import { publishDatabaseDeleted } from '@/lib/realtime';
import { useRealtime } from '@/lib/realtime/useRealtime';
import type { Database } from '@continuum/shared';

const datasources = ref<Database[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

const search = ref('');
const showArchived = ref(false);

const editingId = ref<string | null>(null);
const editDraft = ref('');

const deleteTarget = ref<Database | null>(null);
const deleteBusy = ref(false);

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    return datasources.value.filter((db) => {
        if (!showArchived.value && db.archived) return false;
        if (!q) return true;
        return (db.title || '').toLowerCase().includes(q);
    });
});

const counts = computed(() => ({
    total: datasources.value.length,
    archived: datasources.value.filter((d) => d.archived).length,
    locked: datasources.value.filter((d) => d.locked).length,
}));

async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
        datasources.value = await api.databases.list();
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not load datasources';
    } finally {
        loading.value = false;
    }
}

// ── Inline rename ────────────────────────────────────────────────────────
function startRename(database: Database): void {
    editingId.value = database.id;
    editDraft.value = database.title;
}

function cancelRename(): void {
    editingId.value = null;
    editDraft.value = '';
}

async function commitRename(database: Database): Promise<void> {
    const next = editDraft.value.trim();
    cancelRename();
    if (!next || next === database.title) return;
    try {
        const updated = await api.databases.update(database.id, { title: next });
        replaceInList(updated);
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not rename datasource';
    }
}

// ── Toggles ──────────────────────────────────────────────────────────────
async function toggleLocked(database: Database): Promise<void> {
    try {
        const updated = await api.databases.update(database.id, { locked: !database.locked });
        replaceInList(updated);
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not toggle lock';
    }
}

async function toggleArchived(database: Database): Promise<void> {
    try {
        const updated = await api.databases.update(database.id, { archived: !database.archived });
        replaceInList(updated);
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not toggle archive';
    }
}

// ── Create ───────────────────────────────────────────────────────────────
const showCreate = ref(false);
const newTitle = ref('');
const creating = ref(false);

function openCreate(): void {
    showCreate.value = true;
    newTitle.value = '';
}

async function submitCreate(): Promise<void> {
    if (creating.value) return;
    creating.value = true;
    try {
        const { database } = await api.databases.create({ title: newTitle.value.trim() || 'Untitled datasource' });
        datasources.value = [database, ...datasources.value];
        showCreate.value = false;
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not create datasource';
    } finally {
        creating.value = false;
    }
}

// ── Delete ───────────────────────────────────────────────────────────────
function requestDelete(database: Database): void {
    deleteTarget.value = database;
}

const deleteMessage = computed(() => {
    const target = deleteTarget.value;
    return target
        ? `Delete datasource "${target.title || 'Untitled'}"? Every block view in every note that references this datasource will disappear too. This cannot be undone.`
        : '';
});

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value;
    if (!target) return;
    deleteBusy.value = true;
    try {
        await api.databases.remove(target.id);
        datasources.value = datasources.value.filter((d) => d.id !== target.id);
        publishDatabaseDeleted(target.id);
        deleteTarget.value = null;
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not delete datasource';
        deleteTarget.value = null;
    } finally {
        deleteBusy.value = false;
    }
}

// ── List helpers ─────────────────────────────────────────────────────────
function replaceInList(updated: Database): void {
    const i = datasources.value.findIndex((d) => d.id === updated.id);
    if (i >= 0) datasources.value.splice(i, 1, updated);
}

// ── Realtime sync — other windows / blocks may mutate datasources. ──────
useRealtime(['database.deleted', 'database.updated'], (event) => {
    if (event.kind === 'database.deleted') {
        datasources.value = datasources.value.filter((d) => d.id !== event.databaseId);
        return;
    }
    // database.updated → refetch the bundle to stay aligned with server.
    api.databases.bundle(event.databaseId)
        .then((b) => replaceInList(b.database))
        .catch(() => {/* ignore — likely deleted */});
});

onMounted(load);
</script>

<template>
    <section class="databases-view">
        <header class="databases-view__header">
            <div class="databases-view__title">
                <h1>Datasources</h1>
                <p>{{ counts.total }} total · {{ counts.locked }} locked · {{ counts.archived }} archived</p>
            </div>
            <div class="databases-view__actions">
                <UiInput v-model="search" placeholder="Search datasources…" class="databases-view__search" />
                <UiButton variant="ghost" @click="showArchived = !showArchived">
                    <Icon name="archive" :size="14" />
                    {{ showArchived ? 'Hide archived' : 'Show archived' }}
                </UiButton>
                <UiButton @click="openCreate">
                    <Icon name="plus" :size="14" />
                    New datasource
                </UiButton>
            </div>
        </header>

        <p v-if="error" class="databases-view__error">{{ error }}</p>

        <div v-if="loading" class="databases-view__state">Loading…</div>
        <UiEmpty
            v-else-if="!filtered.length"
            label="No datasources match"
            description="Adjust the filters or create a new datasource above." />
        <ul v-else class="databases-view__list">
            <li
                v-for="db in filtered"
                :key="db.id"
                class="databases-view__row"
                :class="{ 'is-archived': db.archived }">
                <Icon :name="db.icon ?? 'database'" :size="16" />

                <div class="databases-view__row-main">
                    <input
                        v-if="editingId === db.id"
                        v-model="editDraft"
                        class="databases-view__rename"
                        autofocus
                        @keydown.enter="commitRename(db)"
                        @keydown.escape="cancelRename"
                        @blur="commitRename(db)" />
                    <button
                        v-else
                        type="button"
                        class="databases-view__name"
                        title="Double-click to rename"
                        @dblclick="startRename(db)">
                        {{ db.title || 'Untitled datasource' }}
                    </button>
                    <span v-if="db.description" class="databases-view__desc">{{ db.description }}</span>
                </div>

                <div class="databases-view__row-flags">
                    <button
                        type="button"
                        class="databases-view__flag"
                        :class="{ 'is-on': db.locked }"
                        :title="db.locked ? 'Unlock' : 'Lock (read-only)'"
                        @click="toggleLocked(db)">
                        <Icon :name="db.locked ? 'lock' : 'unlock'" :size="13" />
                    </button>
                    <button
                        type="button"
                        class="databases-view__flag"
                        :class="{ 'is-on': db.archived }"
                        :title="db.archived ? 'Restore' : 'Archive'"
                        @click="toggleArchived(db)">
                        <Icon name="archive" :size="13" />
                    </button>
                    <button
                        type="button"
                        class="databases-view__flag databases-view__flag--danger"
                        title="Delete datasource"
                        @click="requestDelete(db)">
                        <Icon name="trash" :size="13" />
                    </button>
                </div>
            </li>
        </ul>

        <UiConfirmModal
            :model-value="showCreate"
            title="New datasource"
            :message="''"
            confirm-label="Create"
            @update:model-value="(v) => { if (!v && !creating) showCreate = false; }"
            @confirm="submitCreate">
            <UiInput v-model="newTitle" placeholder="Title" autofocus :disabled="creating" />
        </UiConfirmModal>

        <UiConfirmModal
            :model-value="!!deleteTarget"
            title="Delete datasource"
            :message="deleteMessage"
            confirm-label="Delete"
            confirm-variant="danger"
            @update:model-value="(v) => { if (!v && !deleteBusy) deleteTarget = null; }"
            @confirm="confirmDelete" />
    </section>
</template>

<style scoped>
.databases-view {
    padding: 1.5rem 2rem;
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    color: var(--fg, #ededed);
}

.databases-view__header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
}

.databases-view__title h1 {
    margin: 0 0 0.25rem 0;
    font-size: 1.25rem;
    font-weight: 600;
}

.databases-view__title p {
    margin: 0;
    color: var(--fg-muted, #a09b90);
    font-size: 0.78rem;
}

.databases-view__actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.databases-view__search { min-width: 220px; }

.databases-view__error {
    margin: 0;
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-xs, 4px);
    background: var(--danger-faint, rgba(184, 92, 92, 0.08));
    border: var(--border-width-1, 1px) solid var(--danger-border, rgba(184, 92, 92, 0.3));
    color: var(--danger, #b85c5c);
    font-size: var(--text-sm, 0.75rem);
}

.databases-view__state {
    color: var(--fg-muted, #a09b90);
    font-size: 0.85rem;
    padding: 1.5rem 0;
    text-align: center;
}

.databases-view__list {
    list-style: none;
    margin: 0;
    padding: 0;
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    overflow: hidden;
}

.databases-view__row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.85rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.04));
}

.databases-view__row:last-child { border-bottom: none; }
.databases-view__row.is-archived { opacity: 0.55; }
.databases-view__row:hover { background: var(--surface-hover, rgba(255, 255, 255, 0.03)); }

.databases-view__row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}

.databases-view__name {
    background: transparent;
    border: none;
    padding: 0;
    color: var(--fg, #ededed);
    font-size: 0.9rem;
    font-weight: 500;
    text-align: left;
    cursor: text;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.databases-view__desc {
    color: var(--fg-muted, #a09b90);
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.databases-view__rename {
    background: var(--bg-elev, #232323);
    border: var(--border-width-1, 1px) solid var(--accent, #e8dcc8);
    color: var(--fg, #ededed);
    border-radius: 4px;
    padding: 0.25rem 0.4rem;
    font-size: 0.9rem;
}

.databases-view__row-flags {
    display: flex;
    gap: 0.25rem;
    flex-shrink: 0;
}

.databases-view__flag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.7rem;
    height: 1.7rem;
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.08));
    background: transparent;
    border-radius: 4px;
    color: var(--fg-muted, #a09b90);
    cursor: pointer;
}

.databases-view__flag:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.05));
    color: var(--fg, #ededed);
}

.databases-view__flag.is-on {
    background: var(--accent-faint, rgba(232, 220, 200, 0.14));
    color: var(--accent, #e8dcc8);
    border-color: var(--accent, #e8dcc8);
}

.databases-view__flag--danger:hover {
    background: var(--danger-faint, rgba(184, 92, 92, 0.08));
    color: var(--danger, #b85c5c);
    border-color: var(--danger-border, rgba(184, 92, 92, 0.3));
}
</style>
