<script setup lang="ts">
/**
 * Slash-command popup.
 *
 * Driven entirely through props by `SlashCommand.ts`'s renderer bridge:
 * the parent re-emits `props` whenever the user types, so this component
 * is purely declarative — render the filtered list, highlight the active
 * row, and call `command(item)` on Enter / click.
 *
 * Positioning uses the trigger's client rect with a flip-up fallback
 * when the popup would overflow the viewport bottom; we deliberately
 * avoid Floating UI / popper to keep the editor bundle lean.
 */
import { computed, inject, nextTick, ref, watch } from 'vue';
import { ICON_COMPONENT_KEY } from '../../hostBridge';
import {
  SLASH_COMMAND_SECTIONS,
  type SlashCommandItem,
  type SlashCommandSection,
} from './slashCommandItems';

const props = defineProps<{
  items: SlashCommandItem[];
  query: string;
  /** Live caret/trigger rect; null while exiting. */
  clientRect: (() => DOMRect | null) | null;
  /** Run the chosen command (replaces `/query` with the resulting block). */
  onCommand: (item: SlashCommandItem) => void;
}>();

defineExpose({ onKeyDown });

const IconComponent = inject(ICON_COMPONENT_KEY, null);

const root = ref<HTMLDivElement | null>(null);
const listEl = ref<HTMLDivElement | null>(null);
const selected = ref(0);

/** Group items into the canonical section order, dropping empty sections. */
const grouped = computed<{ section: SlashCommandSection; items: SlashCommandItem[] }[]>(() => {
  const buckets = new Map<SlashCommandSection, SlashCommandItem[]>();
  for (const item of props.items) {
    const list = buckets.get(item.section) ?? [];
    list.push(item);
    buckets.set(item.section, list);
  }
  return SLASH_COMMAND_SECTIONS
    .map((section) => ({ section, items: buckets.get(section) ?? [] }))
    .filter((g) => g.items.length > 0);
});

/**
 * Flatten groups in render order so arrow-key navigation maps 1-to-1
 * with the indices in `props.items` after grouping. Re-derived (rather
 * than relying on `props.items`) because items are reordered by section.
 */
const flat = computed<SlashCommandItem[]>(() => {
  const out: SlashCommandItem[] = [];
  for (const g of grouped.value) for (const it of g.items) out.push(it);
  return out;
});

const POPUP_WIDTH = 320;
const POPUP_MAX_HEIGHT = 360;
const VIEWPORT_MARGIN = 8;

const position = ref<{ top: number; left: number; placement: 'below' | 'above' }>({
  top: 0,
  left: 0,
  placement: 'below',
});

function updatePosition(): void {
  const rect = props.clientRect?.();
  if (!rect) return;
  const spaceBelow = window.innerHeight - rect.bottom;
  const placeAbove = spaceBelow < POPUP_MAX_HEIGHT + VIEWPORT_MARGIN;
  const top = placeAbove ? rect.top - POPUP_MAX_HEIGHT - 6 : rect.bottom + 6;
  // Clamp horizontally so the popup never escapes the viewport edges.
  const maxLeft = window.innerWidth - POPUP_WIDTH - VIEWPORT_MARGIN;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft));
  position.value = {
    top: Math.max(VIEWPORT_MARGIN, top),
    left,
    placement: placeAbove ? 'above' : 'below',
  };
}

watch(() => props.clientRect, () => updatePosition(), { immediate: true });
watch(
  () => props.items,
  () => {
    // Reset selection whenever the filtered list changes so the
    // highlighted row is always a valid one in the new list.
    selected.value = 0;
    void nextTick(updatePosition);
  },
);

function scrollSelectedIntoView(): void {
  const list = listEl.value;
  if (!list) return;
  const el = list.querySelector<HTMLButtonElement>(`[data-index="${selected.value}"]`);
  if (!el) return;
  const top = el.offsetTop;
  const bottom = top + el.offsetHeight;
  if (top < list.scrollTop) list.scrollTop = top;
  else if (bottom > list.scrollTop + list.clientHeight)
    list.scrollTop = bottom - list.clientHeight;
}

/**
 * Called by the parent renderer for every keydown while the popup is
 * active. Returning `true` stops Tiptap from also running the keystroke
 * (e.g. so Enter doesn't insert a newline).
 */
function onKeyDown({ event }: { event: KeyboardEvent }): boolean {
  const total = flat.value.length;
  if (total === 0) {
    return event.key === 'Escape';
  }
  switch (event.key) {
    case 'ArrowDown':
      selected.value = (selected.value + 1) % total;
      void nextTick(scrollSelectedIntoView);
      return true;
    case 'ArrowUp':
      selected.value = (selected.value - 1 + total) % total;
      void nextTick(scrollSelectedIntoView);
      return true;
    case 'Enter':
    case 'Tab': {
      const item = flat.value[selected.value];
      if (item) props.onCommand(item);
      return true;
    }
    case 'Escape':
      return true;
    default:
      return false;
  }
}

/** Map a section+row pair back to its flat index for selection state. */
function flatIndex(section: SlashCommandSection, row: number): number {
  let offset = 0;
  for (const g of grouped.value) {
    if (g.section === section) return offset + row;
    offset += g.items.length;
  }
  return -1;
}
</script>

<template>
  <div
    ref="root"
    class="continuum-slash-menu"
    :style="{ top: `${position.top}px`, left: `${position.left}px`, width: `${POPUP_WIDTH}px` }"
    role="listbox"
    aria-label="Insert block"
  >
    <header class="continuum-slash-menu__header">
      <span class="continuum-slash-menu__hint">
        {{ query ? `Filter: “${query}”` : 'Type to filter' }}
      </span>
    </header>

    <div ref="listEl" class="continuum-slash-menu__list">
      <template v-if="flat.length > 0">
        <section
          v-for="group in grouped"
          :key="group.section"
          class="continuum-slash-menu__group"
        >
          <h4 class="continuum-slash-menu__group-title">{{ group.section }}</h4>
          <button
            v-for="(item, row) in group.items"
            :key="item.id"
            type="button"
            class="continuum-slash-menu__item"
            :class="{ 'is-active': flatIndex(group.section, row) === selected }"
            :data-index="flatIndex(group.section, row)"
            role="option"
            :aria-selected="flatIndex(group.section, row) === selected"
            @mousedown.prevent
            @mouseenter="selected = flatIndex(group.section, row)"
            @click="onCommand(item)"
          >
            <span class="continuum-slash-menu__icon" aria-hidden="true">
              <component
                v-if="IconComponent"
                :is="IconComponent"
                :name="item.icon"
                :size="18"
              />
            </span>
            <span class="continuum-slash-menu__text">
              <span class="continuum-slash-menu__title">{{ item.title }}</span>
              <span class="continuum-slash-menu__desc">{{ item.description }}</span>
            </span>
          </button>
        </section>
      </template>
      <p v-else class="continuum-slash-menu__empty">
        No matching blocks
      </p>
    </div>

    <footer class="continuum-slash-menu__footer">
      <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
      <span><kbd>↵</kbd> select</span>
      <span><kbd>esc</kbd> close</span>
    </footer>
  </div>
</template>
