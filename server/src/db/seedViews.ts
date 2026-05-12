import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from './client.js';
import { kinds, views, type NewView } from './schema.js';

/**
 * Default `DatabaseViewConfig` used when materialising the first view of a
 * kind. Kept as a plain `Record<string, unknown>` on purpose: the routes
 * layer (M1.C) owns validation against the shared zod schemas, and the
 * database treats this column as opaque JSONB. Mirrors the canonical
 * "empty" view: table layout, no filter / sort / group, all properties
 * visible (`columns: []` is interpreted as "show every property in
 * default order"), no aggregations.
 */
const DEFAULT_VIEW_CONFIG: Readonly<Record<string, unknown>> = Object.freeze({
  layout: { type: 'table', rowHeight: 'medium', wrap: false, openMode: 'side-peek' },
  columns: [],
  sort: [],
  filter: { type: 'group', combinator: 'and', rules: [] },
  group: null,
  calculation: {},
  search: null,
});

/** Initial LexoRank position assigned to a freshly-seeded default view. */
const INITIAL_POSITION = 'a0';

/** Display name for the auto-created default view. */
const DEFAULT_VIEW_NAME = 'All';

/**
 * Ensure every Kind has at least one Database View, with exactly one
 * marked as default. Safe to run on every boot — idempotent.
 *
 * For each kind without a view, create one called "All" with an empty
 * default config (layout=table, no filters, no sort, no group, all
 * properties visible, every calculation set to 'none'). For kinds that
 * already have views but none flagged default, promote the
 * lexicographically-first (by `position`) one.
 *
 * Wrapped in a transaction to avoid races with concurrent boots.
 *
 * @returns counts of `created` (new view rows inserted) and `promoted`
 *          (existing rows flipped to `is_default = true`).
 */
export async function seedDefaultViews(): Promise<{ created: number; promoted: number }> {
  return db.transaction(async (tx) => {
    let created = 0;
    let promoted = 0;

    // Per-kind aggregate of existing views: total count and whether any is
    // already the default. One round-trip instead of N+1 queries.
    const summaries = await tx
      .select({
        kindId: kinds.id,
        total: sql<number>`count(${views.id})::int`,
        defaults: sql<number>`count(*) filter (where ${views.isDefault})::int`,
      })
      .from(kinds)
      .leftJoin(views, eq(views.kindId, kinds.id))
      .groupBy(kinds.id);

    for (const summary of summaries) {
      if (summary.total === 0) {
        const row: NewView = {
          kindId: summary.kindId,
          name: DEFAULT_VIEW_NAME,
          isDefault: true,
          position: INITIAL_POSITION,
          // Spread to detach from the frozen template — Drizzle serialises as-is.
          config: { ...DEFAULT_VIEW_CONFIG },
        };
        await tx.insert(views).values(row);
        created += 1;
        continue;
      }

      if (summary.defaults === 0) {
        // Promote the lexicographically-first view (by position, then id for
        // a stable tie-breaker) to default.
        const [first] = await tx
          .select({ id: views.id })
          .from(views)
          .where(eq(views.kindId, summary.kindId))
          .orderBy(asc(views.position), asc(views.id))
          .limit(1);

        if (first) {
          await tx
            .update(views)
            .set({ isDefault: true, updatedAt: new Date() })
            .where(and(eq(views.id, first.id)));
          promoted += 1;
        }
      }
    }

    return { created, promoted };
  });
}
