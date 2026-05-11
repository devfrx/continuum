/**
 * Note-mutation actions invoked from the graph view (rename, delete,
 * link, create, export). Owns the modal state, calls the notes API,
 * mutates the live Sigma graph in-place, then refreshes.
 */
import { reactive, ref, type Ref } from 'vue';
import { type Graph } from '@continuum/graph';
import { api } from '@/api';
import type { EntityKind } from '@continuum/shared';
import type { UseGraphSelectionReturn } from './useGraphSelection';
import type { UseGraphPreferencesReturn } from './useGraphPreferences';

export interface CreateNotePayload {
  title: string;
  kind: EntityKind;
  content: string;
  folderId: string | null;
}

export interface NotePickerEntry {
  id: string;
  label: string;
  kind?: string;
  disabled?: boolean;
}

export interface RenameModalState {
  open: boolean;
  nodeId: string;
  initial: string;
}
export interface DeleteModalState {
  open: boolean;
  nodeId: string;
  label: string;
}
export interface LinkModalState {
  open: boolean;
  sourceId: string;
  sourceLabel: string;
  alreadyLinked: Set<string>;
  entries: NotePickerEntry[];
}

export interface UseGraphNoteActionsOptions {
  graphRef: Ref<Graph | null>;
  selection: UseGraphSelectionReturn;
  prefs: UseGraphPreferencesReturn;
  refresh: () => void;
  reload: () => Promise<void>;
  openNote: (id: string) => void;
  onError: (action: string, err: unknown) => void;
  /** Called after a successful delete to keep stats in sync. */
  syncStats: () => void;
}

export interface UseGraphNoteActionsReturn {
  renameModal: RenameModalState;
  deleteModal: DeleteModalState;
  linkModal: LinkModalState;
  linkBusy: Ref<boolean>;
  graphCreateOpen: Ref<boolean>;
  graphCreateBusy: Ref<boolean>;
  graphCreateError: Ref<string>;

  beginRename: (nodeId: string) => void;
  submitRename: (title: string) => Promise<void>;
  beginDelete: (nodeId: string) => void;
  confirmDelete: () => Promise<void>;
  openLinkModalFor: (nodeId: string) => void;
  submitLinks: (targetIds: string[]) => Promise<void>;
  openGraphCreate: () => void;
  submitGraphCreate: (payload: CreateNotePayload) => Promise<void>;
}

export function useGraphNoteActions(opts: UseGraphNoteActionsOptions): UseGraphNoteActionsReturn {
  const renameModal = reactive<RenameModalState>({ open: false, nodeId: '', initial: '' });
  const deleteModal = reactive<DeleteModalState>({ open: false, nodeId: '', label: '' });
  const linkModal = reactive<LinkModalState>({
    open: false,
    sourceId: '',
    sourceLabel: '',
    alreadyLinked: new Set<string>(),
    entries: [],
  });
  const linkBusy = ref(false);
  const graphCreateOpen = ref(false);
  const graphCreateBusy = ref(false);
  const graphCreateError = ref('');

  function beginRename(nodeId: string): void {
    const g = opts.graphRef.value;
    if (!g || !g.hasNode(nodeId)) return;
    renameModal.nodeId = nodeId;
    renameModal.initial = String(g.getNodeAttribute(nodeId, 'label') ?? '');
    renameModal.open = true;
  }

  async function submitRename(title: string): Promise<void> {
    const id = renameModal.nodeId;
    const g = opts.graphRef.value;
    if (!id || !g) return;
    const next = title.trim();
    if (!next || next === renameModal.initial) return;
    try {
      await api.notes.update(id, { title: next });
      if (g.hasNode(id)) g.setNodeAttribute(id, 'label', next);
      if (opts.selection.selected.value && opts.selection.selected.value.id === id) {
        opts.selection.selected.value.label = next;
      }
      opts.refresh();
    } catch (err) {
      opts.onError('Rename failed', err);
    }
  }

  function beginDelete(nodeId: string): void {
    const g = opts.graphRef.value;
    if (!g || !g.hasNode(nodeId)) return;
    deleteModal.nodeId = nodeId;
    deleteModal.label = String(g.getNodeAttribute(nodeId, 'label') ?? '(untitled)');
    deleteModal.open = true;
  }

  async function confirmDelete(): Promise<void> {
    const id = deleteModal.nodeId;
    const g = opts.graphRef.value;
    if (!id || !g) return;
    try {
      await api.notes.remove(id);
      if (g.hasNode(id)) g.dropNode(id);
      if (opts.selection.selected.value && opts.selection.selected.value.id === id) {
        opts.selection.selected.value = null;
      }
      const nextSet = new Set(opts.prefs.highlightedIds.value);
      nextSet.delete(id);
      opts.prefs.highlightedIds.value = nextSet;
      opts.prefs.saveHighlights();
      opts.syncStats();
      opts.refresh();
    } catch (err) {
      opts.onError('Delete failed', err);
    }
  }

  /**
   * Snapshots every other node in the graph and pre-disables those
   * that already have an outbound edge from the source — duplicate
   * links are noise.
   */
  function openLinkModalFor(id: string): void {
    const g = opts.graphRef.value;
    if (!g || !g.hasNode(id)) return;

    const already = new Set<string>();
    g.forEachOutEdge(id, (_edge, _attrs, _src, tgt: string) => already.add(tgt));

    const entries: NotePickerEntry[] = [];
    g.forEachNode((nid: string, attrs: unknown) => {
      if (nid === id) return;
      entries.push({
        id: nid,
        label: String((attrs as { label?: string }).label ?? '(untitled)'),
        kind: String((attrs as { kind?: string }).kind ?? 'custom'),
        disabled: already.has(nid),
      });
    });
    entries.sort((a, b) => a.label.localeCompare(b.label));

    linkModal.sourceId = id;
    linkModal.sourceLabel = String(g.getNodeAttribute(id, 'label') ?? '');
    linkModal.alreadyLinked = already;
    linkModal.entries = entries;
    linkModal.open = true;
  }

  /**
   * Persist the user's selections by appending real wikilinks
   * (`[[Target Title]]`) to the source note's body. The server's
   * `syncWikilinks` hook then materialises the corresponding rows in
   * the `links` table with `type='wikilink'`, so the new edges show
   * up in the graph *and* the wikilinks are visible inside the note
   * — exactly the same shape as links typed by hand.
   */
  async function submitLinks(targetIds: string[]): Promise<void> {
    const sourceId = linkModal.sourceId;
    if (!sourceId || targetIds.length === 0) return;
    linkBusy.value = true;
    try {
      const labelById = new Map<string, string>();
      for (const e of linkModal.entries) labelById.set(e.id, e.label);
      const source = await api.notes.get(sourceId);
      const wikilinks = targetIds
        .map((id) => labelById.get(id) ?? '')
        .filter(Boolean)
        .map((label) => `[[${label}]]`)
        .join(' ');
      if (!wikilinks) return;
      const existing = (source.content ?? '').trimEnd();
      const separator = existing.length > 0 ? '\n\n' : '';
      const nextContent = `${existing}${separator}<p>${wikilinks}</p>`;
      await api.notes.update(sourceId, { content: nextContent });
      // syncWikilinks runs server-side; reload to pick up the new edges.
      await opts.reload();
    } catch (err) {
      opts.onError('Linking failed', err);
    } finally {
      linkBusy.value = false;
    }
  }

  function openGraphCreate(): void {
    graphCreateError.value = '';
    graphCreateOpen.value = true;
  }

  async function submitGraphCreate(payload: CreateNotePayload): Promise<void> {
    graphCreateBusy.value = true;
    graphCreateError.value = '';
    try {
      const created = await api.notes.create(payload);
      graphCreateOpen.value = false;
      await opts.reload();
      opts.openNote(created.id);
    } catch (err) {
      graphCreateError.value = err instanceof Error ? err.message : String(err);
      console.error('Failed to create note from graph view', err);
    } finally {
      graphCreateBusy.value = false;
    }
  }

  return {
    renameModal,
    deleteModal,
    linkModal,
    linkBusy,
    graphCreateOpen,
    graphCreateBusy,
    graphCreateError,
    beginRename,
    submitRename,
    beginDelete,
    confirmDelete,
    openLinkModalFor,
    submitLinks,
    openGraphCreate,
    submitGraphCreate,
  };
}
