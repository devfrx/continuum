<script setup lang="ts">
/**
 * BubbleMenuPopover
 * ────────────────────────────────────────────────────────────────────
 * Lightweight click-to-open popover used by the bubble menu to host
 * grouped commands (heading level, list type, alignment, colour…).
 *
 * Why not Tippy/Floating-UI? The bubble menu itself is already a tippy
 * instance; nesting another floating-UI tree inside the same selection
 * change cycle adds noticeable render lag and breaks selection
 * preservation when the focus jumps between popups. A plain absolute
 * panel anchored to the trigger is enough — the parent bubble is
 * already pinned to the user's selection, so the popover never needs
 * its own collision detection.
 *
 * Selection preservation:
 *   • The trigger button uses `pointerdown` with `preventDefault` so
 *     the editor's selection survives the click. Tiptap commands fired
 *     from the panel can therefore run against the original range.
 *   • The panel closes on outside-click (any pointerdown that does not
 *     land inside the wrapper) and on Escape.
 */
import { ref, onBeforeUnmount, onMounted } from 'vue';
import { useContinuumScrollLock } from '../composables/useContinuumScrollLock';

withDefaults(
  defineProps<{
    /** Tooltip + aria-label for the trigger. */
    label: string;
    /** Whether to render the trigger in the active accent style. */
    active?: boolean;
    /** Mark the trigger as "compound" — disables the chevron when true. */
    noChevron?: boolean;
  }>(),
  { active: false, noChevron: false },
);

const open = ref(false);
const root = ref<HTMLElement | null>(null);
useContinuumScrollLock(open);

function toggle(ev: PointerEvent | MouseEvent): void {
  // Block focus theft so the editor's selection survives.
  ev.preventDefault();
  open.value = !open.value;
}

function close(): void {
  open.value = false;
}

function onDocPointerDown(ev: PointerEvent): void {
  if (!open.value) return;
  const target = ev.target as Node | null;
  if (root.value && target && root.value.contains(target)) return;
  open.value = false;
}

function onKeyDown(ev: KeyboardEvent): void {
  if (open.value && ev.key === 'Escape') {
    open.value = false;
    ev.stopPropagation();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown, true);
  document.addEventListener('keydown', onKeyDown, true);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  document.removeEventListener('keydown', onKeyDown, true);
});

defineExpose({ close });
</script>

<template>
  <div ref="root" class="bm-popover" :class="{ 'is-open': open }">
    <button type="button" class="bm-btn bm-popover__trigger" :class="{ active }" :aria-haspopup="true"
      :aria-expanded="open" :title="label" :aria-label="label" @pointerdown="toggle">
      <slot name="trigger" />
      <svg v-if="!noChevron" class="bm-popover__chevron" viewBox="0 0 8 8" width="8" height="8" aria-hidden="true">
        <path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"
          d="M2 3l2 2l2-2" />
      </svg>
    </button>
    <div v-if="open" class="bm-popover__panel" role="menu" data-continuum-scroll-lock-allow="true"
      @pointerdown.stop>
      <slot :close="close" />
    </div>
  </div>
</template>
