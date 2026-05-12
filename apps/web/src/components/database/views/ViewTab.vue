<script setup lang="ts">
/**
 * One saved-view tab inside the {@link ViewTabs} strip.
 *
 * Pure presentational: renders the layout icon, view name, optional
 * lock / default badges, and emits `select` when clicked, `context-menu`
 * when right-clicked or when the trailing chevron is pressed (so the
 * parent can open the {@link ViewMenu}).
 *
 * The drag-and-drop handlers live on the parent strip — this component
 * is the draggable host (`draggable="true"`) and forwards `dragstart`
 * via a native event listener wired in {@link ViewTabs}.
 */
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import type { ViewSummary } from '@/api';
import type { LayoutConfig } from '@continuum/shared';
import { viewIcons } from './viewIcons';

const props = defineProps<{
  view: ViewSummary;
  active: boolean;
}>();

const emit = defineEmits<{
  select: [];
  /** Open menu at the given viewport coordinates. */
  'context-menu': [x: number, y: number];
}>();

/** Resolve the layout-type icon, falling back to a generic table icon. */
const iconName = computed<string>(
  () => viewIcons[props.view.layoutType as LayoutConfig['type']] ?? viewIcons.table,
);

function onContextMenu(e: MouseEvent): void {
  e.preventDefault();
  emit('context-menu', e.clientX, e.clientY);
}

function onChevron(e: MouseEvent): void {
  e.stopPropagation();
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  emit('context-menu', rect.left, rect.bottom);
}
</script>

<template>
  <div
    class="view-tab"
    :class="{ 'is-active': active, 'is-locked': view.locked }"
    role="tab"
    :aria-selected="active"
    :title="view.name"
    @click="emit('select')"
    @contextmenu="onContextMenu"
  >
    <Icon :name="iconName" :size="14" class="view-tab__icon" />
    <span class="view-tab__label">{{ view.name }}</span>
    <Icon v-if="view.locked" name="lock" :size="11" class="view-tab__badge" />
    <span v-else-if="view.isDefault" class="view-tab__default">default</span>
    <button
      type="button"
      class="view-tab__chevron"
      aria-label="View options"
      @click="onChevron"
    >
      <Icon name="chevron-down" :size="12" />
    </button>
  </div>
</template>

<style scoped>
.view-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  height: 32px;
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  color: var(--fg-muted);
  cursor: pointer;
  user-select: none;
  border-bottom: 2px solid transparent;
  font-size: var(--text-sm);
  white-space: nowrap;
  transition:
    color var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard);
}
.view-tab:hover {
  background: var(--surface-hover);
  color: var(--fg);
}
.view-tab.is-active {
  color: var(--fg-strong);
  border-bottom-color: var(--accent);
  background: var(--bg-soft);
}
.view-tab__icon {
  flex-shrink: 0;
  color: var(--fg-subtle);
}
.view-tab.is-active .view-tab__icon {
  color: var(--accent);
}
.view-tab__label {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.view-tab__badge {
  color: var(--fg-subtle);
}
.view-tab__default {
  font-size: var(--text-xs);
  color: var(--fg-subtle);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.view-tab__chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--fg-subtle);
  padding: 2px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-standard);
}
.view-tab:hover .view-tab__chevron,
.view-tab.is-active .view-tab__chevron {
  opacity: 1;
}
.view-tab__chevron:hover {
  background: var(--surface-hover);
  color: var(--fg);
}
</style>
