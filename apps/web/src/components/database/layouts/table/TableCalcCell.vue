<script setup lang="ts">
/**
 * `TableCalcCell` — one footer cell in the calc row.
 *
 * Right-aligned, muted-tone label that mirrors the column above it.
 * Click the label to open a popover that lists every CalcFn legal for
 * this property type; selecting a function emits `select` upstream so
 * `TableLayout` can persist `view.calculation[propertyKey] = fn`.
 *
 * Numeric results render in a tabular monospaced font so columns of
 * numbers line up at the decimal point.
 */
import { computed, ref } from 'vue';
import {
  CHECKBOX_CALCS,
  COMMON_CALCS,
  DATE_CALCS,
  NUMERIC_CALCS,
  type CalcFn,
  type CalcFnResult,
  type PropertyDefinition,
} from '@continuum/shared';
import UiPopover from '@/components/ui/UiPopover.vue';

const props = defineProps<{
  definition: PropertyDefinition;
  /** Server-resolved value for the column's currently selected calc. */
  result: CalcFnResult | undefined;
  /** Sticky-left offset in px when the matching column is frozen. */
  frozenLeft?: number | null;
}>();

const emit = defineEmits<{ select: [fn: CalcFn] }>();

const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);

/** Compose the legal CalcFn list for this property's `type`. */
const options = computed<CalcFn[]>(() => buildOptions(props.definition.type));

/** Display label: server-formatted result, or "Calculate" placeholder. */
const display = computed<string>(() => {
  const r = props.result;
  if (r === null || r === undefined) return 'Calculate';
  return typeof r === 'number' ? formatNumber(r) : String(r);
});

/** True when the result is a finite number (drives monospaced styling). */
const isNumeric = computed<boolean>(() => typeof props.result === 'number');

/** True when the property has a non-default calc selected. */
const hasResult = computed<boolean>(() => props.result !== null && props.result !== undefined);

/** Inline sticky-left styling for frozen columns. */
const cellStyle = computed<Record<string, string>>(() => {
  const left = props.frozenLeft;
  if (left == null) return {} as Record<string, string>;
  return { position: 'sticky', left: `${left}px`, zIndex: '2' };
});

function onPick(fn: CalcFn): void {
  open.value = false;
  emit('select', fn);
}

/** Friendly, fixed-precision number rendering (avoids scientific notation). */
function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (Number.isInteger(n)) return n.toLocaleString();
  return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

/** Resolve the `CalcFn` alphabet for this property type. */
function buildOptions(type: PropertyDefinition['type']): CalcFn[] {
  const common: CalcFn[] = COMMON_CALCS.map((fn) => ({ kind: 'common', fn }));
  if (type === 'number' || type === 'progress') {
    return [...common, ...NUMERIC_CALCS.map((fn) => ({ kind: 'numeric', fn } as CalcFn))];
  }
  if (
    type === 'date' ||
    type === 'dateRange' ||
    type === 'createdTime' ||
    type === 'lastEditedTime'
  ) {
    return [...common, ...DATE_CALCS.map((fn) => ({ kind: 'date', fn } as CalcFn))];
  }
  if (type === 'checkbox') {
    return [...common, ...CHECKBOX_CALCS.map((fn) => ({ kind: 'checkbox', fn } as CalcFn))];
  }
  return common;
}

/** Human-readable label for a CalcFn (used in the picker list). */
function labelFor(fn: CalcFn): string {
  return CALC_LABELS[fn.fn] ?? fn.fn;
}

/** Translation table for picker labels. Keys cover every fn id. */
const CALC_LABELS: Record<string, string> = {
  none: 'None',
  count_all: 'Count all',
  count_values: 'Count values',
  count_unique: 'Count unique',
  count_empty: 'Count empty',
  count_not_empty: 'Count not empty',
  percent_empty: 'Percent empty',
  percent_not_empty: 'Percent not empty',
  sum: 'Sum',
  avg: 'Average',
  median: 'Median',
  min: 'Min',
  max: 'Max',
  range: 'Range',
  earliest: 'Earliest date',
  latest: 'Latest date',
  date_range: 'Date range',
  percent_checked: 'Percent checked',
  percent_unchecked: 'Percent unchecked',
  checked: 'Checked count',
  unchecked: 'Unchecked count',
};
</script>

<template>
  <div class="t-calc-cell" :style="cellStyle">
    <button
      ref="trigger"
      type="button"
      class="t-calc-cell__btn"
      :class="{ 'is-numeric': isNumeric, 'is-empty': !hasResult }"
      @click.stop="open = !open"
    >
      {{ display }}
    </button>
    <UiPopover v-model:open="open" :trigger-ref="trigger" :width="200" align="end">
      <ul class="t-calc-cell__menu" role="menu">
        <li
          v-for="opt in options"
          :key="`${opt.kind}:${opt.fn}`"
          role="menuitem"
          class="t-calc-cell__opt"
          @click="onPick(opt)"
        >
          {{ labelFor(opt) }}
        </li>
      </ul>
    </UiPopover>
  </div>
</template>

<style scoped>
.t-calc-cell {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  padding: 0 var(--space-3);
  border-right: var(--border-width-1) solid var(--border);
  background: var(--bg);
}
.t-calc-cell__btn {
  appearance: none;
  background: transparent;
  border: none;
  color: var(--fg-muted);
  font-size: var(--text-xs);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  text-align: right;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.t-calc-cell__btn:hover { background: var(--bg-soft); color: var(--fg); }
.t-calc-cell__btn.is-numeric {
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum';
}
.t-calc-cell__btn.is-empty { opacity: 0; }
.t-calc-cell:hover .t-calc-cell__btn.is-empty { opacity: 0.6; }
.t-calc-cell__menu {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.t-calc-cell__opt {
  padding: 6px 10px;
  font-size: var(--text-sm);
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.t-calc-cell__opt:hover { background: var(--bg-soft); }
</style>
