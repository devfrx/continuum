<script setup lang="ts">
/**
 * Placeholder shown when a `database` block has no views yet.
 *
 * Offers the two paths the user needs the first time they insert the
 * block:
 *
 *   1. Create a brand-new datasource (title input).
 *   2. Link an existing datasource from a small searchable list.
 *
 * The parent embed turns the chosen datasource into the block's first
 * view (defaulting to a Table), which flips the block out of unbound
 * state. The picker itself is intentionally datasource-aware only:
 * the view type is decided by the parent so the picker stays simple
 * and consistent with the "first view is always a Table" UX.
 *
 * Datasources can also be deleted from this list (trash icon on
 * hover): a hard delete cascades to every block view that points at
 * them, which is fine because the realtime bus pushes
 * `database.deleted` to all open blocks.
 */
import { computed, ref } from 'vue';
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
const datasources = ref<Database[]>([]);
const loaded = ref(false);
const linkError = ref<string | null>(null);

const visibleError = computed(() => props.error ?? linkError.value);

async function loadDatasources(): Promise<void> {
    if (loaded.value) return;
    datasources.value = await api.databases.list();
    loaded.value = true;
}

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return datasources.value;
    return datasources.value.filter((d) => (d.title || '').toLowerCase().includes(q));
});

function openCreate(): void {
    mode.value = 'create';
}

async function openLink(): Promise<void> {
    mode.value = 'link';
    linkError.value = null;
    try {
        await loadDatasources();
    } catch (err) {
        linkError.value = err instanceof Error ? err.message : 'Could not load datasources';
    }
}

function confirmCreate(): void {
    if (props.busy) return;
    const value = title.value.trim() || 'Untitled datasource';
    emit('create', value);
}

function pick(database: Database): void {
    emit('link', database);
}

// ── Delete an existing datasource from the link list ─────────────────────
const deleteTarget = ref<Database | null>(null);
const deleteBusy = ref(false);

const deleteMessage = computed(() => {
    const db = deleteTarget.value;
    return db
        ? `Delete datasource "${db.title || 'Untitled'}"? Every block view bound to it (in this and other notes) will disappear too. This cannot be undone.`
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
        datasources.value = datasources.value.filter((d) => d.id !== target.id);
        publishDatabaseDeleted(target.id);
        deleteTarget.value = null;
    } catch (err) {
        linkError.value = err instanceof Error ? err.message : 'Could not delete datasource';
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
                <p>Pick a datasource to view here.</p>
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
                <Icon name="plus" /> New datasource
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
                placeholder="Datasource title"
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
            <UiInput v-model="search" placeholder="Search datasources…" />
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
                        title="Delete datasource"
                        @click="requestDelete(db, $event)">
                        <Icon name="trash" :size="12" />
                    </button>
                </li>
            </ul>
            <UiEmpty v-else label="No datasources yet" />
            <div class="db-unbound__actions">
                <UiButton variant="ghost" type="button" @click="mode = 'choose'">Back</UiButton>
            </div>
        </div>

        <UiConfirmModal
            :model-value="!!deleteTarget"
            title="Delete datasource"
            :message="deleteMessage"
            confirm-label="Delete"
            confirm-variant="danger"
            @update:model-value="(v) => { if (!v && !deleteBusy) deleteTarget = null; }"
            @confirm="confirmDelete" />
    </div>
</template>

<style scoped>
.db-unbound {
    padding: var(--space-5);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    color: var(--text-primary);
    background: var(--surface-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
}

.db-unbound__head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
}

.db-unbound__lead {
    flex: 1;
    min-width: 0;
}
.db-unbound__lead strong {
    display: block;
    font-size: var(--text-md);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    margin-bottom: var(--space-1);
}
.db-unbound__lead p {
    margin: 0;
    font-size: var(--text-xs);
    line-height: var(--leading-snug, 1.4);
    color: var(--text-secondary);
}

.db-unbound__close {
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}
.db-unbound__close:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
}

.db-unbound__error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--danger-faint);
    border: var(--border-width-1) solid var(--danger-border);
    color: var(--danger);
    font-size: var(--text-xs);
}

.db-unbound__choices,
.db-unbound__actions {
    display: flex;
    gap: var(--space-2);
}

.db-unbound__form,
.db-unbound__link {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.db-unbound__list {
    list-style: none;
    padding: var(--space-1);
    margin: 0;
    max-height: 220px;
    overflow-y: auto;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-0);
}

.db-unbound__item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    transition: background-color var(--duration-fast) var(--ease-standard);
}
.db-unbound__item:hover {
    background: var(--surface-hover);
}

.db-unbound__item-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-unbound__item-delete {
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    opacity: 0;
    transition:
        opacity var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}
.db-unbound__item:hover .db-unbound__item-delete {
    opacity: 1;
}
.db-unbound__item-delete:hover {
    color: var(--danger);
    background: var(--danger-faint);
}
</style>
