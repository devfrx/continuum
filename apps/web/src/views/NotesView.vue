<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { useDebounceFn } from '@vueuse/core';
import { ContinuumEditor } from '@continuum/editor';
import { api, type BacklinkEntry } from '@/api';
import type { AiSearchHit, Note, EntityKind, ContextMenuItem } from '@continuum/shared';
import NotesSidebar from '@/components/notes/NotesSidebar.vue';
import NoteEditorHeader from '@/components/notes/NoteEditorHeader.vue';
import RightSidebar from '@/components/notes/RightSidebar.vue';
import EmptyEditor from '@/components/notes/EmptyEditor.vue';
import { UiConfirmModal, UiContextMenu, UiPromptModal, type ContextMenuItem as UiContextMenuItem } from '@/components/ui';

defineProps<{ focusSearch?: boolean }>();
const route = useRoute();

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

const search = ref('');
const searchMode = ref<SearchMode>('filter');
const semanticHits = ref<AiSearchHit[]>([]);
const semanticBusy = ref(false);

const editorMode = ref<EditorMode>('wysiwyg');

const saving = ref(false);
const lastSavedAt = ref<number | null>(null);
const nowTick = ref(Date.now());
let tickHandle: ReturnType<typeof setInterval> | null = null;

const rightCollapsed = ref(false);

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
interface PromptRequestPayload {
  title: string;
  label?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  resolve: (value: string | null) => void;
}

const promptOpen = ref(false);
const promptTitle = ref('');
const promptLabel = ref('');
const promptPlaceholder = ref('');
const promptInitial = ref('');
const promptConfirmLabel = ref('Save');
let promptResolver: ((value: string | null) => void) | null = null;

function onEditorPrompt(payload: PromptRequestPayload): void {
  promptTitle.value = payload.title;
  promptLabel.value = payload.label ?? '';
  promptPlaceholder.value = payload.placeholder ?? '';
  promptInitial.value = payload.initialValue ?? '';
  promptConfirmLabel.value = payload.confirmLabel ?? 'Save';
  promptResolver = payload.resolve;
  promptOpen.value = true;
}

function onPromptSubmit(value: string): void {
  promptResolver?.(value);
  promptResolver = null;
}

function onPromptCancel(): void {
  promptResolver?.(null);
  promptResolver = null;
}

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
  lastSavedAt.value = Date.parse(n.updatedAt) || Date.now();
}

function selectById(id: string): void {
  const n = notes.value.find((x) => x.id === id);
  if (n) applyDraft(n);
}

async function createNew(): Promise<void> {
  const created = await api.notes.create({ title: 'Untitled', kind: 'note', content: '' });
  await load();
  applyDraft(created);
}

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
  if (selectedId.value === id) selectedId.value = null;
  await load();
}

// --- Auto-save ---
const persist = useDebounceFn(async () => {
  if (!selectedId.value) return;
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

// --- Semantic search ---
//
// Strategy:
//   1. The actual network request is debounced (500 ms) so rapid typing /
//      autocorrect doesn't fire one query per keystroke.
//   2. `semanticBusy` flips to `true` *synchronously* the moment the user
//      types in semantic mode, so the spinner appears immediately during
//      the debounce window — no perceived dead time.
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

  // Cancel any in-flight request — its results would be stale anyway.
  semanticAbort?.abort();

  if (q.length < SEMANTIC_MIN_LEN) {
    semanticHits.value = [];
    semanticBusy.value = false;
    semanticAbort = null;
    return;
  }

  const ctrl = new AbortController();
  semanticAbort = ctrl;
  try {
    const hits = await api.notes.semanticSearch(q, ctrl.signal);
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

watch([search, searchMode], () => {
  if (searchMode.value !== 'semantic') {
    semanticHits.value = [];
    semanticBusy.value = false;
    semanticAbort?.abort();
    semanticAbort = null;
    return;
  }
  // Flip busy on synchronously so the spinner shows during the debounce
  // window. Only do so when the query is long enough to actually trigger
  // a search — otherwise we'd be lying to the user.
  if (search.value.trim().length >= SEMANTIC_MIN_LEN) {
    semanticBusy.value = true;
  } else {
    semanticBusy.value = false;
  }
  void runSemanticSearch();
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
    await load();
    const noteParam = route.query.note;
    if (typeof noteParam === 'string' && noteParam) selectById(noteParam);
    if (route.name === 'search' || route.query.focus === 'search') {
      await nextTick();
      const el = document.querySelector<HTMLInputElement>('.notes-layout input');
      el?.focus();
    }
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
});
</script>

<template>
  <div class="notes-layout" :class="{ 'right-collapsed': rightCollapsed }">
    <NotesSidebar class="pane left" :notes="notes" :selected-id="selectedId" :search-query="search"
      :search-mode="searchMode" :semantic-hits="semanticHits" :semantic-busy="semanticBusy"
      @update:search-query="(v: string) => (search = v)" @update:search-mode="(v: SearchMode) => (searchMode = v)"
      @select="selectById" @create="createNew" @delete="remove" @run-semantic="runSemanticSearch" />

    <section v-if="selected" class="pane center">
      <NoteEditorHeader :title="draftTitle" :kind="draftKind" :tags="draftTags" :editor-mode="editorMode"
        :saved-at="lastSavedAt" :saving="saving" :now-tick="nowTick" @update:title="(v: string) => (draftTitle = v)"
        @update:kind="(v: EntityKind) => (draftKind = v)" @update:tags="(v: string[]) => (draftTags = v)"
        @update:editor-mode="(v: EditorMode) => (editorMode = v)" @delete="remove(selected!.id)" />

      <ContinuumEditor v-model="draftContent" v-model:json="draftJson" :mode="editorMode"
        placeholder="Write lore, character notes, anything…" @request-context-menu="onEditorContextMenu"
        @request-prompt="onEditorPrompt" />
    </section>

    <EmptyEditor v-else class="pane center" @create="createNew" />

    <RightSidebar class="pane right" :note="selected" :notes="notes" :backlinks="backlinks"
      :backlinks-loading="backlinksLoading" :collapsed="rightCollapsed"
      @update:collapsed="(v: boolean) => (rightCollapsed = v)" @select="selectById" />

    <UiContextMenu v-model="editorMenuOpen" :x="editorMenuX" :y="editorMenuY" :items="editorMenuItems" />

    <UiPromptModal v-model="promptOpen" :title="promptTitle" :label="promptLabel" :placeholder="promptPlaceholder"
      :initial-value="promptInitial" :confirm-label="promptConfirmLabel" @submit="onPromptSubmit"
      @cancel="onPromptCancel" />

    <UiConfirmModal :model-value="deleteTargetId !== null" title="Delete note" :message="deleteMessage"
      confirm-label="Delete" confirm-variant="danger" @confirm="confirmDeleteNote" @cancel="deleteTargetId = null"
      @update:model-value="(v) => { if (!v) deleteTargetId = null; }" />
  </div>
</template>

<style scoped>
.notes-layout {
  display: grid;
  grid-template-columns: var(--layout-notes-sidebar-w) 1fr var(--layout-right-sidebar-w);
  gap: var(--space-8);
  height: 100%;
  min-height: 0;
}

.notes-layout.right-collapsed {
  grid-template-columns: var(--layout-notes-sidebar-w) 1fr 40px;
}

.pane {
  background: var(--bg-elev);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  padding: var(--space-7);
  overflow: hidden;
  min-height: 0;
  box-shadow: var(--shadow-sm);
  color: var(--fg);
  display: flex;
  flex-direction: column;
}

/* When the right pane collapses to a narrow rail, drop the heavy padding
   so the lone toggle button sits cleanly centred. */
.notes-layout.right-collapsed .pane.right {
  padding: var(--space-4) var(--space-2);
}

.pane.center {
  gap: var(--space-6);
}
</style>
