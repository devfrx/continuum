/**
 * databases/conditionalColor/useConditionalColors.ts — reactive
 * façade consumed by every view renderer.
 *
 * Wraps the pure `evaluateRowColors` helper in a memoised
 * `WeakMap<row, RowColorStyle>` keyed by snapshot identity so a row
 * is recomputed only when the rules or schema actually change (the
 * map itself is rebuilt by the upstream `computed`, which acts as
 * the invalidation token).
 *
 * The composable returns two helpers tailored to the two surfaces a
 * renderer needs:
 *   – `rowStyleFor(row)` — `:style` payload for the whole row.
 *   – `cellStyleFor(row, propertyKey)` — `:style` payload for a
 *     single cell, with row-level styling merged in as a fallback
 *     so a property-target rule cleanly overrides the row tint.
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import type {
    DatabaseRowSnapshot,
    DatabaseView,
    PropertyDefinition,
} from '@continuum/shared';
import { evaluateRowColors, toCssStyle } from './evaluate';
import type { RowColorStyle } from './types';

export interface UseConditionalColorsArgs {
    activeView: Ref<DatabaseView> | ComputedRef<DatabaseView>;
    schema: Ref<PropertyDefinition[]> | ComputedRef<PropertyDefinition[]>;
}

export interface UseConditionalColorsReturn {
    /** `true` when the active view has at least one rule. */
    hasRules: ComputedRef<boolean>;
    /** Resolve the row-level style payload for a given row. */
    rowStyleFor: (row: DatabaseRowSnapshot) => Record<string, string>;
    /**
     * Resolve the per-cell style payload. Returns an empty object when
     * no property-target rule matches this `(row, propertyKey)` pair —
     * callers keep the row-level `rowStyleFor` separate so the cell
     * background isn't painted twice (once at row, once at cell) when
     * only a row-target rule is active.
     */
    cellStyleFor: (row: DatabaseRowSnapshot, propertyKey: string) => Record<string, string>;
    /** Low-level access for renderers that need the raw bundle. */
    bundleFor: (row: DatabaseRowSnapshot) => RowColorStyle;
}

export function useConditionalColors(
    args: UseConditionalColorsArgs,
): UseConditionalColorsReturn {
    const rules = computed(() => args.activeView.value.config.conditionalColors ?? []);

    const cache = computed<WeakMap<DatabaseRowSnapshot, RowColorStyle>>(() => {
        // Touching `rules` / `schema` here makes the cache invalidate
        // automatically whenever either changes — the new computed
        // produces a fresh WeakMap and the per-row results are recomputed
        // lazily on first access.
        void rules.value;
        void args.schema.value;
        return new WeakMap();
    });

    const hasRules = computed(() => rules.value.length > 0);

    function bundleFor(row: DatabaseRowSnapshot): RowColorStyle {
        if (!hasRules.value) return { row: null, cells: new Map() };
        const map = cache.value;
        const cached = map.get(row);
        if (cached) return cached;
        const next = evaluateRowColors(row, rules.value, args.schema.value);
        map.set(row, next);
        return next;
    }

    function rowStyleFor(row: DatabaseRowSnapshot): Record<string, string> {
        return toCssStyle(bundleFor(row).row);
    }

    function cellStyleFor(row: DatabaseRowSnapshot, propertyKey: string): Record<string, string> {
        const cell = bundleFor(row).cells.get(propertyKey);
        if (!cell) return {};
        return toCssStyle(cell);
    }

    return { hasRules, rowStyleFor, cellStyleFor, bundleFor };
}
