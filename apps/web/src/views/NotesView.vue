<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { ContinuumEditor, type IconCatalogEntry, type TocAnchor } from '@continuum/editor';
import { api, type BacklinkEntry } from '@/api';
import type { AiSearchHit, Note, EntityKind, FolderNode, ContextMenuItem, CoverPosition } from '@continuum/shared';
import NotesSidebar from '@/components/notes/NotesSidebar.vue';
import NoteEditorHeader from '@/components/notes/NoteEditorHeader.vue';
import NoteCreateModal from '@/components/notes/NoteCreateModal.vue';
import NoteInlineProperties from '@/components/notes/NoteInlineProperties.vue';
import ApplyTemplateModal from '@/components/templates/ApplyTemplateModal.vue';
import SaveAsTemplateModal from '@/components/templates/SaveAsTemplateModal.vue';
import NoteDetailsFooter from '@/components/notes/NoteDetailsFooter.vue';
import NoteFootnotesPanel from '@/components/notes/NoteFootnotesPanel.vue';
import NoteTocPanel from '@/components/notes/NoteTocPanel.vue';
import NotePeekOverlay from '@/components/notes/NotePeekOverlay.vue';
import EmptyEditor from '@/components/notes/EmptyEditor.vue';
import DatabaseBlockEmbed from '@/components/databases/DatabaseBlockEmbed.vue';
import {
  DATABASE_ROW_OPEN_EVENT,
  isPeekOpenMode,
  type DatabaseRowOpenDetail,
  type OpenInMode,
} from '@/components/databases/layout';
import { FolderForm } from '@/components/folders';
import { UiConfirmModal, UiContextMenu, UiSelect, Icon, type ContextMenuItem as UiContextMenuItem } from '@/components/ui';
import { ICONS, type AppIconName } from '@/assets/icons';
import { useAiHealth } from '@/composables/useAiHealth';
import { useFolders } from '@/composables/useFolders';
import { removeFolder } from '@/composables/foldersApi';
import { useNotesSidebar } from '@/composables/useNotesSidebar';
import { useRecentNotes } from '@/composables/useRecentNotes';
import { usePromptModal } from '@/composables/usePromptModal';
import {
  publishNoteCreated,
  publishNoteDeleted,
  publishNoteUpdated,
  useRealtime,
} from '@/lib/realtime';

const route = useRoute();
const router = useRouter();
const { embeddingsAvailable } = useAiHealth();
const folders = useFolders();
const { open: notesSidebarOpen, toggle: toggleNotesSidebar } = useNotesSidebar();
const recentNotes = useRecentNotes();
const { requestPrompt } = usePromptModal();

type SearchMode = 'filter' | 'semantic';
type EditorMode = 'wysiwyg' | 'markdown';

// --- State ---
const notes = ref<Note[]>([]);
const selectedId = ref<string | null>(null);
const peekOpen = ref(false);
const peekMode = ref<Extract<OpenInMode, 'sidePeek' | 'centerPeek'>>('sidePeek');
const peekNote = ref<Note | null>(null);

const draftTitle = ref('');
const draftKind = ref<EntityKind>('note');
const draftContent = ref('');
const draftJson = ref<unknown>(null);
/**
 * Live table-of-contents anchors emitted by the editor. The list is
 * driven by `@tiptap/extension-table-of-contents` and refreshed on
 * every document change, so the sidebar panel stays in lockstep with
 * the heading structure without any extra parsing on our side.
 */
const tocAnchors = ref<TocAnchor[]>([]);
/**
 * Imperative handle to the editor instance, used to scroll a heading
 * into view when the user clicks an entry in the TOC sidebar.
 */
const editorRef = ref<InstanceType<typeof ContinuumEditor> | null>(null);

function onTocNavigate(anchor: TocAnchor): void {
  editorRef.value?.scrollToAnchor(anchor);
}
const draftTags = ref<string[]>([]);
/**
 * Mirror of the persisted `Note.locked` flag for the currently selected
 * note. Toggling this updates the server immediately (see `onLockToggle`)
 * and gates both the auto-save debounce and the editor's `editable` prop
 * — a defence-in-depth strategy that pairs with the 423 response from
 * the API for stale clients.
 */
const draftLocked = ref<boolean>(false);
/**
 * Mirror of the persisted `Note.coverImage` for the currently selected
 * note. Wired through `NoteEditorHeader` so the cover slot edits the
 * same field that Gallery views consume. Persisted via `api.notes.update`
 * directly (no debounce) — cover changes are discrete user intents.
 */
const draftCoverImage = ref<string | null>(null);
const draftCoverPosition = ref<CoverPosition | null>(null);

const notesSidebarPillLabel = computed(() =>
  notesSidebarOpen.value ? 'Collapse notes sidebar' : 'Expand notes sidebar',
);
const notesSidebarPillIcon = computed<AppIconName>(() =>
  notesSidebarOpen.value ? 'chevron-left' : 'chevron-right',
);

const search = ref('');
const searchMode = ref<SearchMode>('filter');
const semanticHits = ref<AiSearchHit[]>([]);
const semanticBusy = ref(false);
const createNoteOpen = ref(false);
const createNoteBusy = ref(false);
const createNoteError = ref('');
const applyTemplateOpen = ref(false);
const saveAsTemplateOpen = ref(false);
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
const NOTE_TOC_COLLAPSED_KEY = 'continuum.notesView.tocCollapsed';

function loadNoteFullWidth(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(NOTE_WIDTH_STORAGE_KEY) === '1';
}

function loadTocCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  return window.localStorage.getItem(NOTE_TOC_COLLAPSED_KEY) === '1';
}

const noteFullWidth = ref<boolean>(loadNoteFullWidth());
const tocCollapsed = ref<boolean>(loadTocCollapsed());

function setNoteFullWidth(value: boolean): void {
  noteFullWidth.value = value;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(NOTE_WIDTH_STORAGE_KEY, value ? '1' : '0');
  }
}

function setTocCollapsed(value: boolean): void {
  tocCollapsed.value = value;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(NOTE_TOC_COLLAPSED_KEY, value ? '1' : '0');
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

// Cross-surface refresh: when any other surface (database row, second tab,
// inline property edit) mutates a note, refetch just that note to keep
// the in-memory list and folder tree in sync. We deliberately skip the
// currently-edited note to avoid clobbering an in-flight draft.
useRealtime(['note.updated', 'note.created', 'note.deleted'], async (event) => {
  if (event.kind === 'note.deleted') {
    notes.value = notes.value.filter((n) => n.id !== event.noteId);
    return;
  }
  if (event.kind === 'note.created') {
    try {
      const created = await api.notes.get(event.noteId);
      if (!notes.value.some((n) => n.id === created.id)) {
        notes.value = [created, ...notes.value];
      }
    } catch { /* note may have been deleted in the meantime */ }
    return;
  }
  // note.updated
  if (event.noteId === selectedId.value) return; // active draft owns this
  try {
    const fresh = await api.notes.get(event.noteId);
    const idx = notes.value.findIndex((n) => n.id === fresh.id);
    if (idx >= 0) notes.value[idx] = fresh;
  } catch { /* swallow: race with deletion */ }
});

function applyDraft(n: Note): void {
  selectedId.value = n.id;
  draftTitle.value = n.title;
  draftKind.value = (n.kind as EntityKind) ?? 'note';
  draftContent.value = n.content ?? '';
  draftJson.value = n.contentJson ?? null;
  // The TOC is rebuilt by the editor on the next document update; clear
  // the cached anchors immediately so the panel doesn't flash stale
  // entries from the previously selected note.
  tocAnchors.value = [];
  draftTags.value = Array.isArray(n.tags) ? [...n.tags] : [];
  draftLocked.value = !!n.locked;
  draftCoverImage.value = n.coverImage ?? null;
  draftCoverPosition.value = n.coverPosition ?? null;
  lastSavedAt.value = Date.parse(n.updatedAt) || Date.now();
  recentNotes.record(n.id);
}

async function selectById(id: string): Promise<void> {
  let n = notes.value.find((x) => x.id === id) ?? null;
  if (!n) {
    try {
      n = await api.notes.get(id);
      notes.value = [n, ...notes.value.filter((x) => x.id !== id)];
    } catch {
      return;
    }
  }
  if (n) {
    applyDraft(n);
    recentNotes.record(id);
  }
}

async function openNoteFullPage(id: string): Promise<void> {
  peekOpen.value = false;
  peekNote.value = null;
  await router.push({ path: '/', query: { ...route.query, note: id } });
  await selectById(id);
}

async function openNotePeek(id: string, mode: Extract<OpenInMode, 'sidePeek' | 'centerPeek'>): Promise<void> {
  let note = notes.value.find((n) => n.id === id) ?? null;
  if (!note) {
    try {
      note = await api.notes.get(id);
      notes.value = [note, ...notes.value.filter((n) => n.id !== id)];
    } catch {
      return;
    }
  }
  peekMode.value = mode;
  peekNote.value = note;
  peekOpen.value = true;
  recentNotes.record(id);
}

function onDatabaseRowOpen(event: Event): void {
  const custom = event as CustomEvent<DatabaseRowOpenDetail>;
  const detail = custom.detail;
  if (!detail?.noteId || !isPeekOpenMode(detail.mode)) return;
  custom.preventDefault();
  void openNotePeek(detail.noteId, detail.mode);
}

/**
 * Resolve a `[[Title]]` click against the in-memory notes list and
 * navigate to the matching note when found. Lookup is case-insensitive
 * and trimmed so authors can use casual wiki syntax. When no match
 * exists we no-op rather than create-on-click — a future iteration
 * could surface a quick-create modal here.
 */
function onWikilinkNavigate(payload: { target: string; alias: string | null }): void {
  const target = payload.target.trim().toLowerCase();
  if (!target) return;
  const hit = notes.value.find((n) => n.title.trim().toLowerCase() === target);
  if (hit) void selectById(hit.id);
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
  templateId?: string | null;
}): Promise<void> {
  createNoteBusy.value = true;
  createNoteError.value = '';
  try {
    let created: Note;
    if (payload.templateId) {
      const { note } = await api.templates.createNote(payload.templateId, {
        title: payload.title,
        kind: payload.kind,
        folderId: payload.folderId,
      });
      created = note;
    } else {
      created = await api.notes.create(payload);
    }
    createNoteOpen.value = false;
    await load();
    void folders.refresh();
    applyDraft(created);
    publishNoteCreated(created.id);
  } catch (err) {
    createNoteError.value = err instanceof Error ? err.message : String(err);
  } finally {
    createNoteBusy.value = false;
  }
}

async function onTemplateApplied(): Promise<void> {
  if (!selected.value) return;
  const noteId = selected.value.id;
  await load();
  const refreshed = notes.value.find((n: Note) => n.id === noteId);
  if (refreshed) applyDraft(refreshed);
}

function onTemplateSaved(templateId: string): void {
  void router.push({ name: 'template-edit', params: { id: templateId } });
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
  publishNoteDeleted(id);
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
    publishNoteUpdated(updated.id);
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

/**
 * Apply a cover image change immediately to the server. Locked notes
 * reject the patch via the 423 contract; we surface that by rolling
 * back the optimistic mirror.
 */
async function onCoverChange(payload: { image: string | null; position: CoverPosition | null }): Promise<void> {
  if (!selectedId.value) return;
  const id = selectedId.value;
  const previousImage = draftCoverImage.value;
  const previousPosition = draftCoverPosition.value;
  draftCoverImage.value = payload.image;
  draftCoverPosition.value = payload.position;
  try {
    const updated = await api.notes.update(id, {
      coverImage: payload.image,
      coverPosition: payload.position,
    });
    const idx = notes.value.findIndex((n) => n.id === id);
    if (idx >= 0) notes.value[idx] = updated;
    draftCoverImage.value = updated.coverImage ?? null;
    draftCoverPosition.value = updated.coverPosition ?? null;
    lastSavedAt.value = Date.parse(updated.updatedAt) || Date.now();
    publishNoteUpdated(id);
  } catch (err) {
    draftCoverImage.value = previousImage;
    draftCoverPosition.value = previousPosition;
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
  window.addEventListener(DATABASE_ROW_OPEN_EVENT, onDatabaseRowOpen as EventListener);
  void (async () => {
    await Promise.all([load(), folders.load()]);
    const folderParam = route.query.folder;
    if (typeof folderParam === 'string' && folderParam) selectedFolderId.value = folderParam;
    const noteParam = route.query.note;
    if (typeof noteParam === 'string' && noteParam) void selectById(noteParam);
  })();
  tickHandle = setInterval(() => { nowTick.value = Date.now(); }, 5000);
});

watch(
  () => route.query.note,
  (id) => {
    if (typeof id === 'string' && id && id !== selectedId.value) void selectById(id);
  },
);

onBeforeUnmount(() => {
  window.removeEventListener(DATABASE_ROW_OPEN_EVENT, onDatabaseRowOpen as EventListener);
  if (tickHandle) clearInterval(tickHandle);
  semanticAbort?.abort();
  semanticAbort = null;
});
</script>

<template>
  <div class="notes-layout" :class="{ 'notes-sidebar-open': notesSidebarOpen }">
    <button
      type="button"
      class="notes-sidebar-pill"
      :class="{ 'is-active': notesSidebarOpen }"
      :aria-label="notesSidebarPillLabel"
      :aria-expanded="notesSidebarOpen"
      aria-controls="notes-sidebar"
      :title="notesSidebarPillLabel"
      @click="toggleNotesSidebar">
      <Icon :name="notesSidebarPillIcon" :size="14" />
    </button>

    <Transition name="notes-sidebar-slide">
      <NotesSidebar v-if="notesSidebarOpen" id="notes-sidebar" class="pane left notes-sidebar-pane"
        :notes="notes" :selected-id="selectedId" :selected-folder-id="selectedFolderId"
        :search-query="search" :search-mode="searchMode" :semantic-hits="semanticHits" :semantic-busy="semanticBusy"
        :semantic-available="embeddingsAvailable" :dev-mode="isDev" :seed-busy="seedNotesBusy"
        :seed-error="seedNotesError" @update:search-query="(v: string) => (search = v)"
        @update:search-mode="(v: SearchMode) => (searchMode = v)"
        @update:selected-folder-id="(v: string | null) => (selectedFolderId = v)" @select="selectById"
        @create="openCreateNote" @seed-test-notes="seedSemanticTestNotes" @delete="remove"
        @run-semantic="runSemanticSearch" @create-folder="openCreateFolder" @edit-folder="openEditFolder"
        @delete-folder="requestDeleteFolder" @move-note="moveNoteToFolder" />
    </Transition>

    <section v-if="selected" class="pane center">
      <div class="note-layout" :class="{ 'has-toc': tocAnchors.length, 'is-full-width': noteFullWidth }">
        <div class="note-document" :class="{ 'is-full-width': noteFullWidth, 'has-toc': tocAnchors.length }">
          <NoteEditorHeader :title="draftTitle" :kind="draftKind" :tags="draftTags"
            :folder-id="selected.folderId ?? null"
            :editor-mode="editorMode" :full-width="noteFullWidth" :locked="draftLocked"
            :cover-image="draftCoverImage"
            :cover-position="draftCoverPosition"
            :saved-at="lastSavedAt"
            :saving="saving" :now-tick="nowTick"
            @update:title="(v: string) => (draftTitle = v)" @update:kind="(v: EntityKind) => (draftKind = v)"
            @update:tags="(v: string[]) => (draftTags = v)" @update:editor-mode="(v: EditorMode) => (editorMode = v)"
            @update:full-width="setNoteFullWidth" @update:locked="onLockToggle"
            @update:cover="onCoverChange"
            @navigate-folder="(id: string | null) => (selectedFolderId = id)"
            @apply-template="applyTemplateOpen = true"
            @save-as-template="saveAsTemplateOpen = true"
            @delete="remove(selected!.id)" />

          <NoteInlineProperties :note-id="selected.id" :kind-id="selected.kind" :readonly="draftLocked"
            @select="selectById" />

          <div class="note-body-grid" :class="{
            'has-toc': tocAnchors.length,
            'is-toc-collapsed': tocCollapsed,
            'is-full-width': noteFullWidth,
          }">
            <div class="note-body-main">
              <ContinuumEditor ref="editorRef" class="note-editor" v-model="draftContent" v-model:json="draftJson"
                :mode="draftLocked ? 'wysiwyg' : editorMode"
                :editable="!draftLocked"
                placeholder="Write lore, character notes, anything…" :icon-catalog="editorIconCatalog"
                :icon-component="Icon"
                :select-component="UiSelect"
                :database-component="DatabaseBlockEmbed"
                @request-context-menu="onEditorContextMenu"
                @request-prompt="onEditorPrompt"
                @wikilink-navigate="onWikilinkNavigate"
                @update:toc="(a: TocAnchor[]) => (tocAnchors = a)" />

              <NoteFootnotesPanel :content-json="draftJson" />

              <NoteDetailsFooter :note="selected" :notes="notes" :backlinks="backlinks"
                :backlinks-loading="backlinksLoading" @select="selectById" />
            </div>

            <NoteTocPanel v-if="tocAnchors.length" :anchors="tocAnchors" :collapsed="tocCollapsed"
              @navigate="onTocNavigate" @update:collapsed="setTocCollapsed" />
          </div>
        </div>
      </div>
    </section>

    <EmptyEditor v-else class="pane center" @create="openCreateNote" />

    <UiContextMenu v-model="editorMenuOpen" :x="editorMenuX" :y="editorMenuY" :items="editorMenuItems" />

    <UiConfirmModal :model-value="deleteTargetId !== null" title="Delete note" :message="deleteMessage"
      confirm-label="Delete" confirm-variant="danger" @confirm="confirmDeleteNote" @cancel="deleteTargetId = null"
      @update:model-value="(v) => { if (!v) deleteTargetId = null; }" />

    <NoteCreateModal v-model="createNoteOpen" :default-folder-id="selectedFolderId" :busy="createNoteBusy"
      :error="createNoteError" context="notes" @submit="createNew" />

    <NotePeekOverlay
      v-model="peekOpen"
      :note="peekNote"
      :mode="peekMode"
      :icon-catalog="editorIconCatalog"
      @open-full-page="openNoteFullPage" />

    <ApplyTemplateModal
      v-if="selected"
      v-model="applyTemplateOpen"
      :note-id="selected.id"
      :note-locked="draftLocked"
      @applied="onTemplateApplied"
    />

    <SaveAsTemplateModal
      v-if="selected"
      v-model="saveAsTemplateOpen"
      :note-id="selected.id"
      :default-name="draftTitle"
      @saved="onTemplateSaved"
    />

    <FolderForm v-model="folderFormOpen" :mode="folderFormMode" :parent-id="folderFormParentId"
      :folder="folderFormTarget" @saved="() => { void folders.refresh(); }" />

    <UiConfirmModal :model-value="folderDeleteTarget !== null" title="Delete folder" :message="folderDeleteMessage"
      confirm-label="Delete" confirm-variant="danger" @confirm="confirmDeleteFolder" @cancel="folderDeleteTarget = null"
      @update:model-value="(v) => { if (!v) folderDeleteTarget = null; }" />
  </div>
</template>

<style scoped>
.notes-layout {
  position: relative;
  display: grid;
  grid-template-columns: 0 minmax(0, 1fr);
  gap: 0;
  height: 100%;
  min-height: 0;
  transition:
    grid-template-columns var(--duration-normal) var(--ease-decel),
    gap var(--duration-fast) var(--ease-standard);
}

.notes-layout.notes-sidebar-open {
  grid-template-columns: var(--layout-notes-sidebar-w) minmax(0, 1fr);
  gap: var(--space-4);
}

.notes-sidebar-pane {
  grid-column: 1;
  min-width: 0;
}

.notes-sidebar-pill {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translate(-1px, -50%);
  width: var(--layout-pill-w, 14px);
  height: var(--layout-pill-h, 64px);
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--surface-2) 78%, transparent);
  color: var(--fg-subtle);
  border: var(--border-width-1) solid var(--border-subtle);
  border-left: none;
  border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
  cursor: pointer;
  z-index: calc(var(--z-overlay) - 1);
  -webkit-backdrop-filter: blur(8px);
  backdrop-filter: blur(8px);
  transition:
    transform var(--duration-normal) var(--ease-decel),
    background-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard),
    width var(--duration-fast) var(--ease-standard),
    box-shadow var(--duration-fast) var(--ease-standard);
}

.notes-sidebar-pill:hover,
.notes-sidebar-pill.is-active {
  background: var(--surface-2);
  color: var(--fg-strong);
  width: 18px;
  box-shadow: var(--shadow-sm);
}

.notes-sidebar-pill:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.notes-layout.notes-sidebar-open .notes-sidebar-pill {
  transform: translate(calc(var(--layout-notes-sidebar-w) + var(--space-4) - 1px), -50%);
}

.notes-sidebar-slide-enter-active,
.notes-sidebar-slide-leave-active {
  transition:
    transform var(--duration-normal) var(--ease-decel),
    opacity var(--duration-normal) var(--ease-decel);
}

.notes-sidebar-slide-enter-from,
.notes-sidebar-slide-leave-to {
  transform: translateX(-16px);
  opacity: 0;
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
  grid-column: 2;
  gap: 0;
  background: var(--bg);
  overflow-y: auto;
}

.note-document {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  width: 100%;
  min-height: 100%;
  min-width: 0;
}

/**
 * Two-column layout: the document column is centred with the same
 * `--layout-content-max` width as before, and the side TOC sits to its
 * right (sticky, collapsible). When the host enables full-width mode
 * or the note has no headings, the layout collapses to a single column
 * so the writing surface gets all the available width back.
 */
.note-layout {
  width: min(100%, var(--layout-content-max, 880px));
  min-height: 100%;
  margin: 0 auto;
}

.note-layout.has-toc:not(.is-full-width) {
  width: min(100%, calc(var(--layout-content-max, 880px) + 232px + var(--space-6)));
}

.note-layout.is-full-width {
  width: 100%;
}

.note-document.is-full-width {
  /* Width is controlled by the parent `.note-layout.is-full-width`
     grid track; this class just stays as an extension hook in case
     descendant components want to react to the full-width mode. */
}

.note-editor {
  flex: 0 0 auto;
  width: 100%;
  min-height: 360px;
}

.note-body-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: var(--space-6);
  align-items: start;
  width: 100%;
}

.note-body-grid.has-toc {
  grid-template-columns: minmax(0, var(--layout-content-max, 880px)) minmax(196px, 232px);
}

.note-body-grid.has-toc.is-toc-collapsed {
  grid-template-columns: minmax(0, var(--layout-content-max, 880px)) 36px;
}

.note-body-grid.is-full-width.has-toc {
  grid-template-columns: minmax(0, 1fr) minmax(196px, 232px);
}

.note-body-grid.is-full-width.has-toc.is-toc-collapsed {
  grid-template-columns: minmax(0, 1fr) 36px;
}

.note-body-main {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  min-width: 0;
}

@media (max-width: 1100px) {
  .note-layout.has-toc:not(.is-full-width) {
    width: min(100%, var(--layout-content-max, 880px));
  }

  .note-body-grid.has-toc,
  .note-body-grid.has-toc.is-toc-collapsed,
  .note-body-grid.is-full-width.has-toc,
  .note-body-grid.is-full-width.has-toc.is-toc-collapsed {
    grid-template-columns: minmax(0, 1fr);
  }
}

.note-document :deep(.continuum-editor) {
  flex: 0 0 auto;
  width: 100%;
}

.note-document :deep(.continuum-editor .content:not(.md-area):not(.md-preview)) {
  flex: 0 0 auto;
  min-height: 300px;
  overflow: visible;
}

.note-document :deep(.continuum-editor .md-hint) {
  position: sticky;
  top: 0;
  z-index: 5;
}
</style>
