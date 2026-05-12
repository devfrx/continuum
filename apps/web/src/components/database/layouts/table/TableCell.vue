<script setup lang="ts">
/**
 * `TableCell` — one editable cell in the database table.
 *
 * Two visual states:
 *   1. **Display** (default) — `<CellRenderer>` shows a compact, read-only
 *      preview of the value.
 *   2. **Editing** — the property type's full editor (from
 *      `propertyEditorRegistry`) is mounted either inline (small types)
 *      or inside a `<CellEditorPortal>` (popover types).
 *
 * Computed types (`formula`, `rollup`, `createdTime`, …) are read-only —
 * the cell never enters editing mode for them. Successful mutations emit
 * `mutated(noteId)` so the parent layout can call `reloadRow` and pick up
 * server-side recomputations.
 */
import { computed, nextTick, ref } from 'vue';
import {
  isComputedPropertyType,
  type PropertyDefinition,
  type PropertyValue,
} from '@continuum/shared';
import { propertyEditorRegistry } from '@/components/properties/editors/registry';
import { api } from '@/api';
import CellRenderer from '@/components/database/cells/CellRenderer.vue';
import CellEditorPortal from '@/components/database/cells/CellEditorPortal.vue';

const props = defineProps<{
  noteId: string;
  definition: PropertyDefinition;
  value: PropertyValue | null;
  /** Sticky `left` offset in px when this cell's column is frozen. */
  frozenLeft?: number | null;
  /** When true, allow text to wrap to multiple lines (column-level setting). */
  wrap?: boolean;
}>();

const emit = defineEmits<{
  mutated: [noteId: string];
  /** Bubbles when a relation editor selects another note. */
  select: [noteId: string];
}>();

/** Property types whose editor needs a popover instead of inline space. */
const POPOVER_TYPES = new Set<PropertyDefinition['type']>([
  'date',
  'dateRange',
  'select',
  'multiSelect',
  'status',
  'files',
  'relation',
  'verification',
  'longText',
]);

const editing = ref(false);
const cell = ref<HTMLDivElement | null>(null);

const editor = computed(() => propertyEditorRegistry[props.definition.type]);
const computedField = computed(() => isComputedPropertyType(props.definition.type));
const usesPortal = computed(() => POPOVER_TYPES.has(props.definition.type));

/** Inline style for sticky positioning when the column is frozen. */
const cellStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {};
  if (props.frozenLeft == null) return style;
  style.position = 'sticky';
  style.left = `${props.frozenLeft}px`;
  style.zIndex = '1';
  style.background = 'var(--bg)';
  return style;
});

function startEdit(): void {
  if (computedField.value || editing.value) return;
  editing.value = true;
  void nextTick(focusInlineEditor);
}

function focusInlineEditor(): void {
  if (!cell.value) return;
  const target = cell.value.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea, [contenteditable="true"]',
  );
  target?.focus();
}

function stopEdit(): void {
  editing.value = false;
}

async function onUpdate(value: PropertyValue): Promise<void> {
  await api.properties.setValue(props.noteId, props.definition.id, value);
  emit('mutated', props.noteId);
}

function onKeydown(event: KeyboardEvent): void {
  if (computedField.value) return;
  if (!editing.value && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault();
    startEdit();
  } else if (editing.value && event.key === 'Escape') {
    event.preventDefault();
    stopEdit();
  }
}

function onBlur(event: FocusEvent): void {
  if (!editing.value || usesPortal.value) return;
  // Keep editing if focus moved inside the cell (e.g. between sub-inputs).
  const next = event.relatedTarget as Node | null;
  if (next && cell.value?.contains(next)) return;
  stopEdit();
}
</script>

<template>
  <div
    ref="cell"
    class="t-cell"
    :class="{
      'is-editing': editing,
      'is-readonly': computedField,
      'is-frozen': frozenLeft != null,
      'is-wrap': wrap,
    }"
    :style="cellStyle"
    tabindex="0"
    role="gridcell"
    @click="startEdit"
    @keydown="onKeydown"
    @focusout="onBlur"
  >
    <CellRenderer v-if="!editing" :definition="definition" :value="value" />

    <component
      v-else-if="!usesPortal"
      :is="editor"
      :value="value"
      :definition="definition"
      :note-id="noteId"
      class="t-cell__editor"
      @update:value="onUpdate"
      @select="emit('select', $event)"
      @reload="emit('mutated', noteId)"
    />

    <template v-else>
      <CellRenderer :definition="definition" :value="value" />
      <CellEditorPortal :anchor="cell" :min-width="220" @close="stopEdit">
        <component
          :is="editor"
          :value="value"
          :definition="definition"
          :note-id="noteId"
          @update:value="onUpdate"
          @select="emit('select', $event)"
          @reload="emit('mutated', noteId)"
        />
      </CellEditorPortal>
    </template>
  </div>
</template>

<style scoped>
.t-cell {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 var(--space-2);
  height: 100%;
  border-right: var(--border-width-1) solid var(--border);
  border-bottom: var(--border-width-1) solid var(--border);
  cursor: text;
  outline: none;
  overflow: hidden;
}
.t-cell.is-readonly { cursor: default; }
.t-cell:focus-visible { box-shadow: inset 0 0 0 2px var(--accent); }
.t-cell.is-editing { background: color-mix(in srgb, var(--bg-soft) 50%, transparent); }
/* Wrapped cells allow multi-line content. NOTE: the virtualizer assumes
   uniform row height — wrapped cells may misalign on rapid scroll until
   variable-height virtualization lands. */
.t-cell.is-wrap :deep(*) { white-space: normal !important; word-break: break-word; }
/* `position`/`left` set inline when frozen; the shadow marks the seam. */
.t-cell.is-frozen { box-shadow: 1px 0 0 0 var(--border); }
.t-cell__editor { width: 100%; }
</style>
