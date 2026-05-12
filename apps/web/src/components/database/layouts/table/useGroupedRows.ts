/**
 * Split a flat row list into a render-ready sequence of group headers
 * and rows.
 *
 * The server returns the authoritative `QueryGroupBucket[]` (key, label,
 * count, ordering) but only the current page's `rows` flat list — bucket
 * membership has to be computed client-side so the table can render
 * collapsible sections without a second round-trip per bucket. The
 * matching logic mirrors the per-type rules of the server's
 * `group-engine.ts`:
 *
 *   - `select` / `status`            → row matches if its option id ===
 *     `bucket.key`; missing/empty value matches the `null` ("Empty")
 *     bucket.
 *   - `checkbox`                     → bucket key is `'true'` / `'false'`;
 *     missing value matches `null`.
 *   - `multiSelect` / `relation`     → row appears once per bucket whose
 *     key is in the value array. **Caveat:** the same row will be
 *     repeated across every matching bucket — this is the same
 *     semantic the server uses (`LATERAL jsonb_array_elements_text`) and
 *     is intentionally surfaced.
 *   - `date`                         → row matches when the same bucket
 *     formatter (`day` / `week` / `month` / `quarter` / `year`) applied
 *     to the row's ISO date equals `bucket.key`.
 *   - `person`                       → not yet supported by the server
 *     (no `property_values` storage); treated as ungrouped.
 *
 * A bucket whose key is in the supplied `collapsedKeys` set emits ONLY
 * its header (no rows).
 *
 * When grouping is inactive (`groupsRef === undefined` or `group.type
 * === undefined`) the function falls back to a flat `row` block list so
 * callers don't need a separate code path.
 */
import { computed, type ComputedRef, type Ref } from 'vue';
import type {
  CheckboxValue,
  DateGroupBucket,
  DateValue,
  GroupConfig,
  MultiSelectValue,
  NoteWithProperties,
  QueryGroupBucket,
  RelationValue,
  SelectValue,
  StatusValue,
} from '@continuum/shared';

/** A single render unit emitted by {@link useGroupedRows}. */
export type RowBlock =
  | { kind: 'group-header'; bucket: QueryGroupBucket; collapsed: boolean }
  | { kind: 'row'; row: NoteWithProperties; bucketKey: string | null };

export interface UseGroupedRowsReturn {
  blocks: ComputedRef<RowBlock[]>;
}

/**
 * @param rowsRef         Flat list of rows for the current page.
 * @param groupsRef       Server-resolved bucket descriptors (already
 *                        ordered + label-resolved). `undefined` ⇒ no
 *                        grouping.
 * @param groupConfigRef  The view's group config — the per-type rules
 *                        come from `group.type`.
 * @param collapsedKeysRef Reactive set of bucket keys whose rows should
 *                        be suppressed.
 */
export function useGroupedRows(
  rowsRef: Ref<NoteWithProperties[]>,
  groupsRef: Ref<QueryGroupBucket[] | undefined>,
  groupConfigRef: Ref<GroupConfig | null | undefined>,
  collapsedKeysRef: Ref<Set<string | null>>,
): UseGroupedRowsReturn {
  const blocks = computed<RowBlock[]>(() => {
    const groups = groupsRef.value;
    const group = groupConfigRef.value;
    const rows = rowsRef.value;
    if (!groups || !group) {
      return rows.map((row) => ({ kind: 'row', row, bucketKey: null } satisfies RowBlock));
    }

    const collapsed = collapsedKeysRef.value;
    const out: RowBlock[] = [];
    for (const bucket of groups) {
      const isCollapsed = collapsed.has(bucket.key);
      out.push({ kind: 'group-header', bucket, collapsed: isCollapsed });
      if (isCollapsed) continue;
      for (const row of rows) {
        if (rowMatchesBucket(row, bucket.key, group)) {
          out.push({ kind: 'row', row, bucketKey: bucket.key });
        }
      }
    }
    return out;
  });

  return { blocks };
}

/** Read the resolved value for `group.propertyKey` on a row, or `null`. */
function readValue(row: NoteWithProperties, propertyKey: string) {
  return row.properties.find((p) => p.definition.key === propertyKey)?.value ?? null;
}

/** True when `row` belongs to the bucket identified by `bucketKey`. */
function rowMatchesBucket(
  row: NoteWithProperties,
  bucketKey: string | null,
  group: GroupConfig,
): boolean {
  const value = readValue(row, group.propertyKey);
  switch (group.type) {
    case 'select':
    case 'status': {
      const id = (value as SelectValue | StatusValue | null)?.value || null;
      return bucketKey === id;
    }
    case 'checkbox': {
      const v = (value as CheckboxValue | null)?.value;
      const k = v === true ? 'true' : v === false ? 'false' : null;
      return bucketKey === k;
    }
    case 'multiSelect':
    case 'relation': {
      const arr =
        (value as MultiSelectValue | RelationValue | null)?.value ?? [];
      if (arr.length === 0) return bucketKey === null;
      return bucketKey !== null && arr.includes(bucketKey);
    }
    case 'date': {
      const iso = (value as DateValue | null)?.value || null;
      if (!iso) return bucketKey === null;
      return formatDateBucket(iso, group.bucket) === bucketKey;
    }
    case 'person':
      // Server treats this as unsupported; everything falls into the empty bucket.
      return bucketKey === null;
  }
}

/**
 * Match the server's `to_char` granularity formatter (`group-engine.ts`).
 * `relative` falls back to `day` (same fallback the server uses).
 */
function formatDateBucket(iso: string, bucket: DateGroupBucket): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  switch (bucket) {
    case 'year':
      return `${y}`;
    case 'quarter':
      return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
    case 'month':
      return `${y}-${m}`;
    case 'week':
      return `${isoWeekYear(d)}-W${String(isoWeek(d)).padStart(2, '0')}`;
    case 'day':
    case 'relative':
    default:
      return `${y}-${m}-${day}`;
  }
}

/** ISO 8601 week number for a UTC date. */
function isoWeek(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = (target.getTime() - firstThursday.getTime()) / 86_400_000;
  return 1 + Math.round((diff - ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

/** ISO 8601 week-numbering year (may differ from the calendar year near year-end). */
function isoWeekYear(d: Date): number {
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  return target.getUTCFullYear();
}
