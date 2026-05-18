/**
 * useDatabaseViewQuery — derive `finalRows` (filter ∘ sort) reactively.
 *
 * Every database view renderer consumes this composable so the filter
 * and sort sections in the view-options popover apply uniformly across
 * Table / List / Board / Gallery / Calendar / Timeline / Feed / Chart
 * without per-renderer plumbing.
 *
 * Inputs are kept as plain refs / computed-style getters so the
 * composable doesn't dictate the renderer's shape; it only reads the
 * three values it needs.
 *
 * The pipeline is deterministic and purely client-side; the server
 * still returns the raw row set, with all view-local filter/sort
 * rules applied here for instant feedback while the user edits them.
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import type {
    DatabaseRowSnapshot,
    DatabaseView,
    PropertyDefinition,
} from '@continuum/shared';
import { applySort, matchFilter } from './filtering/evaluate';
import type { FilterNode, SortRule } from './filtering/types';

export interface UseDatabaseViewQueryArgs {
    rows: Ref<DatabaseRowSnapshot[]> | ComputedRef<DatabaseRowSnapshot[]>;
    activeView: Ref<DatabaseView> | ComputedRef<DatabaseView>;
    schema: Ref<PropertyDefinition[]> | ComputedRef<PropertyDefinition[]>;
}

export interface UseDatabaseViewQueryReturn {
    /** Rows that passed the filter, in original order. */
    filteredRows: ComputedRef<DatabaseRowSnapshot[]>;
    /** Filtered rows ordered by the configured sort rules. */
    finalRows: ComputedRef<DatabaseRowSnapshot[]>;
    /** `true` when at least one filter condition exists on the view. */
    hasFilter: ComputedRef<boolean>;
    /** `true` when at least one sort rule exists on the view. */
    hasSort: ComputedRef<boolean>;
}

/**
 * Returns derived row lists that update whenever `rows`, the active
 * view's `config.filter` / `config.sort`, or the underlying `schema`
 * change.
 */
export function useDatabaseViewQuery(
    args: UseDatabaseViewQueryArgs,
): UseDatabaseViewQueryReturn {
    const filter = computed<FilterNode | null>(() => {
        const f = args.activeView.value.config.filter;
        return f ?? null;
    });

    const sort = computed<SortRule[]>(() => {
        const s = args.activeView.value.config.sort;
        return Array.isArray(s) ? s : [];
    });

    const hasFilter = computed<boolean>(() => {
        const f = filter.value;
        if (!f) return false;
        if (f.type === 'condition') return true;
        return f.children.length > 0;
    });

    const hasSort = computed<boolean>(() => sort.value.length > 0);

    const filteredRows = computed<DatabaseRowSnapshot[]>(() => {
        const list = args.rows.value;
        if (!hasFilter.value) return list;
        return list.filter((row) => matchFilter(row, filter.value, args.schema.value));
    });

    const finalRows = computed<DatabaseRowSnapshot[]>(() => {
        if (!hasSort.value) return filteredRows.value;
        return applySort(filteredRows.value, sort.value, args.schema.value);
    });

    return { filteredRows, finalRows, hasFilter, hasSort };
}
