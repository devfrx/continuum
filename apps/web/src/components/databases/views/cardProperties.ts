/**
 * databases/views/cardProperties.ts — resolves which schema properties
 * should appear on a card-shaped row (Board, Gallery, Feed, List).
 *
 * Cards share two contracts with the Table view:
 *   1. The view's `visibleProperties` / `hiddenProperties` lists drive
 *      property visibility — when `visibleProperties` is set, it also
 *      pins the *order* (mirroring `DatabaseTableView` / Notion).
 *   2. Properties the renderer already "consumes" elsewhere (e.g. the
 *      Board group-by column, the Feed timestamp, the Gallery cover)
 *      can be suppressed via the optional `skipKeys` parameter so the
 *      same value never shows twice on the same card.
 *
 * Renderers must opt-in to a per-card cap (`limit`) when they want a
 * compact layout — the helper itself never truncates so the Settings
 * panel always sees the complete pool.
 */
import type {
    DatabaseView,
    PropertyDefinition,
} from '@continuum/shared';

export interface ResolveCardPropertiesOptions {
    schema: readonly PropertyDefinition[];
    view: DatabaseView;
    /** Property keys to drop (already surfaced elsewhere on the card). */
    skipKeys?: Iterable<string>;
    /** Optional hard cap applied after visibility/skip filtering. */
    limit?: number;
}

/**
 * Return the ordered list of properties a card-shaped renderer should
 * display. Honours the view's visibility config exactly like the Table.
 */
export function resolveCardProperties(
    opts: ResolveCardPropertiesOptions,
): PropertyDefinition[] {
    const { schema, view, skipKeys, limit } = opts;
    const hidden = new Set(view.config.hiddenProperties ?? []);
    const skip = skipKeys ? new Set(skipKeys) : null;
    const visible = view.config.visibleProperties;

    let ordered: PropertyDefinition[];
    if (visible && visible.length > 0) {
        const byKey = new Map(schema.map((p) => [p.key, p] as const));
        ordered = [];
        for (const key of visible) {
            if (hidden.has(key)) continue;
            const def = byKey.get(key);
            if (def) ordered.push(def);
        }
    } else {
        ordered = schema.filter((p) => !hidden.has(p.key));
    }

    if (skip) ordered = ordered.filter((p) => !skip.has(p.key));
    if (typeof limit === 'number' && limit >= 0) ordered = ordered.slice(0, limit);
    return ordered;
}
