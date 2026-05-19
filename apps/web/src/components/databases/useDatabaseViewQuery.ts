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
import { applySort, matchFilter, type EvaluatorContext } from './filtering/evaluate';
import type { FilterNode, SortRule } from './filtering/types';
import type { ConditionalColorRule } from './conditionalColor/types';

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

    /**
     * Conditional-color rules currently configured on the view. Used
     * to back the synthetic `view.conditionalColor` field so filter
     * and sort rules can reference the colour token a row matches.
     */
    const colorRules = computed<readonly ConditionalColorRule[]>(() => {
        const list = args.activeView.value.config.conditionalColors;
        return Array.isArray(list) ? list : [];
    });

    /**
     * Evaluator context shared by filter & sort. The resolver walks the
     * rule list and returns the first matching rule's colour token id
     * — mirroring `evaluateRowColors` precedence. We deliberately do
     * NOT pass the context recursively into `matchFilter` when
     * resolving the colour (rules cannot reference their own output),
     * so the resolver below uses an empty `EvaluatorContext`.
     */
    const evaluatorContext = computed<EvaluatorContext>(() => {
        const rules = colorRules.value;
        if (rules.length === 0) return {};
        const schema = args.schema.value;
        return {
            resolveViewMeta(row, id) {
                if (id !== 'view.conditionalColor') return null;
                for (const rule of rules) {
                    if (matchFilter(row, rule.condition, schema)) return rule.color;
                }
                return null;
            },
        };
    });

    const filteredRows = computed<DatabaseRowSnapshot[]>(() => {
        const list = args.rows.value;
        if (!hasFilter.value) return list;
        return list.filter((row) =>
            matchFilter(row, filter.value, args.schema.value, evaluatorContext.value),
        );
    });

    const finalRows = computed<DatabaseRowSnapshot[]>(() => {
        if (!hasSort.value) return filteredRows.value;
        return applySort(
            filteredRows.value,
            sort.value,
            args.schema.value,
            evaluatorContext.value,
        );
    });

    return { filteredRows, finalRows, hasFilter, hasSort };
}
