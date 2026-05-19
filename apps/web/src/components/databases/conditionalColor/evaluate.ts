/**
 * databases/conditionalColor/evaluate.ts — pure, synchronous evaluator
 * that turns a view's `conditionalColors` rules into a per-row style
 * bundle.
 *
 * Reuses the filter engine's `matchFilter` so condition semantics
 * (operators, value coercion, date presets, …) stay identical to the
 * Filter section — no chance of subtle drift between "the row matches
 * a filter" and "the row matches a colour rule".
 *
 * Rule precedence mirrors Notion's: rules are evaluated top-to-bottom,
 * the first match per scope wins. Row-target and property-target rules
 * are independent buckets so a row can carry both an overall tint and
 * a stronger per-cell tint without one overriding the other.
 */
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
} from '@continuum/shared';
import { matchFilter } from '../filtering/evaluate';
import { colorTokenById } from './palette';
import type {
    ConditionalColorRule,
    ResolvedColorStyle,
    RowColorStyle,
} from './types';
import { EMPTY_ROW_COLOR_STYLE } from './types';

/**
 * Pick the CSS payload for one rule given its scope. `background`
 * scopes leave `text` empty so the row keeps inheriting the surface
 * ink; `text` scopes leave `background` empty for the symmetrical
 * reason. Callers merge a row-level style with a property-level style
 * by preferring non-empty fields from the property bundle.
 */
function styleFor(rule: ConditionalColorRule): ResolvedColorStyle {
    const token = colorTokenById(rule.color);
    if (rule.scope === 'text') {
        return { background: '', text: token.text };
    }
    return { background: token.background, text: '' };
}

/**
 * Evaluate every rule against `row` and return the resolved row +
 * per-property style bundle. Returns the shared empty sentinel when
 * the view has no rules so callers can cheaply early-out on the
 * `=== EMPTY_ROW_COLOR_STYLE` identity check.
 */
export function evaluateRowColors(
    row: DatabaseRowSnapshot,
    rules: readonly ConditionalColorRule[],
    schema: readonly PropertyDefinition[],
): RowColorStyle {
    if (rules.length === 0) return EMPTY_ROW_COLOR_STYLE;

    let rowStyle: ResolvedColorStyle | null = null;
    const cells = new Map<string, ResolvedColorStyle>();

    for (const rule of rules) {
        if (!matchFilter(row, rule.condition, schema)) continue;
        if (rule.target === 'row') {
            if (rowStyle === null) rowStyle = styleFor(rule);
            continue;
        }
        const key = rule.propertyKey;
        if (!key) continue;
        if (cells.has(key)) continue;
        cells.set(key, styleFor(rule));
    }

    if (!rowStyle && cells.size === 0) return EMPTY_ROW_COLOR_STYLE;
    return { row: rowStyle, cells };
}

/**
 * Build a `style` object suitable for `:style` binding from one
 * resolved colour. Empty strings are dropped so the renderer falls
 * back to its own defaults.
 */
export function toCssStyle(style: ResolvedColorStyle | null | undefined): Record<string, string> {
    if (!style) return {};
    const out: Record<string, string> = {};
    if (style.background) {
        out.backgroundColor = style.background;
        out['--db-conditional-background'] = style.background;
    }
    if (style.text) {
        out.color = style.text;
        out['--db-conditional-text'] = style.text;
    }
    return out;
}
