<script setup lang="ts">
/**
 * Placeholder shown when a `database` node is unbound — no
 * `databaseId` has been chosen yet. Offers the two paths the user
 * needs the first time they insert the block:
 *
 *   1. Create a brand-new database (title input).
 *   2. Link an existing database from a small searchable list.
 *
 * Once the user picks an option, the parent emits `update:attrs` and
 * the block flips to the full `DatabaseBody`.
 */
import { computed, onMounted, ref } from 'vue';
import { UiButton, UiInput, UiEmpty, UiConfirmModal, Icon } from '@/components/ui';
import { api } from '@/api';
import { publishDatabaseDeleted } from '@/lib/realtime';
import type { Database } from '@continuum/shared';

const props = defineProps<{
    editable: boolean;
    busy: boolean;
    error: string | null;
}>();

const emit = defineEmits<{
    create: [title: string];
    link: [database: Database];
    delete: [];
}>();

const mode = ref<'choose' | 'create' | 'link'>('choose');
const title = ref('');
const search = ref('');
const databases = ref<Database[]>([]);
const loaded = ref(false);
const linkError = ref<string | null>(null);

const visibleError = computed(() => props.error ?? linkError.value);

async function loadDatabases(): Promise<void> {
    if (loaded.value) return;
    databases.value = await api.databases.list();
    loaded.value = true;
}

onMounted(() => {
    // Pre-fetch lazily so opening the picker feels instant.
});

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return databases.value;
    return databases.value.filter((d) => (d.title || '').toLowerCase().includes(q));
});

function openCreate(): void {
    mode.value = 'create';
}

async function openLink(): Promise<void> {
    mode.value = 'link';
    linkError.value = null;
    try {
        await loadDatabases();
    } catch (err) {
        linkError.value = err instanceof Error ? err.message : 'Could not load databases';
    }
}

function confirmCreate(): void {
    if (props.busy) return;
    const value = title.value.trim() || 'Untitled database';
    emit('create', value);
}

function pick(database: Database): void {
    emit('link', database);
}

// ── Delete an existing database from the link list ───────────────────────
// Hover a row → trash icon → confirm modal → removal + realtime
// broadcast so every other block bound to that DB unbinds.
const deleteTarget = ref<Database | null>(null);
const deleteBusy = ref(false);

const deleteMessage = computed(() => {
    const db = deleteTarget.value;
    return db
        ? `Delete database "${db.title || 'Untitled'}"? All its rows, properties and views will be removed. This cannot be undone.`
        : '';
});

function requestDelete(database: Database, event: MouseEvent): void {
    event.stopPropagation();
    deleteTarget.value = database;
}

async function confirmDelete(): Promise<void> {
    const target = deleteTarget.value;
    if (!target) return;
    deleteBusy.value = true;
    try {
        await api.databases.remove(target.id);
        databases.value = databases.value.filter((d) => d.id !== target.id);
        publishDatabaseDeleted(target.id);
        deleteTarget.value = null;
    } catch (err) {
        linkError.value = err instanceof Error ? err.message : 'Could not delete database';
    } finally {
        deleteBusy.value = false;
    }
}
</script>

<template>
    <div class="db-unbound">
        <div class="db-unbound__head">
            <Icon name="database" />
            <div class="db-unbound__lead">
                <strong>Database</strong>
                <p>Notion-like data source — pick a starting point.</p>
            </div>
            <button
                v-if="editable"
                class="db-unbound__close"
                title="Remove block"
                @click="emit('delete')">
                <Icon name="close" />
            </button>
        </div>

        <p v-if="visibleError" class="db-unbound__error">{{ visibleError }}</p>

        <div v-if="mode === 'choose'" class="db-unbound__choices">
            <UiButton :disabled="!editable" @click="openCreate">
                <Icon name="plus" /> New database
            </UiButton>
            <UiButton variant="ghost" :disabled="!editable" @click="openLink">
                <Icon name="link" /> Link existing
            </UiButton>
        </div>

        <form
            v-else-if="mode === 'create'"
            class="db-unbound__form"
            @submit.prevent="confirmCreate">
            <UiInput
                v-model="title"
                placeholder="Database title"
                autofocus
                :disabled="busy" />
            <div class="db-unbound__actions">
                <UiButton variant="ghost" type="button" @click="mode = 'choose'">Back</UiButton>
                <UiButton type="submit" :disabled="busy">
                    {{ busy ? 'Creating…' : 'Create' }}
                </UiButton>
            </div>
        </form>

        <div v-else class="db-unbound__link">
            <UiInput v-model="search" placeholder="Search databases…" />
            <ul v-if="filtered.length" class="db-unbound__list">
                <li
                    v-for="db in filtered"
                    :key="db.id"
                    class="db-unbound__item"
                    @click="pick(db)">
                    <Icon :name="db.icon ?? 'database'" />
                    <span class="db-unbound__item-label">{{ db.title || 'Untitled' }}</span>
                    <button
                        v-if="editable"
                        type="button"
                        class="db-unbound__item-delete"
                        title="Delete database"
                        @click="requestDelete(db, $event)">
                        <Icon name="trash" :size="12" />
                    </button>
                </li>
            </ul>
            <UiEmpty v-else label="No databases yet" />
            <div class="db-unbound__actions">
                <UiButton variant="ghost" type="button" @click="mode = 'choose'">Back</UiButton>
            </div>
        </div>

        <UiConfirmModal
            :model-value="!!deleteTarget"
            title="Delete database"
            :message="deleteMessage"
            confirm-label="Delete"
            confirm-variant="danger"
            @update:model-value="(v) => { if (!v && !deleteBusy) deleteTarget = null; }"
            @confirm="confirmDelete" />
    </div>
</template>

<style scoped>
.db-unbound {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    color: var(--fg, #ededed);
}

.db-unbound__head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.db-unbound__lead {
    flex: 1;
}

.db-unbound__lead strong {
    display: block;
    font-size: 0.95rem;
}

.db-unbound__lead p {
    margin: 0;
    font-size: 0.8rem;
    color: var(--fg-muted, #a09b90);
}

.db-unbound__close {
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--fg-muted, #a09b90);
    padding: 0.25rem;
    border-radius: 4px;
}

.db-unbound__close:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.04));
}

.db-unbound__error {
    margin: 0;
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-xs, 4px);
    background: var(--danger-faint, rgba(184, 92, 92, 0.08));
    border: var(--border-width-1, 1px) solid var(--danger-border, rgba(184, 92, 92, 0.3));
    color: var(--danger, #b85c5c);
    font-size: var(--text-sm, 0.75rem);
}

.db-unbound__choices,
.db-unbound__actions {
    display: flex;
    gap: 0.5rem;
}

.db-unbound__form,
.db-unbound__link {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.db-unbound__list {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 220px;
    overflow-y: auto;
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
    border-radius: 6px;
}

.db-unbound__item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    cursor: pointer;
    font-size: 0.875rem;
}

.db-unbound__item:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.04));
}

.db-unbound__item-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-unbound__item-delete {
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--fg-muted, #a09b90);
    padding: 0.2rem;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 0.12s ease;
}

.db-unbound__item:hover .db-unbound__item-delete {
    opacity: 1;
}

.db-unbound__item-delete:hover {
    color: var(--danger, #b85c5c);
    background: var(--danger-faint, rgba(184, 92, 92, 0.08));
}
</style>
