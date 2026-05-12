<script setup lang="ts">
/**
 * `CellEditorPortal` — teleported popover used for property editors that
 * require more width / vertical room than a row affords (date pickers,
 * select lists, file dropzones, relation lookups, …).
 *
 * Anchors itself under a trigger element passed by the caller, closes on
 * outside-click or Escape, and lays out via fixed positioning so it
 * floats above any scrolling table content.
 *
 * The popover is content-agnostic — consumers pass an editor in the
 * default slot.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{
  /** Trigger element under which the popover should appear. */
  anchor: HTMLElement | null;
  /** Minimum popover width in pixels (defaults to anchor width). */
  minWidth?: number;
}>();

const emit = defineEmits<{ close: [] }>();

const root = ref<HTMLDivElement | null>(null);
const position = ref({ top: 0, left: 0, width: 0 });

function reposition(): void {
  const el = props.anchor;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const width = Math.max(rect.width, props.minWidth ?? 0);
  // Constrain to the viewport so the popover never spills off-screen.
  const left = Math.min(rect.left, window.innerWidth - width - 8);
  position.value = {
    top: rect.bottom + 4,
    left: Math.max(8, left),
    width,
  };
}

function onDocClick(event: MouseEvent): void {
  if (!root.value) return;
  if (root.value.contains(event.target as Node)) return;
  if (props.anchor && props.anchor.contains(event.target as Node)) return;
  emit('close');
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape') emit('close');
}

onMounted(() => {
  reposition();
  window.addEventListener('resize', reposition);
  window.addEventListener('scroll', reposition, true);
  document.addEventListener('mousedown', onDocClick);
  document.addEventListener('keydown', onKey);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', reposition);
  window.removeEventListener('scroll', reposition, true);
  document.removeEventListener('mousedown', onDocClick);
  document.removeEventListener('keydown', onKey);
});

watch(() => props.anchor, reposition);

const style = computed(() => ({
  top: `${position.value.top}px`,
  left: `${position.value.left}px`,
  minWidth: `${position.value.width}px`,
}));
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="cell-portal" :style="style" role="dialog">
      <slot />
    </div>
  </Teleport>
</template>

<style scoped>
.cell-portal {
  position: fixed;
  z-index: 1000;
  background: var(--bg);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 12px 32px rgb(0 0 0 / 0.32);
  padding: var(--space-2);
  max-width: min(420px, calc(100vw - 16px));
}
</style>
