<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { ContinuumEditor, type IconCatalogEntry } from '@continuum/editor';
import { api, type BacklinkEntry } from '@/api';
import type { AiSearchHit, Note, EntityKind, FolderNode, ContextMenuItem } from '@continuum/shared';
import NotesSidebar from '@/components/notes/NotesSidebar.vue';
import NoteEditorHeader from '@/components/notes/NoteEditorHeader.vue';
import NoteCreateModal from '@/components/notes/NoteCreateModal.vue';
import NoteInlineProperties from '@/components/notes/NoteInlineProperties.vue';
import NoteDetailsFooter from '@/components/notes/NoteDetailsFooter.vue';
import NoteFootnotesPanel from '@/components/notes/NoteFootnotesPanel.vue';
import EmptyEditor from '@/components/notes/EmptyEditor.vue';
import { FolderForm } from '@/components/folders';
import { UiConfirmModal, UiContextMenu, UiSelect, Icon, type ContextMenuItem as UiContextMenuItem } from '@/components/ui';
import { ICONS, type AppIconName } from '@/assets/icons';
import { useAiHealth } from '@/composables/useAiHealth';
import { useFolders } from '@/composables/useFolders';
import { removeFolder } from '@/composables/foldersApi';
import { useRecentNotes } from '@/composables/useRecentNotes';
import { usePromptModal } from '@/composables/usePromptModal';

const route = useRoute();
const router = useRouter();
const { embeddingsAvailable } = useAiHealth();
const folders = useFolders();
const recentNotes = useRecentNotes();
const { requestPrompt } = usePromptModal();

type SearchMode = 'filter' | 'semantic';
type EditorMode = 'wysiwyg' | 'markdown';

// --- State ---
const notes = ref<Note[]>([]);
const selectedId = ref<string | null>(null);

const draftTitle = ref('');
const draftKind = ref<EntityKind>('note');
const draftContent = ref('');
const draftJson = ref<unknown>(null);
const draftTags = ref<string[]>([]);
/**
 * Mirror of the persisted `Note.locked` flag for the currently selected
 * note. Toggling this updates the server immediately (see `onLockToggle`)
 * and gates both the auto-save debounce and the editor's `editable` prop
 * — a defence-in-depth strategy that pairs with the 423 response from
 * the API for stale clients.
 */
const draftLocked = ref<boolean>(false);

const search = ref('');
const searchMode = ref<SearchMode>('filter');
const semanticHits = ref<AiSearchHit[]>([]);
const semanticBusy = ref(false);
const createNoteOpen = ref(false);
const createNoteBusy = ref(false);
const createNoteError = ref('');
const isDev = import.meta.env.DEV;
const seedNotesBusy = ref(false);
const seedNotesError = ref('');

interface SemanticSeedTemplate {
  key: string;
  title: string;
  kind: EntityKind;
  tags: readonly string[];
  body: readonly string[];
  links: readonly string[];
  searchHints: readonly string[];
}

interface SemanticSeedDraft {
  index: number;
  batchId: string;
  template: SemanticSeedTemplate;
  title: string;
  folderId: string | null;
}

/**
 * Lazy-load the dev-only seed corpus. The dynamic `import()` is gated on
 * `import.meta.env.DEV` so the ~850-line dataset is excluded from the
 * production bundle entirely.
 */
const loadSeedTemplates = async (): Promise<readonly SemanticSeedTemplate[]> => {
  if (!import.meta.env.DEV) return [];
  const mod = await import('@/dev/seedTemplates');
  return mod.longTermSeedTemplates as readonly SemanticSeedTemplate[];
};

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let currentIndex = copy.length - 1; currentIndex > 0; currentIndex -= 1) {
    const randomIndex = Math.floor(Math.random() * (currentIndex + 1));
    [copy[currentIndex], copy[randomIndex]] = [copy[randomIndex], copy[currentIndex]];
  }
  return copy;
}

function seedFolderFor(kind: EntityKind, index: number): string | null {
  if (selectedFolderId.value) return selectedFolderId.value;
  const availableFolders = folders.flat.value;
  if (availableFolders.length === 0) return null;
  const matchingFolders = availableFolders.filter(
    (folder) => folders.effectiveFor(folder.id).defaultKind === kind,
  );
  const pool = matchingFolders.length > 0 ? matchingFolders : availableFolders;
  return pool[index % pool.length]?.id ?? null;
}

function seedTags(template: SemanticSeedTemplate, batchId: string): string[] {
  return Array.from(new Set([
    'dev-semantic',
    'linked-corpus',
    'long-lived-archive',
    `batch-${batchId}`,
    template.kind,
    ...template.tags,
  ]));
}

function buildSeedTitle(template: SemanticSeedTemplate, batchId: string, index: number): string {
  return `DEV ARCH ${batchId}-${String(index + 1).padStart(2, '0')} - ${template.title}`;
}

async function buildSeedDrafts(): Promise<SemanticSeedDraft[]> {
  const templates = await loadSeedTemplates();
  const batchId = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 12);
  return shuffled(templates).map((template, index) => ({
    index,
    batchId,
    template,
    title: buildSeedTitle(template, batchId, index),
    folderId: seedFolderFor(template.kind, index),
  }));
}

function wikiLinkFor(
  key: string,
  draft: SemanticSeedDraft,
  titleByKey: Map<string, string>,
  templateByKey: Map<string, SemanticSeedTemplate>,
): string | null {
  const targetTitle = titleByKey.get(key);
  if (!targetTitle || targetTitle === draft.title) return null;
  const alias = templateByKey.get(key)?.title ?? key;
  return `[[${targetTitle}|${alias}]]`;
}

function buildSeedContent(
  draft: SemanticSeedDraft,
  titleByKey: Map<string, string>,
  templateByKey: Map<string, SemanticSeedTemplate>,
): string {
  const links = draft.template.links
    .map((key) => wikiLinkFor(key, draft, titleByKey, templateByKey))
    .filter((link): link is string => link !== null);

  return [
    `# ${draft.template.title}`,
    '',
    `Registro importato dal batch ${draft.batchId}. Categoria: ${draft.template.kind}.`,
    '',
    ...draft.template.body,
    '',
    '## Connessioni',
    ...links.map((link) => `- ${link} - riferimento usato in piu note del corpus.`),
    '',
    '## Indizi di ricerca',
    `Query utili: ${draft.template.searchHints.join(', ')}.`,
    `Tag: ${seedTags(draft.template, draft.batchId).join(', ')}.`,
  ].join('\n');
}

async function materializeSeedGraphLinks(
  drafts: SemanticSeedDraft[],
  created: Note[],
): Promise<void> {
  const idByKey = new Map<string, string>();
  for (const [index, draft] of drafts.entries()) {
    const note = created[index];
    if (note) idByKey.set(draft.template.key, note.id);
  }

  for (const [index, draft] of drafts.entries()) {
    const source = created[index];
    if (!source) continue;
    const targetIds = new Set<string>();
    for (const key of draft.template.links) {
      const targetId = idByKey.get(key);
      if (!targetId || targetId === source.id || targetIds.has(targetId)) continue;
      targetIds.add(targetId);
      await api.links.create({ sourceId: source.id, targetId, type: 'wikilink' });
    }
  }
}

/**
 * Currently scoped folder. `null` = "All notes / Inbox".
 *
 * Single source of truth for:
 *   - filtering of the sidebar list (recursive include of descendants)
 *   - default `folderId` for newly created notes
 *   - default `kind` (via folder inheritance)
 *   - server-side scoping of semantic search
 *
 * Synced both ways with the `?folder=` query param so deep-links work.
 */
const selectedFolderId = ref<string | null>(null);

/** Always recurse for v1 â€” flat-folder UX is more intuitive than per-folder
 *  scoping. We can expose a per-search toggle later if users ask for it. */
const semanticRecursive = ref(true);

const editorMode = ref<EditorMode>('wysiwyg');
const NOTE_WIDTH_STORAGE_KEY = 'continuum.notesView.noteFullWidth';

function loadNoteFullWidth(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(NOTE_WIDTH_STORAGE_KEY) === '1';
}

const noteFullWidth = ref<boolean>(loadNoteFullWidth());

function setNoteFullWidth(value: boolean): void {
  noteFullWidth.value = value;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(NOTE_WIDTH_STORAGE_KEY, value ? '1' : '0');
  }
}

const saving = ref(false);
const lastSavedAt = ref<number | null>(null);
const nowTick = ref(Date.now());
let tickHandle: ReturnType<typeof setInterval> | null = null;

// (Right sidebar removed: details now live inline within the note page.)

// --- Editor right-click context menu ---
const editorMenuOpen = ref(false);
const editorMenuX = ref(0);
const editorMenuY = ref(0);
const editorMenuItems = ref<UiContextMenuItem[]>([]);

function onEditorContextMenu(payload: { x: number; y: number; items: ContextMenuItem[] }): void {
  editorMenuX.value = payload.x;
  editorMenuY.value = payload.y;
  editorMenuItems.value = payload.items as UiContextMenuItem[];
  editorMenuOpen.value = true;
}

// --- Editor prompt (image URL, link URL, …) ---
//
// The editor emits a `request-prompt` event with a `resolve` callback.
// We bridge it to the global `usePromptModal` composable: a single
// `UiPromptModal` instance is mounted in `App.vue` and shared across all
// views.
interface PromptRequestPayload {
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  resolve: (value: string | null) => void;
}

function onEditorPrompt(payload: PromptRequestPayload): void {
  void requestPrompt({
    title: payload.title,
    label: payload.label,
    placeholder: payload.placeholder,
    initialValue: payload.initialValue,
    confirmLabel: payload.confirmLabel,
  }).then((value) => payload.resolve(value));
}

/**
 * Build the icon catalog passed down to the editor's NodeView pickers
 * (currently consumed by the Callout icon picker). The list is derived
 * from the same `ICONS` registry used elsewhere in the app so the editor
 * automatically inherits any future additions.
 *
 * `id` matches the `AppIconName` literal (e.g. `kind-flame`) and is the
 * value persisted in the Callout `icon` attribute as `name:<id>`.
 */
const editorIconCatalog = computed<IconCatalogEntry[]>(() => {
  const names = Object.keys(ICONS) as AppIconName[];
  return names.map((id) => ({
    id,
    label: id.replace(/-/g, ' '),
    group: id.startsWith('kind-')
      ? 'Kinds'
      : id.startsWith('folder')
        ? 'Folders'
        : 'General',
  }));
});

const backlinks = ref<BacklinkEntry[]>([]);
const backlinksLoading = ref(false);

const selected = computed<Note | null>(
  () => notes.value.find((n) => n.id === selectedId.value) ?? null,
);

// --- Loading & selection ---
async function load(): Promise<void> {
  notes.value = await api.notes.list();
}

function applyDraft(n: Note): void {
  selectedId.value = n.id;
  draftTitle.value = n.title;
  draftKind.value = (n.kind as EntityKind) ?? 'note';
  draftContent.value = n.content ?? '';
  draftJson.value = n.contentJson ?? null;
  draftTags.value = Array.isArray(n.tags) ? [...n.tags] : [];
  draftLocked.value = !!n.locked;
  lastSavedAt.value = Date.parse(n.updatedAt) || Date.now();
  recentNotes.record(n.id);
}

function selectById(id: string): void {
  const n = notes.value.find((x) => x.id === id);
  if (n) {
    applyDraft(n);
    recentNotes.record(id);
  }
}

function openCreateNote(): void {
  createNoteError.value = '';
  createNoteOpen.value = true;
}

async function createNew(payload: {
  title: string;
  kind: EntityKind;
  content: string;
  folderId: string | null;
}): Promise<void> {
  createNoteBusy.value = true;
  createNoteError.value = '';
  try {
    const created = await api.notes.create(payload);
    createNoteOpen.value = false;
    await load();
    void folders.refresh();
    applyDraft(created);
  } catch (err) {
    createNoteError.value = err instanceof Error ? err.message : String(err);
  } finally {
    createNoteBusy.value = false;
  }
}

async function seedSemanticTestNotes(): Promise<void> {
  if (!isDev || seedNotesBusy.value) return;
  seedNotesBusy.value = true;
  seedNotesError.value = '';
  const created: Note[] = [];
  try {
    await folders.load();
    const drafts = await buildSeedDrafts();
    const titleByKey = new Map(drafts.map((draft) => [draft.template.key, draft.title]));
    const templateByKey = new Map(
      drafts.map((draft) => [draft.template.key, draft.template] as const),
    );
    for (const draft of drafts) {
      created.push(await api.notes.create({
        title: draft.title,
        kind: draft.template.kind,
        content: draft.template.body.join('\n\n'),
        tags: seedTags(draft.template, draft.batchId),
        folderId: draft.folderId,
      }));
    }
    for (const [index, draft] of drafts.entries()) {
      const note = created[index];
      if (!note) continue;
      created[index] = await api.notes.update(note.id, {
        title: draft.title,
        kind: draft.template.kind,
        content: buildSeedContent(draft, titleByKey, templateByKey),
        tags: seedTags(draft.template, draft.batchId),
        folderId: draft.folderId,
      });
    }
    await materializeSeedGraphLinks(drafts, created);
    await load();
    void folders.refresh();
    if (created[0]) applyDraft(created[0]);
  } catch (err) {
    seedNotesError.value = err instanceof Error ? err.message : String(err);
  } finally {
    seedNotesBusy.value = false;
  }
}

// --- Folder CRUD wiring ---
const folderFormOpen = ref(false);
const folderFormMode = ref<'create' | 'edit'>('create');
const folderFormParentId = ref<string | null>(null);
const folderFormTarget = ref<FolderNode | null>(null);

function openCreateFolder(parentId: string | null): void {
  folderFormMode.value = 'create';
  folderFormParentId.value = parentId;
  folderFormTarget.value = null;
  folderFormOpen.value = true;
}

function openEditFolder(folder: FolderNode): void {
  folderFormMode.value = 'edit';
  folderFormTarget.value = folder;
  folderFormParentId.value = folder.parentId;
  folderFormOpen.value = true;
}

const folderDeleteTarget = ref<FolderNode | null>(null);
const folderDeleteMessage = computed(() =>
  folderDeleteTarget.value
    ? `Delete folder "${folderDeleteTarget.value.name}"? Notes inside will move to the parent folder (or root). This cannot be undone.`
    : '',
);

function requestDeleteFolder(folder: FolderNode): void {
  folderDeleteTarget.value = folder;
}

async function confirmDeleteFolder(): Promise<void> {
  const f = folderDeleteTarget.value;
  folderDeleteTarget.value = null;
  if (!f) return;
  await removeFolder(f.id);
  // If the user was scoped inside the deleted folder, jump back to root so
  // the sidebar list isn't pointing at a phantom selection.
  if (selectedFolderId.value === f.id) selectedFolderId.value = null;
  await load(); // refresh notes list â€” server's ON DELETE SET NULL frees them
}

async function moveNoteToFolder(payload: { noteId: string; folderId: string | null }): Promise<void> {
  await api.notes.move(payload.noteId, payload.folderId);
  await load();
  void folders.refresh(); // note counts changed
}

// --- URL â†” folder scope sync ---
//
// `?folder=<id>` is the canonical state; `selectedFolderId` is its in-memory
// mirror. Each side updates the other only when actually different to avoid
// router-loops.
watch(selectedFolderId, (id) => {
  const current = typeof route.query.folder === 'string' ? route.query.folder : null;
  const next = id ?? undefined;
  if ((current ?? null) === (id ?? null)) return;
  void router.replace({ query: { ...route.query, folder: next } });
});

watch(
  () => route.query.folder,
  (qid) => {
    const id = typeof qid === 'string' && qid ? qid : null;
    if (id !== selectedFolderId.value) selectedFolderId.value = id;
  },
);

// Custom in-app delete confirmation (replaces native window.confirm so the
// dialog matches the rest of the design system).
const deleteTargetId = ref<string | null>(null);
const deleteTargetLabel = computed<string>(() => {
  const id = deleteTargetId.value;
  if (!id) return '';
  const n = notes.value.find((x) => x.id === id);
  return n?.title?.trim() || '(untitled)';
});
const deleteMessage = computed<string>(() =>
  deleteTargetId.value
    ? `Delete "${deleteTargetLabel.value}"? This cannot be undone.`
    : '',
);

function remove(id: string): void {
  deleteTargetId.value = id;
}

async function confirmDeleteNote(): Promise<void> {
  const id = deleteTargetId.value;
  deleteTargetId.value = null;
  if (!id) return;
  await api.notes.remove(id);
  recentNotes.forget(id);
  if (selectedId.value === id) selectedId.value = null;
  await load();
}

// --- Auto-save ---
//
// Locked notes are intentionally read-only at the persistence layer too:
// `persist` short-circuits when the draft is locked so accidental drafts
// from prop reactivity (e.g. JSON normalisation) don't round-trip back
// to the server. Lock/unlock itself is handled by `onLockToggle`, which
// bypasses the debounce because it is a discrete user intent.
const persist = useDebounceFn(async () => {
  if (!selectedId.value) return;
  if (draftLocked.value) return;
  saving.value = true;
  try {
    const updated = await api.notes.update(selectedId.value, {
      title: draftTitle.value || 'Untitled',
      kind: draftKind.value,
      content: draftContent.value,
      contentJson: draftJson.value as Note['contentJson'],
      tags: draftTags.value,
    });
    const idx = notes.value.findIndex((n) => n.id === updated.id);
    if (idx >= 0) notes.value[idx] = updated;
    lastSavedAt.value = Date.now();
  } finally {
    saving.value = false;
    void refreshBacklinks();
  }
}, 600);

watch(
  [draftTitle, draftKind, draftContent, draftTags],
  () => { if (selectedId.value) void persist(); },
  { deep: true },
);

/**
 * Toggle the `locked` flag on the server and reflect it locally. We hit
 * the API directly (not via `persist`) because:
 *   1. The user expects an immediate state change — no 600ms debounce.
 *   2. The PUT must succeed even when other fields would be rejected
 *      (the route accepts a `locked`-only patch on a locked note as the
 *      sanctioned unlock path).
 */
async function onLockToggle(value: boolean): Promise<void> {
  if (!selectedId.value) return;
  const id = selectedId.value;
  const previous = draftLocked.value;
  // Optimistic update so the icon flips instantly; rollback on failure.
  draftLocked.value = value;
  try {
    const updated = await api.notes.update(id, { locked: value });
    const idx = notes.value.findIndex((n) => n.id === id);
    if (idx >= 0) notes.value[idx] = updated;
    lastSavedAt.value = Date.parse(updated.updatedAt) || Date.now();
  } catch (err) {
    draftLocked.value = previous;
    throw err;
  }
}

// --- Semantic search ---
//
// Strategy:
//   1. The actual network request is debounced (500 ms) so rapid typing /
//      autocorrect doesn't fire one query per keystroke.
//   2. `semanticBusy` flips to `true` *synchronously* the moment the user
//      types in semantic mode, so the spinner appears immediately during
//      the debounce window â€” no perceived dead time.
//   3. Each request gets a monotonically increasing token; out-of-order
//      responses (e.g. a slow earlier query returning after a fresher one)
//      are discarded so stale results never overwrite fresh ones.
//   4. In-flight requests are aborted via AbortController when a new query
//      starts, so the server stops doing work the user no longer cares about.
//   5. Below the minimum length we don't even hit the API.
const SEMANTIC_MIN_LEN = 2;
let semanticToken = 0;
let semanticAbort: AbortController | null = null;

const runSemanticSearch = useDebounceFn(async () => {
  const q = search.value.trim();
  const myToken = ++semanticToken;

  // Cancel any in-flight request â€” its results would be stale anyway.
  semanticAbort?.abort();

  if (!embeddingsAvailable.value || q.length < SEMANTIC_MIN_LEN) {
    semanticHits.value = [];
    semanticBusy.value = false;
    semanticAbort = null;
    return;
  }

  const ctrl = new AbortController();
  semanticAbort = ctrl;
  try {
    const hits = await api.notes.semanticSearch(q, ctrl.signal, {
      folderId: selectedFolderId.value,
      recursive: semanticRecursive.value,
    });
    if (myToken !== semanticToken) return; // a newer request superseded us
    semanticHits.value = hits;
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return;
    if (myToken !== semanticToken) return;
    semanticHits.value = [];
  } finally {
    if (myToken === semanticToken) {
      semanticBusy.value = false;
      semanticAbort = null;
    }
  }
}, 500);

watch([search, searchMode, selectedFolderId, semanticRecursive], () => {
  if (searchMode.value !== 'semantic') {
    semanticHits.value = [];
    semanticBusy.value = false;
    semanticAbort?.abort();
    semanticAbort = null;
    return;
  }
  // Flip busy on synchronously so the spinner shows during the debounce
  // window. Only do so when the query is long enough to actually trigger
  // a search â€” otherwise we'd be lying to the user.
  if (embeddingsAvailable.value && search.value.trim().length >= SEMANTIC_MIN_LEN) {
    semanticBusy.value = true;
  } else {
    semanticBusy.value = false;
  }
  void runSemanticSearch();
});

// If the embedding model disappears (e.g. provider went offline), force the
// sidebar back to filter mode so the user isn't stuck on a disabled tab.
watch(embeddingsAvailable, (available) => {
  if (!available && searchMode.value === 'semantic') {
    searchMode.value = 'filter';
  }
});

// --- Backlinks ---
const refreshBacklinks = useDebounceFn(async () => {
  const id = selectedId.value;
  if (!id) { backlinks.value = []; return; }
  backlinksLoading.value = true;
  try {
    backlinks.value = await api.notes.backlinks(id);
  } catch {
    backlinks.value = [];
  } finally {
    backlinksLoading.value = false;
  }
}, 300);

watch(selectedId, () => {
  backlinks.value = [];
  if (selectedId.value) void refreshBacklinks();
});

// --- Lifecycle ---
onMounted(() => {
  void (async () => {
    await Promise.all([load(), folders.load()]);
    const folderParam = route.query.folder;
    if (typeof folderParam === 'string' && folderParam) selectedFolderId.value = folderParam;
    const noteParam = route.query.note;
    if (typeof noteParam === 'string' && noteParam) selectById(noteParam);
  })();
  tickHandle = setInterval(() => { nowTick.value = Date.now(); }, 5000);
});

watch(
  () => route.query.note,
  (id) => {
    if (typeof id === 'string' && id && id !== selectedId.value) selectById(id);
  },
);

onBeforeUnmount(() => {
  if (tickHandle) clearInterval(tickHandle);
  semanticAbort?.abort();
  semanticAbort = null;
});
</script>

<template>
  <div class="notes-layout">
    <NotesSidebar class="pane left" :notes="notes" :selected-id="selectedId" :selected-folder-id="selectedFolderId"
      :search-query="search" :search-mode="searchMode" :semantic-hits="semanticHits" :semantic-busy="semanticBusy"
      :semantic-available="embeddingsAvailable" :dev-mode="isDev" :seed-busy="seedNotesBusy"
      :seed-error="seedNotesError" @update:search-query="(v: string) => (search = v)"
      @update:search-mode="(v: SearchMode) => (searchMode = v)"
      @update:selected-folder-id="(v: string | null) => (selectedFolderId = v)" @select="selectById"
      @create="openCreateNote" @seed-test-notes="seedSemanticTestNotes" @delete="remove"
      @run-semantic="runSemanticSearch" @create-folder="openCreateFolder" @edit-folder="openEditFolder"
      @delete-folder="requestDeleteFolder" @move-note="moveNoteToFolder" />

    <section v-if="selected" class="pane center">
      <div class="note-document" :class="{ 'is-full-width': noteFullWidth }">
        <NoteEditorHeader :title="draftTitle" :kind="draftKind" :tags="draftTags" :folder-id="selected.folderId ?? null"
          :editor-mode="editorMode" :full-width="noteFullWidth" :locked="draftLocked" :saved-at="lastSavedAt"
          :saving="saving" :now-tick="nowTick"
          @update:title="(v: string) => (draftTitle = v)" @update:kind="(v: EntityKind) => (draftKind = v)"
          @update:tags="(v: string[]) => (draftTags = v)" @update:editor-mode="(v: EditorMode) => (editorMode = v)"
          @update:full-width="setNoteFullWidth" @update:locked="onLockToggle"
          @navigate-folder="(id: string | null) => (selectedFolderId = id)" @delete="remove(selected!.id)" />

        <NoteInlineProperties :note-id="selected.id" :kind-id="selected.kind" :readonly="draftLocked"
          @select="selectById" />

        <ContinuumEditor class="note-editor" v-model="draftContent" v-model:json="draftJson"
          :mode="draftLocked ? 'wysiwyg' : editorMode"
          :editable="!draftLocked"
          placeholder="Write lore, character notes, anything…" :icon-catalog="editorIconCatalog" :icon-component="Icon"
          :select-component="UiSelect" @request-context-menu="onEditorContextMenu" @request-prompt="onEditorPrompt" />

        <NoteFootnotesPanel :content-json="draftJson" />

        <NoteDetailsFooter :note="selected" :notes="notes" :backlinks="backlinks"
          :backlinks-loading="backlinksLoading" @select="selectById" />
      </div>
    </section>

    <EmptyEditor v-else class="pane center" @create="openCreateNote" />

    <UiContextMenu v-model="editorMenuOpen" :x="editorMenuX" :y="editorMenuY" :items="editorMenuItems" />

    <UiConfirmModal :model-value="deleteTargetId !== null" title="Delete note" :message="deleteMessage"
      confirm-label="Delete" confirm-variant="danger" @confirm="confirmDeleteNote" @cancel="deleteTargetId = null"
      @update:model-value="(v) => { if (!v) deleteTargetId = null; }" />

    <NoteCreateModal v-model="createNoteOpen" :default-folder-id="selectedFolderId" :busy="createNoteBusy"
      :error="createNoteError" context="notes" @submit="createNew" />

    <FolderForm v-model="folderFormOpen" :mode="folderFormMode" :parent-id="folderFormParentId"
      :folder="folderFormTarget" @saved="() => { void folders.refresh(); }" />

    <UiConfirmModal :model-value="folderDeleteTarget !== null" title="Delete folder" :message="folderDeleteMessage"
      confirm-label="Delete" confirm-variant="danger" @confirm="confirmDeleteFolder" @cancel="folderDeleteTarget = null"
      @update:model-value="(v) => { if (!v) folderDeleteTarget = null; }" />
  </div>
</template>

<style scoped>
.notes-layout {
  display: grid;
  grid-template-columns: var(--layout-notes-sidebar-w) 1fr;
  gap: var(--space-4);
  height: 100%;
  min-height: 0;
}

.pane {
  background: var(--surface-1);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  overflow: hidden;
  min-height: 0;
  box-shadow: none;
  color: var(--fg);
  display: flex;
  flex-direction: column;
}

/* Center pane scrolls vertically so the inline footer (Linked notes /
   Backlinks) sits naturally below the editor body. */
.pane.center {
  gap: 0;
  background: var(--bg);
  overflow-y: auto;
}

.note-document {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: min(100%, var(--layout-content-max, 880px));
  margin: 0 auto;
  min-height: 100%;
}

.note-document.is-full-width {
  width: 100%;
}

.note-editor {
  flex: 0 0 auto;
  width: 100%;
  min-height: 360px;
}

.note-document :deep(.continuum-editor) {
  flex: 0 0 auto;
  width: 100%;
}

.note-document :deep(.continuum-editor .toolbar) {
  align-self: stretch;
  width: 100%;
  max-width: 100%;
  box-sizing: border-box;
}

.note-document :deep(.continuum-editor .content:not(.md-area):not(.md-preview)) {
  flex: 0 0 auto;
  min-height: 300px;
  overflow: visible;
}

.note-document :deep(.continuum-editor .toolbar),
.note-document :deep(.continuum-editor .md-hint) {
  position: sticky;
  top: 0;
  z-index: 5;
}
</style>
