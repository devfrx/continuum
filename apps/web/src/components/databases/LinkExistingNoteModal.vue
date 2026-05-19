<script setup lang="ts">
/**
 * Link-existing-note flow — picker + merge confirmation.
 *
 * Sits one level above {@link MergeSchemaModal}. The picker lets the
 * user pick any note in the workspace that isn't already a row of the
 * target database; once picked we fetch the merge preview and hand off
 * to `MergeSchemaModal`. On confirm we POST `resolveLink`, then publish
 * the realtime invalidations so every open surface refreshes.
 *
 *   1. Picker: simple textbox + filtered list (api.notes.list). 1k-note
 *      workspaces fit in memory; if scale demands it later, swap to
 *      `api.notes.search`.
 *   2. Preview is fetched eagerly on selection; failures show inline.
 *   3. MergeSchemaModal renders the preview and asks the user for one
 *      action per collision.
 *   4. On confirm → resolveLink → realtime publish → emit('done', row).
 */
import { computed, ref, watch } from 'vue';
import UiModal from '@/components/ui/UiModal.vue';
import UiButton from '@/components/ui/UiButton.vue';
import UiInput from '@/components/ui/UiInput.vue';
import Icon from '@/components/ui/Icon.vue';
import MergeSchemaModal from './MergeSchemaModal.vue';
import { api } from '@/api';
import {
    publishDatabaseRowsChanged,
    publishDatabaseSchemaChanged,
    publishNoteUpdated,
} from '@/lib/realtime/publishers';
import type {
    DatabaseRow,
    Note,
    PropertyMergePreview,
    PropertyMergeResolutionEntry,
} from '@continuum/shared';

interface Props {
    modelValue: boolean;
    databaseId: string;
    databaseName: string;
    /** Notes already linked to this database; filtered out of the picker. */
    excludeNoteIds: string[];
}

const props = defineProps<Props>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    /** Emitted after a successful resolveLink so parent can refresh. */
    done: [payload: { row: DatabaseRow; noteId: string }];
    cancel: [];
}>();

const notes = ref<Note[]>([]);
const notesLoading = ref(false);
const notesError = ref<string | null>(null);
const query = ref('');

const selectedNote = ref<Note | null>(null);
const preview = ref<PropertyMergePreview | null>(null);
const previewLoading = ref(false);
const previewError = ref<string | null>(null);

const resolving = ref(false);
const resolveError = ref<string | null>(null);

const excludeSet = computed(() => new Set(props.excludeNoteIds));

const filteredNotes = computed(() => {
    const q = query.value.trim().toLowerCase();
    return notes.value
        .filter((n) => !excludeSet.value.has(n.id))
        .filter((n) => (q ? n.title.toLowerCase().includes(q) : true))
        .slice(0, 100);
});

async function loadNotes(): Promise<void> {
    notesLoading.value = true;
    notesError.value = null;
    try {
        notes.value = await api.notes.list();
    } catch (err) {
        notesError.value = err instanceof Error ? err.message : 'Failed to load notes';
    } finally {
        notesLoading.value = false;
    }
}

watch(
    () => props.modelValue,
    (open) => {
        if (!open) {
            // Reset on close so reopening doesn't leak prior state.
            query.value = '';
            selectedNote.value = null;
            preview.value = null;
            previewError.value = null;
            resolveError.value = null;
            return;
        }
        void loadNotes();
    },
    { immediate: true },
);

async function selectNote(note: Note): Promise<void> {
    selectedNote.value = note;
    preview.value = null;
    previewError.value = null;
    previewLoading.value = true;
    try {
        preview.value = await api.databases.rows.previewLink(props.databaseId, note.id);
    } catch (err) {
        previewError.value = err instanceof Error ? err.message : 'Failed to preview merge';
    } finally {
        previewLoading.value = false;
    }
}

async function onMergeConfirm(resolutions: PropertyMergeResolutionEntry[]): Promise<void> {
    const note = selectedNote.value;
    if (!note) return;
    resolving.value = true;
    resolveError.value = null;
    try {
        const result = await api.databases.rows.resolveLink(props.databaseId, {
            noteId: note.id,
            resolutions,
        });
        // Fan-out the invalidations: rows for views, schema for any
        // property panel listening, and the note itself in case its
        // effective properties changed.
        publishDatabaseRowsChanged(props.databaseId, { rowNoteId: note.id });
        publishDatabaseSchemaChanged(props.databaseId);
        publishNoteUpdated(note.id);
        emit('done', result);
        emit('update:modelValue', false);
    } catch (err) {
        resolveError.value = err instanceof Error ? err.message : 'Failed to link note';
    } finally {
        resolving.value = false;
    }
}

function onMergeCancel(): void {
    // Go back to the picker (preview cleared) rather than dismissing
    // the whole flow — user may want to try a different note.
    selectedNote.value = null;
    preview.value = null;
    previewError.value = null;
}

function onClose(): void {
    emit('cancel');
    emit('update:modelValue', false);
}

const showPicker = computed(() => !selectedNote.value || !preview.value);
</script>

<template>
    <!-- Stage 1: note picker -->
    <UiModal v-if="showPicker" :model-value="modelValue" title="Link existing note" size="md"
        @update:model-value="(v) => emit('update:modelValue', v)" @close="onClose">
        <div class="link-note">
            <UiInput v-model="query" placeholder="Search notes by title…" />
            <div v-if="notesLoading" class="link-note__state">Loading notes…</div>
            <div v-else-if="notesError" class="link-note__state link-note__state--error">
                {{ notesError }}
            </div>
            <div v-else-if="filteredNotes.length === 0" class="link-note__state">
                No matching notes available.
            </div>
            <ul v-else class="link-note__list">
                <li v-for="note in filteredNotes" :key="note.id">
                    <button type="button" class="link-note__item" @click="selectNote(note)"
                        :disabled="previewLoading">
                        <Icon name="file" :size="13" />
                        <span class="link-note__title">{{ note.title || 'Untitled' }}</span>
                        <span class="link-note__kind">{{ note.kind }}</span>
                    </button>
                </li>
            </ul>
            <p v-if="previewError" class="link-note__error" role="alert">
                {{ previewError }}
            </p>
            <p v-if="previewLoading && selectedNote" class="link-note__state">
                Computing merge for "{{ selectedNote.title }}"…
            </p>
        </div>
        <template #footer>
            <UiButton variant="ghost" size="sm" @click="onClose">Cancel</UiButton>
        </template>
    </UiModal>

    <!-- Stage 2: merge confirmation -->
    <MergeSchemaModal v-else-if="preview && selectedNote" :model-value="modelValue"
        :preview="preview" :database-name="databaseName" :note-title="selectedNote.title || 'Untitled'"
        :busy="resolving" :error-message="resolveError"
        @update:model-value="(v) => emit('update:modelValue', v)"
        @confirm="onMergeConfirm" @cancel="onMergeCancel" />
</template>

<style scoped>
.link-note {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    max-height: 60vh;
}

.link-note__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    overflow-y: auto;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    padding: 4px;
    max-height: 360px;
}

.link-note__item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--fg);
    cursor: pointer;
    text-align: left;
    font-size: var(--text-sm);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.link-note__item:hover:not(:disabled) {
    background: var(--bg-soft);
}

.link-note__item:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.link-note__title {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.link-note__kind {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    text-transform: lowercase;
}

.link-note__state {
    font-size: var(--text-sm);
    color: var(--fg-muted);
    padding: var(--space-2);
    text-align: center;
}

.link-note__state--error {
    color: color-mix(in srgb, var(--danger, #e03131) 90%, var(--fg));
}

.link-note__error {
    margin: 0;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--danger, #e03131) 12%, transparent);
    color: color-mix(in srgb, var(--danger, #e03131) 90%, var(--fg));
    font-size: var(--text-xs);
}
</style>
