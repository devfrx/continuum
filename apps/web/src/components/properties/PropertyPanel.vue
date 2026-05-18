<script setup lang="ts">
/**
 * Inline properties panel for the note page.
 *
 * Each note owns its own property schema (per-note definitions): the
 * panel shows every definition attached to the note and its current
 * value, then lets the user edit, add, reorder or remove them. Adding a
 * property here never affects sibling notes — the kind-scoped path is
 * reserved for the future Templates feature.
 */
import { computed, ref, toRef } from 'vue';
import { UiButton, UiConfirmModal } from '@/components/ui';
import Icon from '@/components/ui/Icon.vue';
import { api } from '@/api';
import { useNoteProperties } from '@/composables/useNoteProperties';
import PropertyRow from './PropertyRow.vue';
import AddPropertyModal from './AddPropertyModal.vue';
import type { NoteProperty, PropertyValue } from '@continuum/shared';

const props = withDefaults(defineProps<{
    noteId: string | null;
    kindId: string | null;
    readonly?: boolean;
}>(), {
    readonly: false,
});

const emit = defineEmits<{ (e: 'select', id: string): void }>();

const noteProps = useNoteProperties(toRef(props, 'noteId'));

const showAdd = ref(false);
const pendingDelete = ref<{ id: string; label: string } | null>(null);
const draggedPropertyId = ref<string | null>(null);
const dragOverPropertyId = ref<string | null>(null);
const reorderBusy = ref(false);

const hasNote = computed(() => Boolean(props.noteId && props.kindId));

async function setValue(propertyId: string, value: PropertyValue): Promise<void> {
    if (props.readonly) return;
    await noteProps.set(propertyId, value);
}

function requestDelete(id: string, label: string): void {
    if (props.readonly) return;
    pendingDelete.value = { id, label };
}

function onDeleteOpenChange(open: boolean): void {
    if (!open) pendingDelete.value = null;
}

async function confirmDelete(): Promise<void> {
    if (props.readonly) return;
    if (!pendingDelete.value) return;
    const id = pendingDelete.value.id;
    pendingDelete.value = null;
    await api.properties.remove(id);
    await noteProps.reload();
}

async function onCreated(): Promise<void> {
    if (props.readonly) return;
    await noteProps.reload();
}

function moveEntry(entries: NoteProperty[], fromId: string, toId: string): NoteProperty[] {
    const fromIndex = entries.findIndex((entry) => entry.definition.id === fromId);
    const toIndex = entries.findIndex((entry) => entry.definition.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return entries;
    const next = [...entries];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return entries;
    next.splice(toIndex, 0, moved);
    return next;
}

function onPropertyDragStart(id: string, event: DragEvent): void {
    if (props.readonly || reorderBusy.value) return;
    draggedPropertyId.value = id;
    dragOverPropertyId.value = id;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
    }
}

function onPropertyDragOver(id: string, event: DragEvent): void {
    if (props.readonly || reorderBusy.value || !draggedPropertyId.value) return;
    event.preventDefault();
    dragOverPropertyId.value = id;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

async function onPropertyDrop(id: string, event: DragEvent): Promise<void> {
    if (props.readonly || reorderBusy.value || !props.noteId || !draggedPropertyId.value) return;
    event.preventDefault();
    const fromId = draggedPropertyId.value;
    clearDragState();
    if (fromId === id) return;

    const previous = [...noteProps.entries.value];
    const next = moveEntry(previous, fromId, id);
    if (next === previous) return;

    noteProps.entries.value = next;
    reorderBusy.value = true;
    try {
        await noteProps.reorderDefinitions(
            next.map((entry) => entry.definition.id),
        );
    } catch (err) {
        noteProps.entries.value = previous;
        throw err;
    } finally {
        reorderBusy.value = false;
    }
}

function clearDragState(): void {
    draggedPropertyId.value = null;
    dragOverPropertyId.value = null;
}
</script>

<template>
    <div class="pp" :class="{ 'is-readonly': readonly }">
        <template v-if="!hasNote">
            <p class="pp-empty-msg">Select a note to edit its properties.</p>
        </template>
        <template v-else>
            <div v-if="noteProps.entries.value.length" class="pp-list" :class="{ 'is-reordering': reorderBusy }">
                <PropertyRow v-for="entry in noteProps.entries.value" :key="entry.definition.id" :entry="entry"
                    :note-id="props.noteId"
                    :readonly="readonly" :reorderable="!readonly && noteProps.entries.value.length > 1 && !reorderBusy"
                    :drag-active="draggedPropertyId === entry.definition.id"
                    :drop-target="dragOverPropertyId === entry.definition.id && draggedPropertyId !== entry.definition.id"
                    @drag-start="onPropertyDragStart(entry.definition.id, $event)"
                    @drag-over="onPropertyDragOver(entry.definition.id, $event)"
                    @drop="onPropertyDrop(entry.definition.id, $event)"
                    @drag-end="clearDragState"
                    @update:value="setValue(entry.definition.id, $event)"
                    @select="emit('select', $event)"
                    @reload="noteProps.reload()"
                    @remove="requestDelete(entry.definition.id, entry.definition.label)" />
            </div>
            <p v-else-if="noteProps.loaded.value && !readonly" class="pp-empty-msg">
                No properties yet. Add the first one to start tracking metadata.
            </p>
            <p v-else-if="noteProps.loaded.value" class="pp-empty-msg">
                No properties on this note.
            </p>
            <p v-else class="pp-empty-msg">Loading...</p>

            <UiButton v-if="!readonly" variant="ghost" size="sm" class="pp-add" @click="showAdd = true">
                <Icon name="plus" :size="12" />
                <span>Add property</span>
            </UiButton>
        </template>

        <AddPropertyModal v-if="!readonly && noteId" v-model="showAdd" :noteId="noteId" :kindId="kindId"
            @created="onCreated" />

        <UiConfirmModal :model-value="pendingDelete !== null" title="Delete property?"
            :message="`Remove '${pendingDelete?.label}' from this note? This cannot be undone.`"
            confirm-label="Delete" confirm-variant="danger" @update:model-value="onDeleteOpenChange"
            @confirm="confirmDelete" @cancel="pendingDelete = null" />
    </div>
</template>

<style scoped>
.pp {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: 100%;
}

.pp-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
    padding: var(--space-1) 0;
}

.pp-list.is-reordering {
    cursor: wait;
}

.pp-empty-msg {
    margin: 0;
    padding: var(--space-2) 0;
    color: var(--fg-subtle);
    font-size: var(--text-xs);
}

.pp-add {
    margin-top: calc(var(--space-1) * -1);
    align-self: flex-start;
}
</style>