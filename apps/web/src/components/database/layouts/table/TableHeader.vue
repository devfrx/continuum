<script setup lang="ts">
/**
 * `TableHeader` — sticky top row of the table layout.
 *
 * Lays out the title-column header, one `TableHeaderCell` per visible
 * property column, and a trailing "+" button that opens
 * `AddPropertyModal` (re-used from the property panel) so users can add
 * a new property without leaving the table.
 */
import { ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import AddPropertyModal from '@/components/properties/AddPropertyModal.vue';
import type { ResolvedColumn } from './useTableColumns';
import TableHeaderCell, { type ColumnActionPayload } from './TableHeaderCell.vue';

const props = defineProps<{
  kindId: string;
  columns: ResolvedColumn[];
  /** Map of `propertyKey -> sticky-left-px` for frozen columns. */
  frozenOffsets: Map<string, number>;
}>();

const emit = defineEmits<{
  'column-action': [payload: ColumnActionPayload];
  'property-created': [];
}>();

const showAdd = ref(false);

function onCreated(): void {
  showAdd.value = false;
  emit('property-created');
}

/** Convenience: lookup the sticky offset for a column, or `null`. */
function leftFor(propertyKey: string): number | null {
  const v = props.frozenOffsets.get(propertyKey);
  return v == null ? null : v;
}
</script>

<template>
  <div class="t-header">
    <div class="t-header__title">Name</div>
    <TableHeaderCell
      v-for="col in props.columns"
      :key="col.definition.id"
      :definition="col.definition"
      :column="col.column"
      :frozen-left="leftFor(col.definition.key)"
      @column-action="emit('column-action', $event)"
    />
    <button
      type="button"
      class="t-header__add"
      title="Add property"
      aria-label="Add property"
      @click="showAdd = true"
    >
      <Icon name="plus" :size="14" />
    </button>
    <AddPropertyModal v-model="showAdd" :kind-id="kindId" @created="onCreated" />
  </div>
</template>

<style scoped>
.t-header {
  display: contents;
}
.t-header__title {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 var(--space-2);
  background: var(--bg);
  position: sticky;
  left: 0;
  top: 0;
  z-index: 3;
  border-right: var(--border-width-1) solid var(--border);
  border-bottom: var(--border-width-1) solid var(--border);
  color: var(--fg-muted);
  font-size: var(--text-xs);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.t-header__add {
  position: sticky;
  top: 0;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: var(--bg);
  border: none;
  border-bottom: var(--border-width-1) solid var(--border);
  color: var(--fg-muted);
  cursor: pointer;
}
.t-header__add:hover {
  background: color-mix(in srgb, var(--bg-soft) 50%, transparent);
  color: var(--fg);
}
</style>
