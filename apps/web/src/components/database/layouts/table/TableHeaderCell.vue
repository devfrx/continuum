<script setup lang="ts">
/**
 * `TableHeaderCell` — one column header in the database table.
 *
 * Owns three independent interactions, each delegated to a composable:
 *  - **Resize** (`useColumnResize`): 4-px right-edge handle.
 *  - **Reorder** (`useColumnDrag`): HTML5 drag with insertion indicator.
 *  - **Menu** (`TableColumnMenu`): sort, freeze, wrap, hide, delete.
 *
 * The cell only forwards semantic actions; persistence is the layout's
 * job (see `applyColumnAction`).
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import {
  PROPERTY_TYPE_ICONS,
  type ColumnConfig,
  type PropertyDefinition,
} from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import { useColumnResize } from './useColumnResize';
import { useColumnDrag } from './useColumnDrag';
import { effectiveWidth } from './tableGrid';
import TableColumnMenu from './TableColumnMenu.vue';

/** Discriminated union of every action a header cell can dispatch. */
export type ColumnActionPayload =
  | { propertyKey: string; action: 'sort-asc' | 'sort-desc' | 'hide' | 'delete' }
  | { propertyKey: string; action: 'freeze-up-to' | 'unfreeze' | 'toggle-wrap' }
  | { propertyKey: string; action: 'resize'; width: number }
  | {
      propertyKey: string;
      action: 'reorder';
      sourceKey: string;
      position: 'before' | 'after';
    };

const props = defineProps<{
  definition: PropertyDefinition;
  column: ColumnConfig;
  /** Sticky `left` offset in px when this column is frozen. `null` = not frozen. */
  frozenLeft: number | null;
}>();

const emit = defineEmits<{
  'column-action': [payload: ColumnActionPayload];
}>();

const open = ref(false);
const root = ref<HTMLDivElement | null>(null);

/** Close the menu when the user clicks outside the cell. */
function onDocClick(event: MouseEvent): void {
  if (!root.value) return;
  if (!root.value.contains(event.target as Node)) open.value = false;
}
function toggleMenu(): void {
  open.value = !open.value;
  if (open.value) queueMicrotask(() => document.addEventListener('mousedown', onDocClick));
  else document.removeEventListener('mousedown', onDocClick);
}
/** Forward a menu action upward and close the menu. */
function onMenuAction(
  action: 'sort-asc' | 'sort-desc' | 'hide' | 'delete' | 'freeze-up-to' | 'unfreeze' | 'toggle-wrap',
): void {
  emit('column-action', { propertyKey: props.definition.key, action } as ColumnActionPayload);
  open.value = false;
  document.removeEventListener('mousedown', onDocClick);
}
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick));

const resize = useColumnResize({
  startWidthOf: () => effectiveWidth({ definition: props.definition, column: props.column }),
  commit: (width) =>
    emit('column-action', { propertyKey: props.definition.key, action: 'resize', width }),
});

const drag = useColumnDrag({
  propertyKey: props.definition.key,
  commit: (sourceKey, position) =>
    emit('column-action', {
      propertyKey: props.definition.key,
      action: 'reorder',
      sourceKey,
      position,
    }),
});

const cellStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {};
  if (props.frozenLeft != null) {
    style.position = 'sticky';
    style.left = `${props.frozenLeft}px`;
    style.zIndex = '3';
  }
  if (resize.active.value && resize.liveWidth.value != null) {
    style.width = `${resize.liveWidth.value}px`;
  }
  return style;
});
</script>

<template>
  <div
    ref="root"
    class="t-head"
    :class="{
      'is-frozen': frozenLeft != null,
      'is-drag-source': drag.isSource.value,
      'has-indicator-before': drag.indicator.value === 'before',
      'has-indicator-after': drag.indicator.value === 'after',
    }"
    :style="cellStyle"
    :title="definition.description ?? definition.label"
    draggable="true"
    @dragstart="drag.onDragStart"
    @dragover="drag.onDragOver"
    @dragleave="drag.onDragLeave"
    @drop="drag.onDrop"
    @dragend="drag.onDragEnd"
  >
    <button type="button" class="t-head__btn" @click="toggleMenu">
      <Icon
        :name="definition.icon || PROPERTY_TYPE_ICONS[definition.type] || 'circle'"
        :size="13"
      />
      <span class="t-head__label">{{ definition.label }}</span>
      <Icon v-if="column.frozen" name="snowflake" :size="11" class="t-head__pin" title="Frozen" />
      <Icon name="chevron-down" :size="12" class="t-head__chev" />
    </button>

    <TableColumnMenu v-if="open" :column="column" @action="onMenuAction" />

    <span
      class="t-head__resizer"
      :class="{ 'is-active': resize.active.value }"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      draggable="false"
      @pointerdown="resize.onPointerDown"
      @click.stop
      @dragstart.prevent.stop
    />
  </div>
</template>

<style scoped>
.t-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: stretch;
  height: 100%;
  border-right: var(--border-width-1) solid var(--border);
  border-bottom: var(--border-width-1) solid var(--border);
  background: var(--bg);
}
.t-head.is-frozen { box-shadow: 1px 0 0 0 var(--border); }
.t-head.is-drag-source { opacity: 0.4; }
.t-head.has-indicator-before::before,
.t-head.has-indicator-after::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent);
  pointer-events: none;
  z-index: 4;
}
.t-head.has-indicator-before::before { left: 0; }
.t-head.has-indicator-after::after { right: 0; }
.t-head__btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  height: 100%;
  padding: 0 var(--space-2);
  background: transparent;
  border: none;
  color: var(--fg-muted);
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
}
.t-head__btn:hover {
  background: color-mix(in srgb, var(--bg-soft) 50%, transparent);
  color: var(--fg);
}
.t-head__label {
  flex: 1 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-head__pin { color: var(--accent); }
.t-head__chev {
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-standard);
}
.t-head__btn:hover .t-head__chev { opacity: 1; }
.t-head__resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  user-select: none;
  background: transparent;
  z-index: 5;
  transition: background var(--duration-fast) var(--ease-standard);
}
.t-head__resizer:hover,
.t-head__resizer.is-active { background: var(--accent); }
</style>
