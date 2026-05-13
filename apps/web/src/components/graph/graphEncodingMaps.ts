/**
 * Graph style encoding maps.
 *
 * Converts the user's `GraphEncodings` selections into flat per-node maps
 * consumed by Sigma reducers. The helper is pure: callers provide the graph
 * nodes plus the small lookup functions needed for property/kind metadata.
 */
import type {
  FieldRef,
  GraphNode,
  GraphPropertySnapshot,
  PropertyDefinition,
  PropertyOption,
  PropertyValue,
  StatusOption,
} from '@continuum/shared';
import type { GraphEncodings } from '@/composables/query/useGraphPropertyEncodings';

export interface GraphEncodingMaps {
  colorByNode?: Map<string, string | null>;
  sizeByNode?: Map<string, number>;
  badgeByNode?: Map<string, string | null>;
}

export interface BuildGraphEncodingMapsOptions {
  nodes: GraphNode[];
  encodings: GraphEncodings;
  propertyById(id: string): PropertyDefinition | null;
  colorOfKind(kind: string): string;
  iconOfKind(kind: string): string;
}

const STYLE_COLOR_SWATCHES = [
  '#2563EB',
  '#059669',
  '#D97706',
  '#DC2626',
  '#7C3AED',
  '#0891B2',
  '#DB2777',
  '#65A30D',
  '#EA580C',
  '#4F46E5',
] as const;

interface NumericRange {
  min: number;
  max: number;
  hasValues: boolean;
}

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function swatchForKey(key: string): string {
  return STYLE_COLOR_SWATCHES[hashString(key) % STYLE_COLOR_SWATCHES.length];
}

function colorForNumber(value: number, range: NumericRange): string | null {
  if (!range.hasValues || !Number.isFinite(value)) return null;
  const span = range.max - range.min;
  const t = span > 0 ? Math.max(0, Math.min(1, (value - range.min) / span)) : 0.65;
  const low = { r: 56, g: 189, b: 248 };
  const high = { r: 249, g: 115, b: 22 };
  const r = Math.round(low.r + (high.r - low.r) * t);
  const g = Math.round(low.g + (high.g - low.g) * t);
  const b = Math.round(low.b + (high.b - low.b) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

function propertySnapshot(node: GraphNode, propertyId: string): GraphPropertySnapshot | null {
  return node.properties?.find((p) => p.propertyId === propertyId) ?? null;
}

function colorForOptionRef(
  node: GraphNode,
  propertyId: string,
  propertyById: BuildGraphEncodingMapsOptions['propertyById'],
): string | null {
  const def = propertyById(propertyId);
  if (!def) return null;
  const cfg = def.config as { options?: ReadonlyArray<PropertyOption | StatusOption> };
  const options = cfg.options ?? [];
  if (options.length === 0) return null;
  const value = propertySnapshot(node, propertyId)?.value;
  if (!value) return null;
  if (value.type === 'select' || value.type === 'status') {
    const opt = options.find((o) => o.id === value.value);
    return opt?.color ?? null;
  }
  if (value.type === 'multiSelect') {
    const first = value.value[0];
    if (!first) return null;
    const opt = options.find((o) => o.id === first);
    return opt?.color ?? null;
  }
  return null;
}

function timestampValue(value: string): number | null {
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function numberForPropertyValue(value: PropertyValue | null | undefined): number | null {
  if (!value) return null;
  switch (value.type) {
    case 'number':
    case 'progress':
      return Number.isFinite(value.value) ? value.value : null;
    case 'rollup':
    case 'formula':
      return typeof value.value === 'number' && Number.isFinite(value.value) ? value.value : null;
    case 'uniqueId':
      return Number.isFinite(value.sequence) ? value.sequence : null;
    case 'date':
    case 'createdTime':
    case 'lastEditedTime':
      return timestampValue(value.value);
    case 'dateRange': {
      const from = timestampValue(value.value.from);
      const to = timestampValue(value.value.to);
      if (from == null && to == null) return null;
      if (from == null) return to;
      if (to == null) return from;
      return (from + to) / 2;
    }
    default:
      return null;
  }
}

function numberForNode(node: GraphNode, ref: FieldRef): number | null {
  if (ref.kind === 'graphMetric') {
    const m = node.metrics;
    if (!m) return null;
    return m[ref.id] ?? null;
  }
  if (ref.kind === 'system') {
    if (ref.id === 'note.createdAt') return node.createdAt ? timestampValue(node.createdAt) : null;
    if (ref.id === 'note.updatedAt') return node.updatedAt ? timestampValue(node.updatedAt) : null;
    return null;
  }
  return numberForPropertyValue(propertySnapshot(node, ref.propertyId)?.value);
}

function categoryKeyForPropertyValue(value: PropertyValue | null | undefined): string | null {
  if (!value) return null;
  switch (value.type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'phone':
    case 'createdBy':
    case 'lastEditedBy':
    case 'uniqueId':
      return value.value.trim() ? `${value.type}:${value.value.trim().toLowerCase()}` : null;
    case 'checkbox':
      return `checkbox:${value.value}`;
    case 'select':
    case 'status':
      return value.value ? `${value.type}:${value.value}` : null;
    case 'multiSelect':
      return value.value[0] ? `multiSelect:${value.value[0]}` : null;
    case 'relation':
      return value.value[0] ? `relation:${value.value[0]}` : null;
    case 'files':
      return value.value.length > 0 ? `files:${value.value.length}` : null;
    case 'verification':
      return `verification:${value.state}`;
    case 'rollup':
    case 'formula':
      return value.value == null ? null : `${value.type}:${String(value.value)}`;
    case 'date':
    case 'createdTime':
    case 'lastEditedTime':
      return value.value ? `${value.type}:${value.value.slice(0, 10)}` : null;
    case 'dateRange':
      return value.value.from || value.value.to
        ? `dateRange:${value.value.from.slice(0, 10)}:${value.value.to.slice(0, 10)}`
        : null;
    case 'number':
    case 'progress':
    case 'button':
      return null;
  }
}

function categoryKeyForNode(node: GraphNode, ref: FieldRef): string | null {
  if (ref.kind === 'system') {
    if (ref.id === 'note.kind') return `kind:${node.kind}`;
    if (ref.id === 'note.folderId') return node.folderId ? `folder:${node.folderId}` : 'folder:root';
    if (ref.id === 'note.tags') return node.tags?.[0] ? `tag:${node.tags[0]}` : null;
    if (ref.id === 'note.title') return node.label.trim() ? `title:${node.label.trim().toLowerCase()}` : null;
    return null;
  }
  if (ref.kind === 'property') {
    return categoryKeyForPropertyValue(propertySnapshot(node, ref.propertyId)?.value);
  }
  return null;
}

function colorForNode(
  node: GraphNode,
  ref: FieldRef,
  numericRange: NumericRange,
  opts: Pick<BuildGraphEncodingMapsOptions, 'propertyById' | 'colorOfKind'>,
): string | null {
  if (ref.kind === 'system' && ref.id === 'note.kind') return opts.colorOfKind(node.kind);
  if (ref.kind === 'property') {
    const optionColor = colorForOptionRef(node, ref.propertyId, opts.propertyById);
    if (optionColor) return optionColor;
  }
  const numeric = numberForNode(node, ref);
  if (numeric != null) return colorForNumber(numeric, numericRange);
  const categoryKey = categoryKeyForNode(node, ref);
  return categoryKey ? swatchForKey(categoryKey) : null;
}

function hasBadgeValue(node: GraphNode, ref: FieldRef): boolean {
  if (ref.kind === 'graphMetric') {
    const numeric = numberForNode(node, ref);
    return numeric != null && numeric > 0;
  }
  if (ref.kind === 'system') {
    if (ref.id === 'note.folderId') return Boolean(node.folderId);
    if (ref.id === 'note.tags') return (node.tags?.length ?? 0) > 0;
    if (ref.id === 'note.title') return node.label.trim().length > 0;
    if (ref.id === 'note.kind') return Boolean(node.kind);
    return false;
  }
  const value = propertySnapshot(node, ref.propertyId)?.value;
  return categoryKeyForPropertyValue(value) != null || numberForPropertyValue(value) != null;
}

function badgeIconForNode(
  node: GraphNode,
  ref: FieldRef,
  opts: Pick<BuildGraphEncodingMapsOptions, 'propertyById' | 'iconOfKind'>,
): string | null {
  if (!hasBadgeValue(node, ref)) return null;
  if (ref.kind === 'system') {
    if (ref.id === 'note.folderId') return 'folder';
    if (ref.id === 'note.tags') return 'tag';
    if (ref.id === 'note.kind') return opts.iconOfKind(node.kind);
    if (ref.id === 'note.title') return 'note-title';
    return null;
  }
  if (ref.kind === 'graphMetric') return 'graph';
  return opts.propertyById(ref.propertyId)?.icon ?? 'sparkles';
}

function numericRangeFor(nodes: GraphNode[], ref: FieldRef | null): NumericRange {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  if (ref) {
    for (const node of nodes) {
      const v = numberForNode(node, ref);
      if (v == null || !Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return {
    min,
    max,
    hasValues: Number.isFinite(min) && Number.isFinite(max),
  };
}

export function buildGraphEncodingMaps(opts: BuildGraphEncodingMapsOptions): GraphEncodingMaps | undefined {
  const enc = opts.encodings;
  if (!enc.color && !enc.size && !enc.badge) return undefined;

  const colorByNode = enc.color ? new Map<string, string | null>() : undefined;
  const sizeByNode = enc.size ? new Map<string, number>() : undefined;
  const badgeByNode = enc.badge ? new Map<string, string | null>() : undefined;
  const colorRange = numericRangeFor(opts.nodes, enc.color);
  const sizeRange = numericRangeFor(opts.nodes, enc.size);
  const sizeSpan = sizeRange.max - sizeRange.min;

  for (const node of opts.nodes) {
    if (colorByNode && enc.color) {
      colorByNode.set(node.id, colorForNode(node, enc.color, colorRange, opts));
    }
    if (sizeByNode && enc.size) {
      const v = numberForNode(node, enc.size);
      if (v != null && Number.isFinite(v) && sizeRange.hasValues && sizeSpan > 0) {
        const t = (v - sizeRange.min) / sizeSpan;
        sizeByNode.set(node.id, 0.6 + t);
      } else {
        sizeByNode.set(node.id, 1);
      }
    }
    if (badgeByNode && enc.badge) {
      badgeByNode.set(node.id, badgeIconForNode(node, enc.badge, opts));
    }
  }

  return { colorByNode, sizeByNode, badgeByNode };
}