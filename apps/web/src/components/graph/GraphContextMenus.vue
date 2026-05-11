<script setup lang="ts">
/**
 * Bundles the four declarative modals + the context menu so the
 * shell only has to wire one component:
 *  - UiContextMenu (right-click on a graph node)
 *  - UiPromptModal (rename note)
 *  - UiConfirmModal (delete note)
 *  - UiNotePickerModal (link from graph)
 *  - NoteCreateModal (graph "New note" CTA)
 *
 * State is passed in via v-model bindings; user actions emit out.
 */
import {
    UiConfirmModal,
    UiContextMenu,
    UiNotePickerModal,
    UiPromptModal,
    type ContextMenuItem as UiContextMenuItem,
} from '@/components/ui';
import NoteCreateModal from '@/components/notes/NoteCreateModal.vue';
import type { EntityKind } from '@continuum/shared';

interface CreateNotePayload {
    title: string;
    kind: EntityKind;
    content: string;
    folderId: string | null;
}
interface NotePickerEntry {
    id: string;
    label: string;
    kind?: string;
    disabled?: boolean;
}

interface ContextMenuState {
    visible: boolean;
    x: number;
    y: number;
    nodeId: string | null;
    highlighted: boolean;
}
interface RenameState {
    open: boolean;
    nodeId: string;
    initial: string;
}
interface DeleteState {
    open: boolean;
    nodeId: string;
    label: string;
}
interface LinkState {
    open: boolean;
    sourceId: string;
    sourceLabel: string;
    entries: NotePickerEntry[];
}

interface Props {
    contextMenu: ContextMenuState;
    contextMenuItems: UiContextMenuItem[];
    renameModal: RenameState;
    deleteModal: DeleteState;
    linkModal: LinkState;
    linkBusy: boolean;
    graphCreateOpen: boolean;
    graphCreateBusy: boolean;
    graphCreateError: string;
}
defineProps<Props>();

const emit = defineEmits<{
    'set-context-menu-open': [open: boolean];
    'update:rename-open': [open: boolean];
    'submit-rename': [value: string];
    'update:delete-open': [open: boolean];
    'confirm-delete': [];
    'update:link-open': [open: boolean];
    'submit-links': [targets: string[]];
    'submit-graph-create': [submission: CreateNotePayload];
    'update:graph-create-open': [open: boolean];
}>();
</script>

<template>
    <div>
        <UiContextMenu :model-value="contextMenu.visible" :x="contextMenu.x" :y="contextMenu.y"
            :items="contextMenuItems" :min-width="224" @update:model-value="emit('set-context-menu-open', $event)" />

        <UiPromptModal :model-value="renameModal.open" title="Rename note" label="Title" placeholder="Note title"
            :initial-value="renameModal.initial" confirm-label="Rename"
            @update:model-value="emit('update:rename-open', $event)" @submit="emit('submit-rename', $event)" />

        <UiConfirmModal :model-value="deleteModal.open" title="Delete note"
            :message="`Delete note “${deleteModal.label}”? This cannot be undone.`" confirm-label="Delete"
            confirm-variant="danger" @update:model-value="emit('update:delete-open', $event)"
            @confirm="emit('confirm-delete')" />

        <UiNotePickerModal :model-value="linkModal.open"
            :title="linkModal.sourceLabel ? `Link “${linkModal.sourceLabel}” to…` : 'Link notes'"
            :entries="linkModal.entries" :confirm-label="linkBusy ? 'Linking…' : 'Create links'"
            @update:model-value="emit('update:link-open', $event)" @submit="emit('submit-links', $event)" />

        <NoteCreateModal :model-value="graphCreateOpen" :busy="graphCreateBusy" :error="graphCreateError"
            context="graph" @update:model-value="emit('update:graph-create-open', $event)"
            @submit="emit('submit-graph-create', $event)" />
    </div>
</template>
