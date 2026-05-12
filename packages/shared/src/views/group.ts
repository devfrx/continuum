// ===== Group configuration for Database Views =====
//
// A view may group rows by exactly one property. The groupable property
// types are intentionally limited: only types whose value space partitions
// cleanly into a finite set of buckets are allowed.

import { z } from 'zod';

/**
 * Date bucket granularity used when grouping by a date / dateRange /
 * createdTime / lastEditedTime property. `'relative'` collapses values
 * into rolling buckets ("today", "yesterday", "this week", …) computed
 * server-side at query time.
 */
export const DATE_GROUP_BUCKETS = [
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'relative',
] as const;

export type DateGroupBucket = (typeof DATE_GROUP_BUCKETS)[number];

/** Direction the groups themselves are listed in. */
export const GROUP_SORT_DIRECTIONS = ['manual', 'asc', 'desc'] as const;
export type GroupSortDirection = (typeof GROUP_SORT_DIRECTIONS)[number];

// ───────── Per-type group configs ─────────

interface GroupBase {
  /** Property key on the owning kind. */
  propertyKey: string;
  /** Hide groups whose `count === 0`. */
  hideEmpty: boolean;
  /**
   * How groups are ordered. `'manual'` means the client-defined order from
   * `manualOrder`; `'asc'` / `'desc'` sort by group key (option position
   * for select/status, alphabetical for everything else).
   */
  sortGroups: GroupSortDirection;
  /** Optional explicit ordering when `sortGroups === 'manual'`. */
  manualOrder?: string[];
}

export interface SelectGroupConfig extends GroupBase {
  type: 'select';
}
export interface StatusGroupConfig extends GroupBase {
  type: 'status';
  /** When true, group by status `group` (todo/inProgress/done) instead of option id. */
  byPipelineGroup?: boolean;
}
export interface MultiSelectGroupConfig extends GroupBase {
  type: 'multiSelect';
}
export interface CheckboxGroupConfig extends GroupBase {
  type: 'checkbox';
}
export interface DateGroupConfig extends GroupBase {
  type: 'date';
  bucket: DateGroupBucket;
}
export interface RelationGroupConfig extends GroupBase {
  type: 'relation';
}
export interface PersonGroupConfig extends GroupBase {
  /** `createdBy` and `lastEditedBy` share this shape. */
  type: 'person';
}

/** Discriminated union of every supported group configuration. */
export type GroupConfig =
  | SelectGroupConfig
  | StatusGroupConfig
  | MultiSelectGroupConfig
  | CheckboxGroupConfig
  | DateGroupConfig
  | RelationGroupConfig
  | PersonGroupConfig;

// ───────── Schemas ─────────

const baseShape = {
  propertyKey: z.string().min(1),
  hideEmpty: z.boolean(),
  sortGroups: z.enum(GROUP_SORT_DIRECTIONS),
  manualOrder: z.array(z.string()).optional(),
};

export const groupConfigSchema: z.ZodType<GroupConfig> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('select'), ...baseShape }),
  z.object({ type: z.literal('status'), byPipelineGroup: z.boolean().optional(), ...baseShape }),
  z.object({ type: z.literal('multiSelect'), ...baseShape }),
  z.object({ type: z.literal('checkbox'), ...baseShape }),
  z.object({ type: z.literal('date'), bucket: z.enum(DATE_GROUP_BUCKETS), ...baseShape }),
  z.object({ type: z.literal('relation'), ...baseShape }),
  z.object({ type: z.literal('person'), ...baseShape }),
]);
