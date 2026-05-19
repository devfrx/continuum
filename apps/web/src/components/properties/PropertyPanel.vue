<script setup lang="ts">
/**
 * Inline properties panel for the note page.
 *
 * The panel shows the note's effective schema: database-shared
 * definitions inherited through row memberships plus private note
 * definitions. Values are editable for both; schema-destructive actions
 * (remove/reorder) are intentionally limited to private definitions.
 *
 * Grouping
 * ────────
 * When a note belongs to several databases the flat list becomes
 * verbose, so entries are split into one collapsible section per
 * source:
 *   – "Private" (`scope === 'note'`)
 *   – one per database the note is a row of, labelled with the
 *     database title resolved through `useDatabaseDirectory`.
 *
 * The open/closed state of each section is persisted per note in
 * `localStorage` so navigating between notes preserves the user's
 * preferred layout without making it global.
 */
import { computed, ref, toRef, watch } from 'vue';
import { UiButton, UiConfirmModal } from '@/components/ui';
import Icon from '@/components/ui/Icon.vue';
import { api } from '@/api';
import { useNoteProperties } from '@/composables/useNoteProperties';
import { useDatabaseDirectory } from '@/composables/useDatabaseDirectory';
import { publishNoteUpdated } from '@/lib/realtime/publishers';
import PropertyRow from './PropertyRow.vue';
import PropertyGroupSection from './PropertyGroupSection.vue';
import AddPropertyModal from './AddPropertyModal.vue';
import type { NoteProperty, PropertyValue } from '@continuum/shared';
import type { AppIconName } from '@/assets/icons';

const props = withDefaults(defineProps<{
    noteId: string | null;
    kindId: string | null;
    readonly?: boolean;
}>(), {
    readonly: false,
});

const emit = defineEmits<{ (e: 'select', id: string): void }>();

const noteProps = useNoteProperties(toRef(props, 'noteId'));
const dbDirectory = useDatabaseDirectory();

const showAdd = ref(false);
const pendingDelete = ref<{ id: string; label: string } | null>(null);
const draggedPropertyId = ref<string | null>(null);
const dragOverPropertyId = ref<string | null>(null);
const reorderBusy = ref(false);

const hasNote = computed(() => Boolean(props.noteId && props.kindId));
const privateEntries = computed(() => noteProps.entries.value.filter(isPrivateEntry));
const privateEntryCount = computed(() => privateEntries.value.length);

// ── Grouping ────────────────────────────────────────────────────────

interface PropertyGroup {
    readonly key: string;
    readonly label: string;
    readonly icon: AppIconName;
    readonly entries: NoteProperty[];
    readonly isPrivate: boolean;
}

const groups = computed<PropertyGroup[]>(() => {
    const all = noteProps.entries.value;
    if (!all.length) return [];

    const out: PropertyGroup[] = [];
    const privateRows = all.filter(isPrivateEntry);
    if (privateRows.length) {
        out.push({
            key: 'note',
            label: 'Private',
            icon: 'lock',
            entries: privateRows,
            isPrivate: true,
        });
    }

    // Preserve the order the server returns memberships in so the
    // sections feel stable across refreshes. Some entries carry a
    // `databaseId` not yet listed in `databaseIds` (race during reload)
    // — fall back to declaration order in that case.
    const seen = new Set<string>();
    const orderedDbIds: string[] = [];
    for (const id of noteProps.databaseIds.value) {
        if (!seen.has(id)) {
            seen.add(id);
            orderedDbIds.push(id);
        }
    }
    for (const entry of all) {
        const dbId = entry.definition.databaseId;
        if (dbId && !seen.has(dbId)) {
            seen.add(dbId);
            orderedDbIds.push(dbId);
        }
    }

    for (const dbId of orderedDbIds) {
        const dbEntries = all.filter((entry) => entry.definition.databaseId === dbId);
        if (!dbEntries.length) continue;
        out.push({
            key: `db:${dbId}`,
            label: dbDirectory.displayName(dbId),
            icon: 'database',
            entries: dbEntries,
            isPrivate: false,
        });
    }
    return out;
});

// ── Collapse state, persisted per (note, group) ────────────────────────

const collapseStorageKey = computed(() =>
    props.noteId ? `cont:pp-collapse:${props.noteId}` : null,
);
const groupOpen = ref<Record<string, boolean>>({});

function loadCollapseState(): void {
    const key = collapseStorageKey.value;
    if (!key) {
        groupOpen.value = {};
        return;
    }
    try {
        const raw = localStorage.getItem(key);
        groupOpen.value = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
        groupOpen.value = {};
    }
}

function persistCollapseState(): void {
    const key = collapseStorageKey.value;
    if (!key) return;
    try {
        localStorage.setItem(key, JSON.stringify(groupOpen.value));
    } catch {
        // Storage may be unavailable (private mode) — degrade silently.
    }
}

watch(
    () => props.noteId,
    () => loadCollapseState(),
    { immediate: true },
);

function isGroupOpen(key: string): boolean {
    // Default: every section starts expanded so the panel preserves the
    // legacy flat-list affordance on first visit.
    return groupOpen.value[key] !== false;
}

function setGroupOpen(key: string, open: boolean): void {
    groupOpen.value = { ...groupOpen.value, [key]: open };
    persistCollapseState();
}

// ── Helpers ────────────────────────────────────────────────────────────

function isPrivateEntry(entry: NoteProperty): boolean {
    return entry.definition.scope === 'note';
}

function isPrivateDefinitionId(id: string): boolean {
    return noteProps.entries.value.some((entry) => entry.definition.id === id && isPrivateEntry(entry));
}

function withPrivateOrder(previous: NoteProperty[], nextPrivate: NoteProperty[]): NoteProperty[] {
    const queue = [...nextPrivate];
    return previous.map((entry) => (isPrivateEntry(entry) ? (queue.shift() ?? entry) : entry));
}

async function setValue(propertyId: string, value: PropertyValue): Promise<void> {
    if (props.readonly) return;
    await noteProps.set(propertyId, value);
}

function requestDelete(id: string, label: string): void {
    if (props.readonly) return;
    if (!isPrivateDefinitionId(id)) return;
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
    if (props.noteId) publishNoteUpdated(props.noteId);
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
    if (!isPrivateDefinitionId(id)) return;
    draggedPropertyId.value = id;
    dragOverPropertyId.value = id;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', id);
    }
}

function onPropertyDragOver(id: string, event: DragEvent): void {
    if (props.readonly || reorderBusy.value || !draggedPropertyId.value) return;
    if (!isPrivateDefinitionId(id)) return;
    event.preventDefault();
    dragOverPropertyId.value = id;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

async function onPropertyDrop(id: string, event: DragEvent): Promise<void> {
    if (props.readonly || reorderBusy.value || !props.noteId || !draggedPropertyId.value) return;
    if (!isPrivateDefinitionId(id) || !isPrivateDefinitionId(draggedPropertyId.value)) return;
    event.preventDefault();
    const fromId = draggedPropertyId.value;
    clearDragState();
    if (fromId === id) return;

    const previous = [...noteProps.entries.value];
    const previousPrivate = previous.filter(isPrivateEntry);
    const nextPrivate = moveEntry(previousPrivate, fromId, id);
    if (nextPrivate === previousPrivate) return;

    const next = withPrivateOrder(previous, nextPrivate);
    noteProps.entries.value = next;
    reorderBusy.value = true;
    try {
        await noteProps.reorderDefinitions(
            nextPrivate.map((entry) => entry.definition.id),
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
            <div v-if="groups.length" class="pp-groups" :class="{ 'is-reordering': reorderBusy }">
                <PropertyGroupSection
                    v-for="group in groups"
                    :key="group.key"
                    :label="group.label"
                    :icon="group.icon"
                    :count="group.entries.length"
                    :open="isGroupOpen(group.key)"
                    @update:open="(value) => setGroupOpen(group.key, value)"
                >
                    <PropertyRow
                        v-for="entry in group.entries"
                        :key="entry.definition.id"
                        :entry="entry"
                        :note-id="props.noteId"
                        :readonly="readonly"
                        :can-remove="group.isPrivate"
                        :reorderable="!readonly && group.isPrivate && privateEntryCount > 1 && !reorderBusy"
                        :drag-active="draggedPropertyId === entry.definition.id"
                        :drop-target="dragOverPropertyId === entry.definition.id && draggedPropertyId !== entry.definition.id"
                        @drag-start="onPropertyDragStart(entry.definition.id, $event)"
                        @drag-over="onPropertyDragOver(entry.definition.id, $event)"
                        @drop="onPropertyDrop(entry.definition.id, $event)"
                        @drag-end="clearDragState"
                        @update:value="setValue(entry.definition.id, $event)"
                        @clear:value="noteProps.clear(entry.definition.id)"
                        @select="emit('select', $event)"
                        @reload="noteProps.reload()"
                        @remove="requestDelete(entry.definition.id, entry.definition.label)"
                    />
                </PropertyGroupSection>
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

.pp-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) 0;
}

.pp-groups.is-reordering {
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