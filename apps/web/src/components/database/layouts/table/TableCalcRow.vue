<script setup lang="ts">
/**
 * `TableCalcRow` — sticky-bottom footer that renders one calc cell per
 * visible column.
 *
 * Reuses the parent's `gridTemplateColumns` so every cell aligns
 * pixel-perfect with the header / data rows above. The first cell
 * (drag handle) is intentionally empty; the second (under the title
 * column) shows the total row count when provided. Each subsequent
 * cell delegates to {@link TableCalcCell} keyed by the column's
 * `propertyKey`.
 */
import type { CalcFn, CalcFnResult } from '@continuum/shared';
import type { ResolvedColumn } from './useTableColumns';
import TableCalcCell from './TableCalcCell.vue';

const props = defineProps<{
  columns: ResolvedColumn[];
  calc: Record<string, CalcFnResult>;
  /** Map of `propertyKey -> sticky-left-px` for frozen columns. */
  frozenOffsets: Map<string, number>;
  /** Total row count surfaced under the title column; hidden when omitted. */
  total?: number;
}>();

const emit = defineEmits<{
  /** A user picked a new CalcFn for `propertyKey` from the popover. */
  select: [payload: { propertyKey: string; fn: CalcFn }];
}>();

function frozenLeftOf(propertyKey: string): number | null {
  const v = props.frozenOffsets.get(propertyKey);
  return v == null ? null : v;
}

function onSelect(propertyKey: string, fn: CalcFn): void {
  emit('select', { propertyKey, fn });
}
</script>

<template>
  <div class="t-calc-row" role="row">
    <div class="t-calc-row__handle" />
    <div class="t-calc-row__title">
      <span v-if="total !== undefined" class="t-calc-row__total">
        {{ total.toLocaleString() }} {{ total === 1 ? 'row' : 'rows' }}
      </span>
    </div>

    <TableCalcCell
      v-for="col in columns"
      :key="col.definition.id"
      :definition="col.definition"
      :result="calc[col.definition.key]"
      :frozen-left="frozenLeftOf(col.column.propertyKey)"
      @select="onSelect(col.definition.key, $event)"
    />

    <div class="t-calc-row__add" />
  </div>
</template>

<style scoped>
.t-calc-row {
  display: contents;
}
.t-calc-row > * {
  position: sticky;
  bottom: 0;
  z-index: 3;
  background: var(--bg);
  border-top: var(--border-width-1) solid var(--border);
  height: var(--row-h, 36px);
  display: flex;
  align-items: center;
}
.t-calc-row__handle,
.t-calc-row__add {
  border-right: var(--border-width-1) solid var(--border);
}
.t-calc-row__title {
  position: sticky;
  left: 28px; /* HANDLE_COL_PX */
  z-index: 4;
  padding: 0 var(--space-3);
  border-right: var(--border-width-1) solid var(--border);
  font-size: var(--text-xs);
  color: var(--fg-muted);
}
.t-calc-row__total { font-variant-numeric: tabular-nums; }
</style>
