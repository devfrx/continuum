/**
 * Shared, type-safe helpers used by every alternative Database View layout
 * (board / gallery / calendar / timeline / list).
 *
 * Each helper is intentionally tiny (≤ 30 lines) and pure so layouts stay
 * cheap to render and easy to reason about.
 */
import type {
  NoteWithProperties,
  PropertyDefinition,
  PropertyValue,
} from '@continuum/shared';

/** Locate the {@link PropertyValue} attached to `row` for the given key. */
export function findPropertyValue(
  row: NoteWithProperties,
  key: string,
): PropertyValue | null {
  const np = row.properties.find((p) => p.definition.key === key);
  return np?.value ?? null;
}

/** Locate a definition in the cached list of a kind's properties. */
export function findPropertyDefinition(
  defs: PropertyDefinition[],
  key: string,
): PropertyDefinition | undefined {
  return defs.find((d) => d.key === key);
}

/**
 * Resolve the URL of the first image inside a `files` property value.
 * Returns `null` when the property is missing, empty, or contains no image.
 */
export function coverImageUrl(
  row: NoteWithProperties,
  coverKey: string | undefined,
  defs: PropertyDefinition[],
): string | null {
  if (!coverKey) return null;
  const def = findPropertyDefinition(defs, coverKey);
  if (!def || def.type !== 'files') return null;
  const value = findPropertyValue(row, coverKey);
  if (!value || value.type !== 'files') return null;
  const firstImage = value.value.find((f) => f.mime.startsWith('image/'));
  return firstImage?.url ?? null;
}

/**
 * Normalise any date-like {@link PropertyValue} to a `[from,to]` pair.
 * `to` matches `from` for single-point dates; both are `null` for empty.
 */
export function extractDate(
  value: PropertyValue | null,
): { from: Date | null; to: Date | null } {
  if (!value) return { from: null, to: null };
  if (value.type === 'date') {
    const d = parseIso(value.value);
    return { from: d, to: d };
  }
  if (value.type === 'dateRange') {
    return { from: parseIso(value.value.from), to: parseIso(value.value.to) };
  }
  return { from: null, to: null };
}

/** Parse an ISO 8601 string and return `null` if invalid / empty. */
function parseIso(iso: string): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Render any {@link PropertyValue} as a short human-readable string for
 * use inside chips. Skeleton-grade fallback used until `CellRenderer` is
 * available across the layouts.
 */
export function formatPropertyValue(value: PropertyValue | null): string {
  if (!value) return '';
  switch (value.type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'phone':
      return value.value;
    case 'number':
      return String(value.value);
    case 'checkbox':
      return value.value ? '✓' : '–';
    case 'date':
      return value.value.slice(0, 10);
    case 'dateRange':
      return `${value.value.from.slice(0, 10)} → ${value.value.to.slice(0, 10)}`;
    case 'select':
    case 'status':
      return value.value;
    case 'multiSelect':
      return value.value.join(', ');
    case 'relation':
      return `${value.value.length} link${value.value.length === 1 ? '' : 's'}`;
    case 'files':
      return `${value.value.length} file${value.value.length === 1 ? '' : 's'}`;
    case 'rollup':
    case 'formula':
      return value.value === null ? '' : String(value.value);
    case 'uniqueId':
      return value.value;
    case 'verification':
      return value.state;
    case 'progress':
      return `${value.value}%`;
    case 'createdTime':
    case 'lastEditedTime':
      return value.value.slice(0, 10);
    case 'createdBy':
    case 'lastEditedBy':
      return value.value;
    case 'button':
      return '';
  }
}
