<script setup lang="ts">
/**
 * EditorDragHandle
 * ────────────────────────────────────────────────────────────────────
 * Block-level drag affordance that follows the block under the cursor.
 * Wraps the official `DragHandle` Vue component shipped by
 * `@tiptap/extension-drag-handle-vue-3`, which mounts the underlying
 * `@tiptap/extension-drag-handle` plugin and exposes a slot for the
 * handle UI itself.
 *
 * Behaviour:
 *   • Hover/active block becomes draggable to any drop position.
 *   • Hidden when the editor is read-only.
 *   • The handle sits in the gutter outside the writing area — exact
 *     positioning is delegated to the wrapper plugin, we only style
 *     the visual marker.
 *
 * Kept stateless on purpose; reordering is performed by ProseMirror
 * itself, so there is nothing to emit.
 */
import type { Editor } from '@tiptap/core';
import { DragHandle } from '@tiptap/extension-drag-handle-vue-3';
import { TextSelection } from '@tiptap/pm/state';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{
  editor: Editor;
}>();

/**
 * Track Tiptap's `isEditable` flag reactively. The official
 * DragHandle plugin does not gate itself on edit-state, so when the
 * note is locked we have to manually suppress the affordance —
 * unmounting the wrapper would tear down its body-portaled Tippy
 * popup mid-patch and crash the Vue reconciler.
 */
const editable = ref(props.editor.isEditable);
function syncEditable(): void {
  editable.value = props.editor.isEditable;
}
onMounted(() => {
  props.editor.on('transaction', syncEditable);
  props.editor.on('update', syncEditable);
});

const grabbingGrip = ref(false);

const dragHandleTippyOptions = {
  interactive: true,
  interactiveBorder: 28,
  offset: [0, 8] as [number, number],
  zIndex: 90,
};

const wrapperClass = computed(() =>
  editable.value ? 'continuum-drag-handle' : 'continuum-drag-handle is-locked',
);

/**
 * Collapse any active text selection at the start of a block-drag
 * gesture. The bubble menu's `shouldShow` returns `false` when the
 * selection is empty, so dismissing it is just a matter of nudging
 * the selection to a single caret position — no global flags, no
 * Tippy fight, no stale state to clean up. ProseMirror itself wipes
 * the DOM selection during the native drag anyway; doing it
 * explicitly on `pointerdown` covers the gap *before* the drag
 * actually begins.
 */
function dismissBubbleMenu(): void {
  const { state, view } = props.editor;
  const { selection } = state;
  // Already collapsed text caret -> nothing to do.
  if (selection instanceof TextSelection && selection.empty) return;
  // `TextSelection.near` always lands on a position with inline
  // content, so it copes with NodeSelection (which the drag handle
  // installs on the grabbed block) without throwing.
  const target = TextSelection.near(state.doc.resolve(selection.from));
  view.dispatch(state.tr.setSelection(target));
}

function onGripPointerDown(): void {
  grabbingGrip.value = true;
  dismissBubbleMenu();
  window.addEventListener('pointerup', finishGripInteraction, { once: true });
  window.addEventListener('pointercancel', finishGripInteraction, { once: true });
}

function finishGripInteraction(): void {
  grabbingGrip.value = false;
}

onBeforeUnmount(() => {
  window.removeEventListener('pointerup', finishGripInteraction);
  window.removeEventListener('pointercancel', finishGripInteraction);
  props.editor.off('transaction', syncEditable);
  props.editor.off('update', syncEditable);
});
</script>

<template>
  <DragHandle :editor="editor" :class="wrapperClass" :tippy-options="dragHandleTippyOptions">
    <span class="continuum-drag-handle__grip" :class="{ 'is-grabbing': grabbingGrip }" aria-hidden="true"
      @pointerdown.stop="onGripPointerDown" @dragend.stop="finishGripInteraction">
      <svg viewBox="0 0 10 16" width="10" height="16">
        <circle cx="2" cy="3" r="1.1" fill="currentColor" />
        <circle cx="2" cy="8" r="1.1" fill="currentColor" />
        <circle cx="2" cy="13" r="1.1" fill="currentColor" />
        <circle cx="8" cy="3" r="1.1" fill="currentColor" />
        <circle cx="8" cy="8" r="1.1" fill="currentColor" />
        <circle cx="8" cy="13" r="1.1" fill="currentColor" />
      </svg>
    </span>
  </DragHandle>
</template>
