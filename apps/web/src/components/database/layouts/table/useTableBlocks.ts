/**
 * Glue composable that derives the rendered block list, the calc-row
 * activation flag, and the virtualization toggle from the live view +
 * query state. Extracted from `TableLayout.vue` so the orchestrator
 * stays inside its line budget.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import type {
  CalcFn,
  CalcFnResult,
  DatabaseView,
  NoteWithProperties,
  QueryGroupBucket,
} from '@continuum/shared';
import { useGroupedRows, type RowBlock } from './useGroupedRows';

export interface UseTableBlocksParams {
  view: Ref<DatabaseView | null>;
  rows: Ref<NoteWithProperties[]>;
  groups: Ref<QueryGroupBucket[] | undefined>;
  calc: Ref<Record<string, CalcFnResult>>;
}

export interface UseTableBlocksReturn {
  /** Render-ready sequence of group headers + rows. */
  blocks: ComputedRef<RowBlock[]>;
  /** True when the view has at least one column with a non-`none` calc. */
  hasCalc: ComputedRef<boolean>;
  /** When `true` the table renders all rows (groups disable virtualization). */
  disableVirtual: ComputedRef<boolean>;
  /** Bucket keys whose rows are currently hidden. Mutated via `toggleCollapsed`. */
  toggleCollapsed: (bucketKey: string | null) => void;
}

/**
 * @param params Reactive inputs from {@link TableLayout.vue}.
 */
export function useTableBlocks(params: UseTableBlocksParams): UseTableBlocksReturn {
  const collapsedKeys = ref<Set<string | null>>(new Set());

  const groupConfig = computed(() => params.view.value?.group ?? null);

  const { blocks } = useGroupedRows(
    params.rows,
    params.groups,
    groupConfig,
    collapsedKeys,
  );

  const hasCalc = computed<boolean>(() => {
    const map = params.view.value?.calculation ?? {};
    return Object.values(map).some(isActiveCalc);
  });

  const disableVirtual = computed<boolean>(
    () => params.groups.value !== undefined && groupConfig.value !== null,
  );

  function toggleCollapsed(bucketKey: string | null): void {
    const next = new Set(collapsedKeys.value);
    if (next.has(bucketKey)) next.delete(bucketKey);
    else next.add(bucketKey);
    collapsedKeys.value = next;
  }

  return { blocks, hasCalc, disableVirtual, toggleCollapsed };
}

/** True when a CalcFn is something other than the no-op `common/none`. */
function isActiveCalc(fn: CalcFn): boolean {
  return !(fn.kind === 'common' && fn.fn === 'none');
}
