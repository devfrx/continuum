<script setup lang="ts">
/**
 * EditorTableOfContents
 * ────────────────────────────────────────────────────────────────────
 * Sidebar renderer for the headings emitted by `buildTableOfContents`.
 * The component is intentionally pure: it consumes a flat `TocAnchor[]`
 * list and emits an `anchor-click` event when the user picks an entry,
 * leaving navigation (smooth scroll, route push, etc.) to the host.
 *
 * Visual conventions match the rest of the package:
 *   • Hierarchical indentation derived from `anchor.level`.
 *   • The currently active heading is highlighted with the accent
 *     colour; already-scrolled-past headings dim slightly to keep
 *     the user oriented at a glance.
 *   • The whole panel auto-hides when the document has no headings,
 *     so hosts can mount it unconditionally next to the editor.
 *   • Collapsible: the header acts as a toggle so authors can keep
 *     the sidebar visible while reclaiming horizontal space at will.
 *     Collapsed state is component-local; hosts that want persistence
 *     should drive `collapsed` via `v-model:collapsed`.
 */
import type { TocAnchor } from '../extensions/TableOfContents';

const props = withDefaults(
  defineProps<{
    anchors: TocAnchor[];
    /** Optional title shown above the list. Defaults to "On this page". */
    title?: string;
    /**
     * Initial / external collapsed state. Wire with `v-model:collapsed`
     * to persist the user's preference at the host level (e.g. via
     * localStorage in `NotesView`).
     */
    collapsed?: boolean;
  }>(),
  { collapsed: false },
);

const emit = defineEmits<{
  /**
   * User picked an entry. Receives the anchor descriptor so the host
   * can decide whether to scrollIntoView the matching DOM node, push
   * a hash route, etc.
   */
  (e: 'anchor-click', anchor: TocAnchor): void;
  /** Sync the collapsed state back to the host (`v-model:collapsed`). */
  (e: 'update:collapsed', value: boolean): void;
}>();

function toggleCollapsed(): void {
  emit('update:collapsed', !props.collapsed);
}

function onClick(anchor: TocAnchor): void {
  emit('anchor-click', anchor);
}
</script>

<template>
  <nav v-if="anchors.length" class="continuum-toc" :class="{ 'is-collapsed': collapsed }"
    :aria-label="title ?? 'Table of contents'">
    <button type="button" class="continuum-toc__head" :aria-expanded="!collapsed"
      :title="collapsed ? 'Expand outline' : 'Collapse outline'" @click="toggleCollapsed">
      <span class="continuum-toc__head-main">
        <svg class="continuum-toc__chevron" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
          <path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"
            d="M4 3l3 3l-3 3" />
        </svg>
        <span class="continuum-toc__title">{{ title ?? 'On this page' }}</span>
      </span>
      <span class="continuum-toc__count">{{ anchors.length }}</span>
    </button>
    <ol v-show="!collapsed" class="continuum-toc__list">
      <li v-for="anchor in anchors" :key="anchor.id" class="continuum-toc__item" :class="{
        'is-active': anchor.isActive,
        'is-scrolled': anchor.isScrolledOver && !anchor.isActive,
      }" :style="{ '--toc-indent': anchor.level }">
        <button type="button" class="continuum-toc__link" :title="anchor.textContent"
          @click="onClick(anchor)">
          <span class="continuum-toc__marker" aria-hidden="true" />
          <span class="continuum-toc__label">{{ anchor.textContent || 'Untitled section' }}</span>
        </button>
      </li>
    </ol>
  </nav>
</template>

