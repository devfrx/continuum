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
  /** Computed list of property ids referenced by `color/size/badge` so callers can pass them to `includeProperties`. */
  requiredPropertyIds: ComputedRef<string[]>;
  /** Computed `includeMetrics` boolean — true when any encoding references a graphMetric field. */
  requiresMetrics: ComputedRef<boolean>;
  setEncoding: (slot: keyof GraphEncodings, ref: FieldRef | null) => void;
  reset: () => void;
}

const STORAGE_KEY = STORAGE_KEYS.graphEncodings;

/** Coerce an unknown payload into `GraphEncodings`. */
export function coerceGraphEncodings(value: unknown): GraphEncodings {
  if (!value || typeof value !== 'object') return { ...DEFAULT_GRAPH_ENCODINGS };
  const v = value as Partial<GraphEncodings>;
  // Each slot is either null/undefined or a FieldRef object — we don't
  // exhaustively validate the FieldRef shape (cheap defensive parse).
  return {
    color: isFieldRefLike(v.color) ? v.color : null,
    size: isFieldRefLike(v.size) ? v.size : null,
    badge: isFieldRefLike(v.badge) ? v.badge : null,
  };
}

function isFieldRefLike(value: unknown): value is FieldRef {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === 'system' || kind === 'property' || kind === 'graphMetric';
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

  const requiredPropertyIds = computed<string[]>(() => {
    const ids = new Set<string>();
    for (const slot of [encodings.value.color, encodings.value.size, encodings.value.badge]) {
      if (slot && slot.kind === 'property') ids.add(slot.propertyId);
    }
    return Array.from(ids);
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

  return { encodings, requiredPropertyIds, requiresMetrics, setEncoding, reset };
}
