// ===== Sort rules for Database Views =====
//
// Notion-style multi-column sort. Order matters: rules earlier in the array
// take precedence over later ones (stable secondary sort, etc.).

import { z } from 'zod';

/** Sort direction. `'asc'` = ascending, `'desc'` = descending. */
export type SortDirection = 'asc' | 'desc';

/**
 * A single sort rule applied to one property of the queried kind.
 *
 * Invariants:
 *  - `propertyKey` must reference an existing property on the kind. Server
 *    silently drops unknown keys (does not error) so view configs survive
 *    property renames/deletions.
 */
export interface SortRule {
  /** Stable property key (slug) on the owning kind. */
  propertyKey: string;
  /** Direction. Defaults to `'asc'` when omitted by the UI. */
  direction: SortDirection;
}

/** Zod schema mirroring {@link SortRule}. */
export const sortRuleSchema = z.object({
  propertyKey: z.string().min(1),
  direction: z.enum(['asc', 'desc']),
});

/** Inferred sort-rule type — identical shape to {@link SortRule}. */
export type SortRuleSchema = z.infer<typeof sortRuleSchema>;

/** Zod schema for an ordered list of sort rules. */
export const sortRulesSchema = z.array(sortRuleSchema);
