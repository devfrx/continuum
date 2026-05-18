/**
 * Graph property-encoding selection composable.
 *
 * The graph view lets the user independently override three visual channels:
 *   – `color`  → which property/metric drives the node colour,
 *   – `size`   → which property/metric drives the node radius,
 *   – `badge`  → which property surfaces as a small badge next to the label.
 *
 * Each slot is either `null` (use the renderer's default behaviour) or a
 * `FieldRef` pointing at a property or graph metric. Persists to
 * `STORAGE_KEYS.graphEncodings` so selections survive reloads.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type { FieldRef } from '@continuum/shared';
import { STORAGE_KEYS } from '@/lib/storageKeys';

export interface GraphEncodings {
  /** When `null` → use kind colour. */
  color: FieldRef | null;
  /** When `null` → use degree-based default. */
  size: FieldRef | null;
  /** When `null` → no badge. */
  badge: FieldRef | null;
}

export const DEFAULT_GRAPH_ENCODINGS: GraphEncodings = {
  color: null,
  size: null,
  badge: null,
};

export interface UseGraphPropertyEncodingsReturn {
  encodings: Ref<GraphEncodings>;
  /** Property keys referenced by `color/size/badge` so callers can pass them to `includeProperties`. */
  requiredPropertyKeys: ComputedRef<string[]>;
  /** Computed `includeMetrics` boolean — true when any encoding references a graphMetric field. */
  requiresMetrics: ComputedRef<boolean>;
  setEncoding: (slot: keyof GraphEncodings, ref: FieldRef | null) => void;
  reset: () => void;
}

const STORAGE_KEY = STORAGE_KEYS.graphEncodings;

/**
 * Coerce an unknown payload into `GraphEncodings`. Slots whose `FieldRef`
 * doesn't match the current contract are silently dropped — in particular
 * legacy property refs that carried `propertyId: UUID` instead of
 * `key: string` are demoted to `null` because the UI cannot recover the
 * key without an extra server round-trip and a stale id would silently
 * point at nothing.
 */
export function coerceGraphEncodings(value: unknown): GraphEncodings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GRAPH_ENCODINGS };
  const v = value as Partial<GraphEncodings>;
  return {
    color: coerceFieldRef(v.color),
    size: coerceFieldRef(v.size),
    badge: coerceFieldRef(v.badge),
  };
}

function coerceFieldRef(value: unknown): FieldRef | null {
  if (!value || typeof value !== 'object') return null;
  const obj = value as Record<string, unknown>;
  switch (obj.kind) {
    case 'system':
      return typeof obj.id === 'string' ? ({ kind: 'system', id: obj.id } as FieldRef) : null;
    case 'graphMetric':
      return typeof obj.id === 'string' ? ({ kind: 'graphMetric', id: obj.id } as FieldRef) : null;
    case 'property':
      // Only the key-based contract is supported. Legacy `propertyId`
      // refs lose their slot — the user can re-pick the property.
      return typeof obj.key === 'string' && obj.key.length > 0
        ? ({ kind: 'property', key: obj.key } as FieldRef)
        : null;
    default:
      return null;
  }
}

function readStored(): GraphEncodings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_GRAPH_ENCODINGS };
    return coerceGraphEncodings(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_GRAPH_ENCODINGS };
  }
}

function persist(value: GraphEncodings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Restrictive WebViews — keep editing in-memory only.
  }
}

export function useGraphPropertyEncodings(): UseGraphPropertyEncodingsReturn {
  const encodings = ref<GraphEncodings>(readStored());

  const requiredPropertyKeys = computed<string[]>(() => {
    const keys = new Set<string>();
    for (const slot of [encodings.value.color, encodings.value.size, encodings.value.badge]) {
      if (slot && slot.kind === 'property') keys.add(slot.key);
    }
    return Array.from(keys);
  });

  const requiresMetrics = computed<boolean>(() => {
    return [encodings.value.color, encodings.value.size, encodings.value.badge].some(
      (slot) => slot !== null && slot.kind === 'graphMetric',
    );
  });

  function setEncoding(slot: keyof GraphEncodings, ref: FieldRef | null): void {
    encodings.value = { ...encodings.value, [slot]: ref };
  }

  function reset(): void {
    encodings.value = { ...DEFAULT_GRAPH_ENCODINGS };
  }

  watch(encodings, (next) => persist(next), { deep: true });

  return { encodings, requiredPropertyKeys, requiresMetrics, setEncoding, reset };
}
