/**
 * databases/conditionalColor/types.ts — local re-exports for the
 * conditional-color engine.
 *
 * Mirrors the pattern used by `databases/filtering/types.ts`: a single
 * import surface for panels, evaluators and composables so downstream
 * files never have to remember whether a symbol lives in
 * `@continuum/shared`, in the local palette module, or in the
 * filtering subsystem.
 */
import type {
    ConditionalColorRule,
    ConditionalColorScope,
    ConditionalColorTarget,
    DatabaseColorTokenId,
    FilterCondition,
    FilterNode,
} from '@continuum/shared';

export type {
    ConditionalColorRule,
    ConditionalColorScope,
    ConditionalColorTarget,
    DatabaseColorTokenId,
    FilterCondition,
    FilterNode,
};

/**
 * Resolved CSS payload for one rule hit. `background` / `text` are
 * already-resolved CSS colour strings (variable references or
 * `rgba(...)`); empty string means "do not touch this surface".
 */
export interface ResolvedColorStyle {
    background: string;
    text: string;
}

/** Style bundle handed to renderers for one row. */
export interface RowColorStyle {
    /** Style applied to the entire row when `target === 'row'`. */
    row: ResolvedColorStyle | null;
    /** Per-property-key styles when `target === 'property'`. */
    cells: ReadonlyMap<string, ResolvedColorStyle>;
}

/** Empty style bundle reused as the "no rule matched" sentinel. */
export const EMPTY_ROW_COLOR_STYLE: RowColorStyle = Object.freeze({
    row: null,
    cells: new Map(),
});
