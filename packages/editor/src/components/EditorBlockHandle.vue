<script setup lang="ts">
/**
 * EditorBlockHandle
 *
 * Native block affordance for the Continuum block platform. Replaces
 * `@tiptap/extension-drag-handle` with a package-owned layer:
 *
 * - Hover detection uses Notion-like block rows: gutter, writing area, empty
 *   horizontal space and vertical gaps all resolve to the owning block.
 * - Placement uses the first-line rect of the block, so the toolbar aligns
 *   with the cursor regardless of block height.
 * - Drag-and-drop is pointer-driven (`setPointerCapture` + custom indicator),
 *   not HTML5 DnD, so it does not fight ProseMirror's own drop handlers and
 *   the snap is precise.
 * - A `ResizeObserver` follows dynamic blocks (callout expansion, chart
 *   resize, table edits) so the handle never drifts.
 */
import type { Editor } from '@tiptap/core';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import BlockActionMenu from './BlockActionMenu.vue';
import type { BlockDropTarget, BlockToolbarPlacement } from '../blocks/blockDrop';
import {
  getDropTargetAtCoords,
  getHoverBlockAtCoords,
  getToolbarPlacement,
} from '../blocks/blockDrop';
import type { EditorBlockSnapshot } from '../blocks/blockActions';
import {
  getBlockAtElement,
  getBlockAtPos,
  insertParagraphAfterBlock,
  listSiblingBlocks,
  moveBlockTo,
  selectBlock,
} from '../blocks/blockActions';

const DRAG_THRESHOLD_PX = 4;
const HIDE_DELAY_MS = 90;

const props = defineProps<{
  editor: Editor;
}>();

const root = ref<HTMLElement | null>(null);
const activeBlock = shallowRef<EditorBlockSnapshot | null>(null);
const toolbarPlacement = ref<BlockToolbarPlacement | null>(null);
const menuOpen = ref(false);
const menuOpensAbove = ref(false);
const pointerInsideHandle = ref(false);
const draggingBlock = shallowRef<EditorBlockSnapshot | null>(null);
const dropTarget = shallowRef<BlockDropTarget | null>(null);
const editable = ref(props.editor.isEditable);
const blockVersion = ref(0);

let hideTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;
let observedBlockEl: HTMLElement | null = null;
let dragPointerId: number | null = null;
let dragStartPoint: { x: number; y: number } | null = null;
let dragArmed = false;

const visible = computed(
  () => editable.value && activeBlock.value !== null && toolbarPlacement.value !== null,
);
const toolbarStyle = computed(() => ({
  left: `${toolbarPlacement.value?.x ?? 0}px`,
  top: `${toolbarPlacement.value?.y ?? 0}px`,
}));

const activeSiblings = computed(() => {
  const block = activeBlock.value;
  blockVersion.value;
  return block ? listSiblingBlocks(props.editor, block) : [];
});

const activeBlockIndex = computed(() => {
  const block = activeBlock.value;
  if (!block) return -1;
  return activeSiblings.value.findIndex(
    (candidate) => candidate.from === block.from && candidate.to === block.to,
  );
});

const canMoveUp = computed(() => activeBlockIndex.value > 0);
const canMoveDown = computed(() => {
  const index = activeBlockIndex.value;
  return index >= 0 && index < activeSiblings.value.length - 1;
});

const dropIndicatorStyle = computed(() => {
  const target = dropTarget.value;
  if (!target) return {};
  return {
    left: `${target.indicatorLeft}px`,
    top: `${target.indicatorTop}px`,
    width: `${target.indicatorWidth}px`,
  };
});

const dropAdjacentHighlights = computed(() => {
  const target = dropTarget.value;
  if (!target) return [];
  const highlights: { key: string; style: Record<string, string> }[] = [];
  const seen = new Set<string>();
  for (const block of [target.adjacent.before, target.adjacent.after]) {
    if (!block) continue;
    const key = `${block.from}:${block.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const el = getBlockElementFromSnapshot(block);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    highlights.push({
      key,
      style: {
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      },
    });
  }
  return highlights;
});

function syncEditable(): void {
  editable.value = props.editor.isEditable;
  blockVersion.value += 1;
  if (!editable.value) clearActiveBlock();
  else refreshActiveBlock();
}

function clearActiveBlock(): void {
  activeBlock.value = null;
  toolbarPlacement.value = null;
  menuOpen.value = false;
  menuOpensAbove.value = false;
  observeBlock(null);
}

function setActiveBlock(block: EditorBlockSnapshot): void {
  const placement = getToolbarPlacement(props.editor, block);
  if (!placement) {
    clearActiveBlock();
    return;
  }
  activeBlock.value = block;
  toolbarPlacement.value = placement;
  observeBlock(getBlockElementFromSnapshot(block));
  if (menuOpen.value) void nextTick(updateMenuPlacement);
}

function getBlockElementFromSnapshot(block: EditorBlockSnapshot): HTMLElement | null {
  const dom = props.editor.view.nodeDOM(block.pos);
  if (dom instanceof HTMLElement) return dom;
  if (dom instanceof Text) return dom.parentElement;
  return null;
}

function observeBlock(el: HTMLElement | null): void {
  if (!resizeObserver) return;
  if (observedBlockEl === el) return;
  if (observedBlockEl) resizeObserver.unobserve(observedBlockEl);
  observedBlockEl = el;
  if (el) resizeObserver.observe(el);
}

function refreshActiveBlock(): void {
  const block = activeBlock.value;
  if (!block) return;
  const fresh = getBlockAtPos(props.editor, block.from);
  if (!fresh) {
    clearActiveBlock();
    return;
  }
  setActiveBlock(fresh);
}

function refreshDropTarget(x: number, y: number): void {
  const source = draggingBlock.value;
  if (!source) return;
  const target = getDropTargetAtCoords(props.editor, x, y);
  if (!target) {
    dropTarget.value = null;
    return;
  }
  // Suppress drop indicator when the slot would be a no-op (inside source).
  if (target.position >= source.from && target.position <= source.to) {
    dropTarget.value = null;
    return;
  }
  dropTarget.value = target;
}

function scheduleHide(): void {
  if (hideTimer !== null) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    hideTimer = null;
    if (pointerInsideHandle.value || menuOpen.value || draggingBlock.value) return;
    clearActiveBlock();
  }, HIDE_DELAY_MS);
}

function onDocumentPointerMove(event: PointerEvent): void {
  if (!editable.value || draggingBlock.value) return;
  const target = event.target as Node | null;
  if (target && root.value?.contains(target)) return;
  if (menuOpen.value) return;
  const block = getHoverBlockAtCoords(props.editor, event.clientX, event.clientY)
    ?? getBlockAtElement(props.editor, target);
  if (!block) {
    scheduleHide();
    return;
  }
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
  setActiveBlock(block);
}

function onHandlePointerEnter(): void {
  pointerInsideHandle.value = true;
  if (hideTimer !== null) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }
}

function onHandlePointerLeave(): void {
  pointerInsideHandle.value = false;
  scheduleHide();
}

function onAddBelow(event: Event): void {
  event.preventDefault();
  event.stopPropagation();
  const block = activeBlock.value;
  if (!block) return;
  insertParagraphAfterBlock(props.editor, block);
  refreshActiveBlock();
}

function onGripPointerDown(event: PointerEvent): void {
  if (event.button !== 0) return;
  const block = activeBlock.value;
  if (!block) return;
  event.preventDefault();
  const target = event.currentTarget as HTMLElement;
  target.setPointerCapture(event.pointerId);
  dragPointerId = event.pointerId;
  dragStartPoint = { x: event.clientX, y: event.clientY };
  dragArmed = true;
  menuOpen.value = false;
  selectBlock(props.editor, block);
}

function onGripPointerMove(event: PointerEvent): void {
  if (dragPointerId !== event.pointerId || !dragStartPoint) return;
  if (!draggingBlock.value && dragArmed) {
    const dx = event.clientX - dragStartPoint.x;
    const dy = event.clientY - dragStartPoint.y;
    if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    const block = activeBlock.value;
    if (!block) return;
    draggingBlock.value = block;
  }
  if (draggingBlock.value) {
    refreshDropTarget(event.clientX, event.clientY);
  }
}

function onGripPointerUp(event: PointerEvent): void {
  if (dragPointerId !== event.pointerId) return;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }
  const dragging = draggingBlock.value;
  const drop = dropTarget.value;
  const wasDrag = dragging !== null;
  dragPointerId = null;
  dragStartPoint = null;
  dragArmed = false;
  draggingBlock.value = null;
  dropTarget.value = null;
  if (wasDrag) {
    if (dragging && drop) {
      const fresh = getBlockAtPos(props.editor, dragging.from) ?? dragging;
      moveBlockTo(props.editor, fresh, drop.position);
    }
    refreshActiveBlock();
    return;
  }
  // Pointer-up without a drag = click. Toggle the actions menu.
  toggleMenu();
}

function onGripPointerCancel(event: PointerEvent): void {
  if (dragPointerId !== event.pointerId) return;
  const target = event.currentTarget as HTMLElement;
  if (target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
  }
  dragPointerId = null;
  dragStartPoint = null;
  dragArmed = false;
  draggingBlock.value = null;
  dropTarget.value = null;
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return;
  if (draggingBlock.value) {
    draggingBlock.value = null;
    dropTarget.value = null;
    dragPointerId = null;
    dragStartPoint = null;
    dragArmed = false;
    return;
  }
  if (menuOpen.value) {
    menuOpen.value = false;
    menuOpensAbove.value = false;
  }
}

function closeMenu(): void {
  menuOpen.value = false;
  menuOpensAbove.value = false;
  refreshActiveBlock();
}

function updateMenuPlacement(): void {
  const handle = root.value;
  const placement = toolbarPlacement.value;
  if (!menuOpen.value || !handle || !placement) {
    menuOpensAbove.value = false;
    return;
  }
  const menu = handle.querySelector<HTMLElement>('.continuum-block-menu');
  if (!menu) return;
  const handleHeight = handle.getBoundingClientRect().height;
  const menuHeight = menu.offsetHeight;
  const availableBelow = window.innerHeight - (placement.y + handleHeight) - 12;
  const availableAbove = placement.y - 12;
  menuOpensAbove.value = availableBelow < menuHeight && availableAbove > availableBelow;
}

function toggleMenu(): void {
  const block = activeBlock.value;
  if (!block) return;
  selectBlock(props.editor, block);
  menuOpen.value = !menuOpen.value;
  if (menuOpen.value) void nextTick(updateMenuPlacement);
  else menuOpensAbove.value = false;
}

function onDocumentPointerDown(event: PointerEvent): void {
  if (!menuOpen.value) return;
  const target = event.target as Node | null;
  if (target && (root.value?.contains(target) || isBlockMenuOverlayTarget(target))) return;
  menuOpen.value = false;
  menuOpensAbove.value = false;
  scheduleHide();
}

function onDocumentScroll(): void {
  if (draggingBlock.value) return;
  dropTarget.value = null;
  clearActiveBlock();
}

function isBlockMenuOverlayTarget(target: Node): boolean {
  return target instanceof Element && target.closest('.continuum-block-menu__submenu') !== null;
}

onMounted(() => {
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => refreshActiveBlock());
  }
  document.addEventListener('pointermove', onDocumentPointerMove, { passive: true });
  document.addEventListener('scroll', onDocumentScroll, true);
  window.addEventListener('resize', refreshActiveBlock, { passive: true });
  window.addEventListener('resize', updateMenuPlacement, { passive: true });
  document.addEventListener('pointerdown', onDocumentPointerDown, true);
  document.addEventListener('keydown', onDocumentKeyDown);
  props.editor.on('transaction', syncEditable);
  props.editor.on('update', syncEditable);
});

onBeforeUnmount(() => {
  if (hideTimer !== null) clearTimeout(hideTimer);
  document.removeEventListener('pointermove', onDocumentPointerMove);
  document.removeEventListener('scroll', onDocumentScroll, true);
  window.removeEventListener('resize', refreshActiveBlock);
  window.removeEventListener('resize', updateMenuPlacement);
  document.removeEventListener('pointerdown', onDocumentPointerDown, true);
  document.removeEventListener('keydown', onDocumentKeyDown);
  props.editor.off('transaction', syncEditable);
  props.editor.off('update', syncEditable);
  if (resizeObserver) {
    if (observedBlockEl) resizeObserver.unobserve(observedBlockEl);
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  observedBlockEl = null;
});
</script>

<template>
  <div class="continuum-block-affordance-layer" aria-hidden="false">
    <div
      v-if="visible && activeBlock"
      ref="root"
      class="continuum-block-handle"
      :class="{
        'is-menu-open': menuOpen,
        'is-menu-above': menuOpensAbove,
        'is-dragging': draggingBlock !== null,
        'is-nested': activeBlock.depth > 0,
      }"
      :style="toolbarStyle"
      @pointerenter="onHandlePointerEnter"
      @pointerleave="onHandlePointerLeave"
    >
      <button
        type="button"
        class="continuum-block-handle__button"
        title="Add block below"
        aria-label="Add block below"
        @pointerdown.prevent.stop
        @click="onAddBelow"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            d="M8 3v10M3 8h10"
          />
        </svg>
      </button>

      <button
        type="button"
        class="continuum-block-handle__button continuum-block-handle__grip"
        title="Drag to move, click for actions"
        aria-label="Drag to move, click for actions"
        :aria-expanded="menuOpen"
        aria-haspopup="menu"
        @pointerdown="onGripPointerDown"
        @pointermove="onGripPointerMove"
        @pointerup="onGripPointerUp"
        @pointercancel="onGripPointerCancel"
      >
        <svg viewBox="0 0 10 16" width="10" height="16" aria-hidden="true">
          <circle cx="2" cy="3" r="1.1" fill="currentColor" />
          <circle cx="2" cy="8" r="1.1" fill="currentColor" />
          <circle cx="2" cy="13" r="1.1" fill="currentColor" />
          <circle cx="8" cy="3" r="1.1" fill="currentColor" />
          <circle cx="8" cy="8" r="1.1" fill="currentColor" />
          <circle cx="8" cy="13" r="1.1" fill="currentColor" />
        </svg>
      </button>

      <BlockActionMenu
        v-if="menuOpen"
        :editor="editor"
        :block="activeBlock"
        :can-move-up="canMoveUp"
        :can-move-down="canMoveDown"
        @close="closeMenu"
      />
    </div>

    <div
      v-if="draggingBlock && dropTarget"
      class="continuum-block-drop-indicator"
      :style="dropIndicatorStyle"
    />
    <div
      v-for="highlight in dropAdjacentHighlights"
      :key="highlight.key"
      class="continuum-block-drop-adjacent-highlight"
      :style="highlight.style"
    />
  </div>
</template>

