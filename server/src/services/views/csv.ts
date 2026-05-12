/**
 * CSV serialiser for Database View query results (M10 export).
 *
 * Stateless: callers (the `/export.csv` route) collect rows + property
 * definitions + the desired column projection, then hand them to
 * {@link rowsToCsv}. The output is a single RFC-4180 compliant string
 * with `\r\n` line endings and a UTF-8 BOM so Excel auto-detects encoding.
 *
 * Relation titles are not resolved here — pass a `relationTitles` lookup
 * if you want titles instead of ids in relation cells. When the lookup
 * is missing or a target id has no entry, the cell falls back to the raw
 * UUID (documented behaviour).
 */

import type {
  ColumnConfig,
  NoteWithProperties,
  NoteProperty,
  PropertyConfig,
  PropertyValue,
} from '@continuum/shared';
import type { PropertyDefinitionRow } from '../../db/schema.js';

/** Optional context passed alongside the row set for richer serialisation. */
export interface RowsToCsvContext {
  /**
   * Map of relation target note id → title. When omitted, relation cells
   * fall back to a comma-joined list of raw UUIDs.
   */
  relationTitles?: Map<string, string>;
}

/**
 * Serialise a list of view rows to a CSV string.
 *
 * Header row: `Title` + each visible property's `label` (in `columns` order).
 * Body row: title + each property serialised to a single flat cell per
 * the rules documented inline below.
 *
 * @param rows     Rows returned by {@link runViewQuery} (one page or many).
 * @param defs     Property definitions for the kind. Used to look up labels
 *                 and configs by `key`.
 * @param columns  Visible columns in the desired order. The route filters
 *                 `view.columns` to `visible: true` and sorts by `position`
 *                 before calling.
 * @param ctx      Optional resolution context (e.g. relation titles).
 */
export function rowsToCsv(
  rows: NoteWithProperties[],
  defs: PropertyDefinitionRow[],
  columns: ColumnConfig[],
  ctx: RowsToCsvContext = {},
): string {
  const defByKey = new Map(defs.map((d) => [d.key, d] as const));

  // Header
  const header: string[] = ['Title'];
  for (const col of columns) {
    const def = defByKey.get(col.propertyKey);
    header.push(def?.label ?? col.propertyKey);
  }

  const lines: string[] = [header.map(escapeCell).join(',')];

  // Body
  for (const row of rows) {
    const propByKey = new Map(
      row.properties.map((p) => [p.definition.key, p] as const),
    );
    const cells: string[] = [row.note.title];
    for (const col of columns) {
      const np = propByKey.get(col.propertyKey);
      cells.push(serialiseProperty(np, ctx));
    }
    lines.push(cells.map(escapeCell).join(','));
  }

  // RFC 4180 line endings + BOM for Excel UTF-8 auto-detection.
  return '\uFEFF' + lines.join('\r\n');
}

// ─────────────────────────── Internals ───────────────────────────

/**
 * Convert a single {@link NoteProperty} to a flat CSV cell string per the
 * type-specific rules. Returns an empty string when the value is unset
 * (or the property is not present on the row at all).
 */
function serialiseProperty(
  np: NoteProperty | undefined,
  ctx: RowsToCsvContext,
): string {
  if (!np || np.value === null) return '';
  const cfg = np.definition.config;
  const v = np.value;

  switch (v.type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'phone':
      return v.value;
    case 'uniqueId':
      return v.value;
    case 'number':
    case 'progress':
      return String(v.value);
    case 'checkbox':
      return v.value ? 'true' : 'false';
    case 'select':
    case 'status':
      return optionLabel(cfg, v.value);
    case 'multiSelect':
      // Multi-value cells use ';' so a single CSV cell stays parseable.
      return v.value.map((id) => optionLabel(cfg, id)).join(';');
    case 'date':
      return isoDate(v.value);
    case 'dateRange': {
      const from = v.value.from ? isoDate(v.value.from) : '';
      const to = v.value.to ? isoDate(v.value.to) : '';
      if (!from && !to) return '';
      return `${from}..${to}`;
    }
    case 'relation':
      return v.value
        .map((id) => ctx.relationTitles?.get(id) ?? id)
        .join(';');
    case 'files':
      return v.value.map((f) => f.url).join(';');
    case 'createdTime':
    case 'lastEditedTime':
      return v.value;
    case 'createdBy':
    case 'lastEditedBy':
      return v.value;
    case 'formula':
      return v.value === null || v.value === undefined ? '' : String(v.value);
    case 'rollup':
      return v.value === null ? '' : String(v.value);
    case 'verification':
      return v.state;
    case 'button':
      return '';
  }
  return assertNever(v);
}

/**
 * Look up the human label for an option id on a select/multiSelect/status
 * property. Falls back to the raw id when the option is not found (e.g.
 * deleted after the value was stored).
 */
function optionLabel(cfg: PropertyConfig, optionId: string): string {
  if (cfg.type === 'select' || cfg.type === 'multiSelect' || cfg.type === 'status') {
    const opt = cfg.options.find((o) => o.id === optionId);
    return opt?.label ?? optionId;
  }
  return optionId;
}

/** Truncate an ISO timestamp / date string to `YYYY-MM-DD`. */
function isoDate(input: string): string {
  if (!input) return '';
  // Cheap path: already a date or starts with one.
  return input.slice(0, 10);
}

/**
 * Apply RFC-4180 quoting: any cell containing `,`, `"`, `\n` or `\r` is
 * wrapped in double quotes, with internal `"` doubled.
 */
function escapeCell(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

/** Exhaustiveness guard for the {@link PropertyValue} switch above. */
function assertNever(v: never): never {
  throw new Error(`Unhandled property value: ${JSON.stringify(v)}`);
}
