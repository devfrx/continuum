<script setup lang="ts">
/**
 * Knowledge Graph view — composition shell.
 *
 * The view layers four absolutely-positioned panels over a full-canvas
 * Sigma renderer (or its 3D Three.js counterpart). All logic is split
 * into dedicated composables so this shell only wires them together
 * and routes events to the right handler:
 *
 *   - `useGraphPreferences`  view mode / layout / legend / hidden kinds /
 *                            highlightedIds — persisted in localStorage.
 *   - `useGraphFilters`      Filtri panel state (sliders + search) —
 *                            persisted under STORAGE_KEYS.graphFilters.
 *   - `useGraphSelection`    selected / hover / `selectedHighlighted`.
 *   - `useGraphSigma`        Sigma instance, d3-force live sim, 2D ↔ 3D
 *                            camera bridge, all watchers + listeners.
 *   - `useGraphNoteActions`  modal state + handlers for rename / delete /
 *                            link / new note.
 *   - `useNoteExport`        Markdown blob download.
 *
 * Navigation contract: opening a note pushes
 *   { path: '/', query: { note: <id> } }
 * NotesView (owned by another agent) auto-selects the matching note.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Icon, UiButton, UiCard, UiEmpty, type ContextMenuItem as UiContextMenuItem } from '@/components/ui';
import type { AppIconName as IconName } from '@/assets/icons';
import Graph3DCanvas from '@/components/graph/Graph3DCanvas.vue';
import type { SelectedInfo as Graph3DSelected } from '@/components/graph/Graph3DCanvas.vue';
import GraphToolbar from '@/components/graph/GraphToolbar.vue';
import GraphLegend from '@/components/graph/GraphLegend.vue';
import GraphFiltersPanel from '@/components/graph/GraphFiltersPanel.vue';
import GraphSelectedCard from '@/components/graph/GraphSelectedCard.vue';
import GraphContextMenus from '@/components/graph/GraphContextMenus.vue';
import { useGraphPreferences } from '@/composables/graph/useGraphPreferences';
import { useGraphFilters, type GraphFilters } from '@/composables/graph/useGraphFilters';
import { useGraphSelection } from '@/composables/graph/useGraphSelection';
import { useGraphSigma, type Graph3DHandle } from '@/composables/graph/useGraphSigma';
import { useGraphNoteActions } from '@/composables/graph/useGraphNoteActions';
import { useNoteExport } from '@/composables/graph/useNoteExport';
import { useKinds } from '@/composables/useKinds';
import { useGraphPalette } from '@/composables/useGraphPalette';
import { computeLodTier, lodDensity3D } from '@/components/graph/lodConfig';
import type { KindDefinition } from '@continuum/shared';

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  /** Node id when a node menu is open; `null` otherwise. */
  nodeId: string | null;
  highlighted: boolean;
}

const router = useRouter();
const kindStore = useKinds();
const palette = useGraphPalette();

const prefs = useGraphPreferences();
const filters = useGraphFilters();
const selection = useGraphSelection({ highlightedIds: prefs.highlightedIds });
const noteExport = useNoteExport({ onError: (msg) => { graphError.value = msg; } });

const graph3dRef = ref<Graph3DHandle | null>(null);
const graphError = ref('');
const filtersOpen = ref(false);
const helpOpen = ref(false);

// The Filtri panel is exclusive to the 2D view (sliders drive Sigma /
// d3-force settings). Auto-close on switch to 3D so it doesn't pop
// back open the next time the user returns to 2D.
watch(() => prefs.viewMode.value, (mode) => {
  if (mode !== '2d' && filtersOpen.value) filtersOpen.value = false;
});

const contextMenu = reactive<ContextMenuState>({
  visible: false, x: 0, y: 0, nodeId: null, highlighted: false,
});

const sigma = useGraphSigma({
  prefs,
  filters,
  selection,
  palette,
  graph3dRef,
  kindStore: {
    load: (force?: boolean) => kindStore.load(force),
    kinds: kindStore.kinds,
    colorOf: (id) => kindStore.colorOf(id),
    iconOf: (id) => kindStore.iconOf(id),
  },
  onContextMenu: (evt) => openContextMenuAt(evt.id, evt.clientX, evt.clientY, evt.highlighted),
  onOpenNote: (id) => openNote(id),
  onCloseContextMenu: closeContextMenu,
});
// Local alias so the template can use `ref="container"` directly.
const container = sigma.container;

const actions = useGraphNoteActions({
  graphRef: sigma.graphRef,
  selection,
  prefs,
  refresh: () => sigma.refresh(),
  reload: () => sigma.load(),
  openNote: (id) => openNote(id),
  onError: graphActionError,
  syncStats: () => {
    const g = sigma.graphRef.value;
    if (g) sigma.stats.value = { nodes: g.order, edges: g.size };
  },
});

const isEmpty = computed(() => !sigma.loading.value && sigma.stats.value.nodes === 0);
const trimmedSearchQuery = computed(() => filters.searchQuery.value.trim());

const viewLabel = computed(() => {
  if (prefs.viewMode.value === '3d') return '3D spatial';
  return prefs.layoutMode.value === 'force' ? '2D live' : '2D ring';
});

const activeFilters = computed<KindDefinition[]>(() =>
  kindStore.kinds.value.filter((k) => prefs.hiddenKinds.has(k.id)),
);

const hasGraphFilters = computed(
  () => activeFilters.value.length > 0 || trimmedSearchQuery.value.length > 0,
);

const visibleStats = computed(() => {
  const graph = sigma.graphRef.value;
  if (!graph || prefs.hiddenKinds.size === 0) return sigma.stats.value;
  let nodes = 0;
  let edges = 0;
  graph.forEachNode((_id, attrs) => {
    const kind = String((attrs as { kind?: unknown }).kind ?? 'custom');
    if (!prefs.hiddenKinds.has(kind)) nodes += 1;
  });
  graph.forEachEdge((edge) => {
    const [source, target] = graph.extremities(edge);
    const sourceKind = String(graph.getNodeAttribute(source, 'kind') ?? 'custom');
    const targetKind = String(graph.getNodeAttribute(target, 'kind') ?? 'custom');
    if (!prefs.hiddenKinds.has(sourceKind) && !prefs.hiddenKinds.has(targetKind)) edges += 1;
  });
  return { nodes, edges };
});

/**
 * 3D LOD tier — driven purely by the visible-node count so the
 * `useNodeFactory` reducers can gate label sprite + halo creation
 * up-front (no per-frame allocation). Returns `near` whenever the
 * user has disabled adaptive LOD via the Filtri panel.
 */
const lod3DTier = computed(() => {
  if (!filters.filters.lodEnabled) return 'near' as const;
  return computeLodTier(lodDensity3D(visibleStats.value.nodes));
});

const contextMenuItems = computed<UiContextMenuItem[]>(() => {
  if (!contextMenu.nodeId) return [];
  return [
    { id: 'open-note', label: 'Open note', icon: 'node', onSelect: ctxOpenNote },
    { id: 'rename-note', label: 'Rename...', icon: 'edit', onSelect: ctxRenameNote },
    {
      id: 'toggle-highlight',
      label: contextMenu.highlighted ? 'Remove highlight' : 'Highlight node',
      icon: 'sparkles',
      active: contextMenu.highlighted,
      onSelect: ctxToggleHighlight,
    },
    { id: 'link-note', label: 'Link to note(s)...', icon: 'link', onSelect: ctxLinkNote },
    { id: 'hide-other-kinds', label: 'Hide other kinds', icon: 'eye-off', onSelect: ctxHideOtherKinds },
    { id: 'export-note', label: 'Export as Markdown...', icon: 'download', onSelect: ctxExportNote },
    { id: 'node-separator', divider: true },
    { id: 'delete-note', label: 'Delete note', icon: 'trash', danger: true, onSelect: ctxDeleteNote },
  ];
});

function iconNameOf(kind: string): IconName {
  return kindStore.iconOf(kind) as IconName;
}

function openNote(id: string): void {
  router.push({ path: '/', query: { note: id } });
}

function openContextMenuAt(id: string, x: number, y: number, highlighted: boolean): void {
  contextMenu.visible = true;
  contextMenu.x = x;
  contextMenu.y = y;
  contextMenu.nodeId = id;
  contextMenu.highlighted = highlighted;
}

function closeContextMenu(): void {
  setContextMenuOpen(false);
}

function setContextMenuOpen(value: boolean): void {
  contextMenu.visible = value;
  if (value) return;
  contextMenu.nodeId = null;
  contextMenu.highlighted = false;
}

function graphActionError(action: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  graphError.value = `${action}: ${message}`;
}

// ---------- Highlight / kind visibility helpers ----------

function setNodeHighlight(id: string, highlighted: boolean): void {
  const g = sigma.graphRef.value;
  if (!g || !g.hasNode(id)) return;
  g.setNodeAttribute(id, 'userHighlight', highlighted);
  const nextSet = new Set(prefs.highlightedIds.value);
  if (highlighted) nextSet.add(id); else nextSet.delete(id);
  prefs.highlightedIds.value = nextSet;
  prefs.saveHighlights();
  sigma.refresh();
}

function toggleKindVisibility(kind: string): void {
  if (prefs.hiddenKinds.has(kind)) prefs.hiddenKinds.delete(kind);
  else prefs.hiddenKinds.add(kind);
  sigma.refresh();
}

function showAllKinds(): void {
  prefs.hiddenKinds.clear();
  sigma.refresh();
}

function clearGraphFilters(): void {
  filters.clearSearch();
  showAllKinds();
}

function hideOtherKindsForNode(id: string): void {
  const g = sigma.graphRef.value;
  if (!g || !g.hasNode(id)) return;
  const kind = String(g.getNodeAttribute(id, 'kind') ?? 'custom');
  for (const k of kindStore.kinds.value) {
    if (k.id !== kind) prefs.hiddenKinds.add(k.id);
    else prefs.hiddenKinds.delete(k.id);
  }
  sigma.refresh();
}

// ---------- 3D bridge handlers ----------

function on3DSelect(info: Graph3DSelected | null): void {
  selection.selected.value = info;
  closeContextMenu();
}

function on3DContextMenu(evt: { id: string; clientX: number; clientY: number; highlighted: boolean }): void {
  openContextMenuAt(evt.id, evt.clientX, evt.clientY, evt.highlighted);
}

// ---------- Search ----------

function focusSearchResult(): void {
  const id = filters.findSearchTargetId(sigma.graphRef.value, prefs.hiddenKinds);
  const g = sigma.graphRef.value;
  if (!g || !id || !g.hasNode(id)) return;
  selection.selected.value = selection.buildSelected(g, id);
  sigma.focusNodeInCurrentView(id);
}

// ---------- Selected card actions ----------

function focusSelectedNode(): void {
  if (selection.selected.value) sigma.focusNodeInCurrentView(selection.selected.value.id);
}
function toggleSelectedHighlight(): void {
  const sel = selection.selected.value;
  if (!sel) return;
  setNodeHighlight(sel.id, !selection.selectedHighlighted.value);
}
function linkSelectedNote(): void {
  if (selection.selected.value) actions.openLinkModalFor(selection.selected.value.id);
}
function hideOtherKindsForSelected(): void {
  if (selection.selected.value) hideOtherKindsForNode(selection.selected.value.id);
}
function exportSelectedNote(): void {
  if (selection.selected.value) void noteExport.exportNoteAsMarkdown(selection.selected.value.id);
}

// ---------- Context-menu actions ----------

function ctxOpenNote(): void {
  if (contextMenu.nodeId) openNote(contextMenu.nodeId);
  closeContextMenu();
}
function ctxToggleHighlight(): void {
  const id = contextMenu.nodeId;
  if (!id) return;
  const next = !contextMenu.highlighted;
  setNodeHighlight(id, next);
  contextMenu.highlighted = next;
  closeContextMenu();
}
function ctxRenameNote(): void {
  // Capture target *before* closing — closeContextMenu nulls nodeId.
  const id = contextMenu.nodeId;
  if (!id) return;
  actions.beginRename(id);
  closeContextMenu();
}
function ctxDeleteNote(): void {
  const id = contextMenu.nodeId;
  if (!id) return;
  actions.beginDelete(id);
  closeContextMenu();
}
function ctxHideOtherKinds(): void {
  if (!contextMenu.nodeId) return;
  hideOtherKindsForNode(contextMenu.nodeId);
  closeContextMenu();
}
function ctxLinkNote(): void {
  if (!contextMenu.nodeId) return;
  actions.openLinkModalFor(contextMenu.nodeId);
  closeContextMenu();
}
function ctxExportNote(): void {
  const id = contextMenu.nodeId;
  closeContextMenu();
  if (id) void noteExport.exportNoteAsMarkdown(id);
}

// ---------- Filters ----------

function resetGraphFilters(): void {
  filters.resetFiltersToDefaults();
  // saveFilters fires from the watcher in useGraphSigma, but call it
  // explicitly so persistence is immediate.
  filters.saveFilters();
  sigma.refresh();
}

function applyFiltersUpdate(next: GraphFilters): void {
  Object.assign(filters.filters, next);
}

// ---------- Keyboard shortcuts + outside-click ----------

function onKeydown(e: KeyboardEvent): void {
  const target = e.target as HTMLElement | null;
  if (
    target
    && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(target.tagName))
  ) return;
  if (e.key === '+' || e.key === '=') { sigma.zoom(1); e.preventDefault(); }
  else if (e.key === '-' || e.key === '_') { sigma.zoom(-1); e.preventDefault(); }
  else if (e.key === '0') { sigma.fitToView(); e.preventDefault(); }
  else if (e.key === 'h' || e.key === 'H') { sigma.homeView(); e.preventDefault(); }
  else if (e.key === 'n' || e.key === 'N') { actions.openGraphCreate(); e.preventDefault(); }
  else if (e.key === 'Escape') {
    closeContextMenu();
    selection.selected.value = null;
    sigma.refresh();
  }
}

function onDocumentClick(e: MouseEvent): void {
  if (!prefs.legendOpen.value) return;
  const target = e.target as HTMLElement | null;
  if (target && !target.closest?.('.legend-pop') && !target.closest?.('.legend-btn')) {
    prefs.legendOpen.value = false;
  }
}

onMounted(() => {
  sigma.attach();
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('click', onDocumentClick);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('click', onDocumentClick);
  sigma.detach();
});
</script>

<template>
  <div class="graph-view">
    <div v-show="prefs.viewMode.value === '2d'" ref="container" class="canvas" />
    <Graph3DCanvas v-show="prefs.viewMode.value === '3d'" ref="graph3dRef" :payload="sigma.payload.value"
      :color-of="(k: string) => kindStore.colorOf(k)" :hidden-kinds="prefs.hiddenKinds"
      :highlighted-ids="prefs.highlightedIds.value" :search-query="filters.searchQuery.value"
      :selected-id="selection.selected.value?.id ?? null" :lod-tier="lod3DTier" @select="on3DSelect"
      @open-note="openNote" @context-menu="on3DContextMenu" />

    <GraphToolbar :loading="sigma.loading.value" :view-mode="prefs.viewMode.value" :layout-mode="prefs.layoutMode.value"
      :filters-open="filtersOpen" :search-query="filters.searchQuery.value" @create-note="actions.openGraphCreate"
      @reload="sigma.load" @set-view-mode="sigma.setViewMode" @set-layout="sigma.setLayout" @zoom="sigma.zoom"
      @fit-to-view="sigma.fitToView" @home-view="sigma.homeView" @view-axis="sigma.viewGraph3DAxis"
      @toggle-filters="filtersOpen = !filtersOpen" @update:search-query="filters.searchQuery.value = $event"
      @clear-search="filters.clearSearch" @submit-search="focusSearchResult" />

    <div v-if="graphError" class="panel graph-error" role="status" @click.stop>
      <Icon name="error" size="14" />
      <span>{{ graphError }}</span>
      <button type="button" aria-label="Dismiss graph error" @click="graphError = ''">
        <Icon name="close" size="12" />
      </button>
    </div>

    <GraphLegend :view-mode="prefs.viewMode.value" :view-label="viewLabel" :visible-stats="visibleStats"
      :trimmed-search-query="trimmedSearchQuery" :match-count="filters.matchedNodes.value.size"
      :has-graph-filters="hasGraphFilters" :legend-open="prefs.legendOpen.value" :kinds="kindStore.kinds.value"
      :hidden-kinds="prefs.hiddenKinds" :active-filters="activeFilters" @clear-filters="clearGraphFilters"
      @update:legend-open="prefs.legendOpen.value = $event" @toggle-kind="toggleKindVisibility"
      @show-all-kinds="showAllKinds" />

    <GraphSelectedCard v-if="selection.selected.value" :selected="selection.selected.value"
      :highlighted="selection.selectedHighlighted.value" :kind-color="kindStore.colorOf(selection.selected.value.kind)"
      :kind-label="kindStore.labelOf(selection.selected.value.kind)"
      :icon-name="iconNameOf(selection.selected.value.kind)" @close="selection.clearSelection" @open="openNote"
      @focus="focusSelectedNode" @toggle-highlight="toggleSelectedHighlight" @link="linkSelectedNote"
      @isolate="hideOtherKindsForSelected" @export="exportSelectedNote" />

    <transition name="filters-pop">
      <GraphFiltersPanel v-if="filtersOpen && prefs.viewMode.value === '2d'" :model-value="filters.filters"
        :search-query="filters.searchQuery.value" @update:model-value="applyFiltersUpdate"
        @update:search-query="filters.searchQuery.value = $event" @reset="resetGraphFilters"
        @close="filtersOpen = false" @rerun-layout="sigma.reRunLayout" />
    </transition>

    <div class="help-pill" role="button" tabindex="0" aria-label="Show graph shortcuts" @focus="helpOpen = true"
      @blur="helpOpen = false" @keydown.enter.prevent="helpOpen = !helpOpen"
      @keydown.space.prevent="helpOpen = !helpOpen" @mouseenter="helpOpen = true" @mouseleave="helpOpen = false">
      <Icon name="info" size="14" />
      <span>Shortcuts</span>
      <div v-if="helpOpen" class="help-pop">
        <div><b>N</b> new note</div>
        <div><b>+ / −</b> zoom in / out</div>
        <div><b>0</b> fit to view</div>
        <div><b>H</b> home orientation</div>
        <div v-if="prefs.viewMode.value === '3d'"><b>X/Y/Z</b> anchor drag to axis</div>
        <div v-if="prefs.viewMode.value === '3d'"><b>Right-drag</b> pan camera</div>
        <div><b>Esc</b> clear selection</div>
        <div><b>Drag</b> move node</div>
        <div><b>Right-click node</b> open menu</div>
        <div><b>Double-click</b> open note</div>
      </div>
    </div>

    <GraphContextMenus :context-menu="contextMenu" :context-menu-items="contextMenuItems"
      :rename-modal="actions.renameModal" :delete-modal="actions.deleteModal" :link-modal="actions.linkModal"
      :link-busy="actions.linkBusy.value" :graph-create-open="actions.graphCreateOpen.value"
      :graph-create-busy="actions.graphCreateBusy.value" :graph-create-error="actions.graphCreateError.value"
      @set-context-menu-open="setContextMenuOpen" @update:rename-open="actions.renameModal.open = $event"
      @submit-rename="actions.submitRename" @update:delete-open="actions.deleteModal.open = $event"
      @confirm-delete="actions.confirmDelete" @update:link-open="actions.linkModal.open = $event"
      @submit-links="actions.submitLinks" @update:graph-create-open="actions.graphCreateOpen.value = $event"
      @submit-graph-create="actions.submitGraphCreate" />

    <div v-if="isEmpty" class="empty">
      <UiCard padded>
        <UiEmpty title="Your graph is empty"
          description="Create a few notes and start linking them to see your world take shape.">
          <template #action>
            <UiButton variant="primary" @click="actions.openGraphCreate">
              <template #icon-left>
                <Icon name="plus" size="14" />
              </template>
              Create note
            </UiButton>
          </template>
        </UiEmpty>
      </UiCard>
    </div>
  </div>
</template>

<style scoped>
.graph-view {
  position: relative;
  height: 100%;
  width: 100%;
  min-height: 480px;
  overflow: hidden;
  border-radius: var(--radius-md);
}

.canvas {
  position: absolute;
  inset: 0;
  background-color: var(--bg);
  background-image: radial-gradient(circle, var(--border-subtle) 1px, transparent 1px);
  background-size: 24px 24px;
}

.canvas :deep(canvas) {
  image-rendering: auto;
  /*
   * Promote each Sigma WebGL layer to its own GPU-backed compositing
   * layer so the browser samples them at the native device pixel
   * ratio without re-rasterising the parent (which used to soften
   * the 2D graph at fractional DPRs like 156.25%).
   */
  transform: translateZ(0);
  backface-visibility: hidden;
}

/*
 * Sigma's `hoverNodes` WebGL layer redraws the hovered node's disc on
 * top of the `hovers` 2D canvas where our icon overlay lives — burying
 * the glyph. The `nodes` WebGL layer beneath already paints the disc,
 * so hiding `hoverNodes` is safe and lets our halo + icon + label pill
 * sit above it.
 */
.canvas :deep(canvas.sigma-hoverNodes) {
  display: none !important;
}

.panel {
  position: absolute;
  background: color-mix(in srgb, var(--surface-1) 94%, transparent);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  color: var(--fg);
  z-index: var(--z-raised);
}

.graph-error {
  top: calc(var(--space-5) + 46px);
  left: var(--space-5);
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr) 24px;
  align-items: center;
  gap: var(--space-3);
  max-width: min(520px, calc(100% - 2 * var(--space-7)));
  padding: var(--space-3) var(--space-4);
  color: var(--danger);
  background: var(--danger-soft);
  border-color: var(--danger);
  font-size: var(--text-sm);
}

.graph-error button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: var(--radius-sm);
}

.graph-error button:hover {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
}

.help-pill {
  position: absolute;
  bottom: var(--space-5);
  right: var(--space-5);
  display: inline-flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: color-mix(in srgb, var(--surface-1) 94%, transparent);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  color: var(--fg-muted);
  z-index: var(--z-raised);
  cursor: help;
}

.help-pill:focus-visible {
  outline: none;
  box-shadow: var(--shadow-focus);
}

.help-pop {
  position: absolute;
  bottom: calc(100% + 8px);
  right: 0;
  background: var(--surface-1);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  padding: var(--space-5) var(--space-6);
  font-size: var(--text-sm);
  color: var(--fg);
  white-space: nowrap;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.help-pop b {
  color: var(--accent);
  margin-right: var(--space-3);
}

.empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: var(--z-base);
}

.empty :deep(.ui-card) {
  pointer-events: auto;
  min-width: 320px;
}

@media (max-width: 720px) {
  .graph-view {
    min-height: 560px;
  }

  .help-pill {
    left: var(--space-3);
    right: var(--space-3);
    justify-content: center;
    bottom: var(--space-3);
  }

  .help-pop {
    right: 50%;
    transform: translateX(50%);
  }
}
</style>
