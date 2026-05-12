<script setup lang="ts">
/**
 * Horizontal saved-view tab strip rendered above the database toolbar.
 *
 * Owns the `useViewList` instance for the current kind, drives:
 *   - tab activation (clicking a tab routes to `database-view-saved`),
 *   - drag-and-drop reorder via native HTML5 DnD (persisted with
 *     `viewList.reorder`),
 *   - "+ New view" trailing button that opens {@link NewViewPopover},
 *   - per-tab context menu via {@link ViewMenu}.
 *
 * The composable is created here (not lifted to the page) so the tab
 * strip is the single source of truth for the kind's view list across
 * the page lifetime; the {@link useDatabaseView} composable in the page
 * still independently fetches the active view's full config.
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useViewList } from '@/composables/database/useViewList';
import type { ViewSummary } from '@/api';
import ViewTab from './ViewTab.vue';
import ViewMenu from './ViewMenu.vue';
import NewViewPopover from './NewViewPopover.vue';

const props = defineProps<{
  kindId: string;
  currentViewId: string | null;
}>();

const router = useRouter();
const kindIdRef = computed(() => props.kindId);
const viewList = useViewList(kindIdRef);

/** Stable lexorank-ordered view list (server already returns sorted). */
const orderedViews = computed<ViewSummary[]>(() => viewList.views.value);

/** True for the routed view, or for the default view when nothing is routed. */
function isActive(v: ViewSummary): boolean {
  if (props.currentViewId) return v.id === props.currentViewId;
  return v.isDefault;
}

function onSelect(v: ViewSummary): void {
  void router.push({
    name: 'database-view-saved',
    params: { kindId: props.kindId, viewId: v.id },
  });
}

// ── Context menu ─────────────────────────────────────────────────────
const menuOpen = ref(false);
const menuView = ref<ViewSummary | null>(null);
const menuX = ref(0);
const menuY = ref(0);
const menuIsCurrent = computed(() => !!menuView.value && isActive(menuView.value));

function openMenu(v: ViewSummary, x: number, y: number): void {
  menuView.value = v;
  menuX.value = x;
  menuY.value = y;
  menuOpen.value = true;
}

// ── New-view popover ─────────────────────────────────────────────────
const newOpen = ref(false);
const newBtn = ref<HTMLButtonElement | null>(null);

function onCreated(v: ViewSummary): void {
  void router.push({
    name: 'database-view-saved',
    params: { kindId: props.kindId, viewId: v.id },
  });
}

// ── Drag-and-drop reorder ────────────────────────────────────────────
const dragId = ref<string | null>(null);

function onDragStart(v: ViewSummary, e: DragEvent): void {
  dragId.value = v.id;
  e.dataTransfer?.setData('text/plain', v.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e: DragEvent): void {
  if (!dragId.value) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function onDrop(target: ViewSummary, e: DragEvent): void {
  e.preventDefault();
  const sourceId = dragId.value;
  dragId.value = null;
  if (!sourceId || sourceId === target.id) return;
  const ids = orderedViews.value.map((v) => v.id);
  const fromIdx = ids.indexOf(sourceId);
  const toIdx = ids.indexOf(target.id);
  if (fromIdx < 0 || toIdx < 0) return;
  ids.splice(fromIdx, 1);
  ids.splice(toIdx, 0, sourceId);
  void viewList.reorder(ids);
}

function onDragEnd(): void {
  dragId.value = null;
}
</script>

<template>
  <div class="view-tabs" role="tablist">
    <div class="view-tabs__strip">
      <div
        v-for="v in orderedViews"
        :key="v.id"
        class="view-tabs__slot"
        draggable="true"
        @dragstart="(e: DragEvent) => onDragStart(v, e)"
        @dragover="onDragOver"
        @drop="(e: DragEvent) => onDrop(v, e)"
        @dragend="onDragEnd"
      >
        <ViewTab
          :view="v"
          :active="isActive(v)"
          @select="onSelect(v)"
          @context-menu="(x: number, y: number) => openMenu(v, x, y)"
        />
      </div>
      <button
        ref="newBtn"
        type="button"
        class="view-tabs__new"
        :disabled="!kindId"
        @click="newOpen = true"
      >
        <Icon name="plus" :size="14" />
        <span>New view</span>
      </button>
    </div>

    <NewViewPopover
      v-model:open="newOpen"
      :trigger-ref="newBtn"
      :view-list="viewList"
      @created="onCreated"
    />

    <ViewMenu
      v-model:open="menuOpen"
      :x="menuX"
      :y="menuY"
      :kind-id="kindId"
      :view="menuView"
      :siblings="orderedViews"
      :view-list="viewList"
      :is-current="menuIsCurrent"
    />
  </div>
</template>

<style scoped>
.view-tabs {
  display: flex;
  align-items: stretch;
  width: 100%;
  min-height: 36px;
}
.view-tabs__strip {
  display: flex;
  align-items: stretch;
  gap: var(--space-1);
  flex: 1;
  overflow-x: auto;
  padding: 0 var(--space-3);
  scrollbar-width: thin;
}
.view-tabs__slot {
  display: inline-flex;
  align-items: stretch;
}
.view-tabs__new {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  background: transparent;
  border: none;
  color: var(--fg-muted);
  padding: 0 var(--space-3);
  cursor: pointer;
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
  white-space: nowrap;
  transition:
    color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard);
}
.view-tabs__new:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--fg);
}
.view-tabs__new:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
