/**
 * Field catalogue composable.
 *
 * Module-level singleton mirroring the `useProperties.ts` convention.
 * Caches the per-surface `FieldCatalog` returned by
 * `GET /api/query/fields?surface=…` so every consumer (filter pickers,
 * encoding pickers, sort menus) reads from a single in-memory copy and a
 * mutation in one place propagates everywhere.
 *
 * Cache invalidation is exposed (rather than wired automatically) because
 * the catalogue depends on property definitions: callers that already know
 * they just mutated a definition can decide whether to refetch eagerly or
 * lazily.
 */
import { ref, type Ref } from 'vue';
import { api } from '@/api';
import { subscribe, type RealtimeEvent } from '@/lib/realtime/bus';
import type { FieldCatalog, FieldDescriptor } from '@continuum/shared';

type Surface = 'graph' | 'note';

/** surface → catalogue. Empty until the surface is loaded for the first time. */
const catalog = ref<Map<Surface, FieldCatalog>>(new Map());
/** In-flight surfaces; used to dedupe overlapping `load()` calls. */
const loading = ref<Set<Surface>>(new Set());
/** Resolved promises by surface, keyed for dedupe of concurrent loaders. */
const inflight = new Map<Surface, Promise<FieldDescriptor[]>>();
let realtimeAttached = false;

export interface UseFieldCatalogReturn {
  catalog: Ref<Map<Surface, FieldCatalog>>;
  loading: Ref<Set<Surface>>;
  fields: (surface: Surface) => FieldDescriptor[];
  fieldByKey: (surface: Surface, key: string) => FieldDescriptor | null;
  load: (surface: Surface, force?: boolean) => Promise<FieldDescriptor[]>;
  /** Invalidate the cache (e.g. after creating/deleting a property definition). */
  invalidate: (surface?: Surface) => void;
}

function setCatalog(surface: Surface, payload: FieldCatalog): void {
  const next = new Map(catalog.value);
  next.set(surface, payload);
  catalog.value = next;
}

function setLoading(surface: Surface, on: boolean): void {
  const next = new Set(loading.value);
  if (on) next.add(surface);
  else next.delete(surface);
  loading.value = next;
}

function affectsCatalog(event: RealtimeEvent): boolean {
  switch (event.kind) {
    case 'note.created':
    case 'note.updated':
    case 'note.deleted':
    case 'database.updated':
    case 'database.deleted':
    case 'database.schema.changed':
    case 'database.rows.changed':
      return true;
    default:
      return false;
  }
}

function attachRealtimeRefresh(
  load: (surface: Surface, force?: boolean) => Promise<FieldDescriptor[]>,
): void {
  if (realtimeAttached) return;
  realtimeAttached = true;
  subscribe((event) => {
    if (!affectsCatalog(event)) return;
    const loadedSurfaces = Array.from(catalog.value.keys());
    for (const surface of loadedSurfaces) {
      void load(surface, true).catch(() => undefined);
    }
  });
}

export function useFieldCatalog(): UseFieldCatalogReturn {
  function fields(surface: Surface): FieldDescriptor[] {
    return catalog.value.get(surface)?.fields ?? [];
  }

  function fieldByKey(surface: Surface, key: string): FieldDescriptor | null {
    const list = catalog.value.get(surface)?.fields;
    if (!list) return null;
    return list.find((f) => f.key === key) ?? null;
  }

  async function load(surface: Surface, force = false): Promise<FieldDescriptor[]> {
    if (!force && catalog.value.has(surface)) return fields(surface);
    const pending = inflight.get(surface);
    if (pending) return pending;
    setLoading(surface, true);
    const promise = (async () => {
      try {
        const payload = await api.query.fields(surface);
        setCatalog(surface, payload);
        return payload.fields;
      } finally {
        inflight.delete(surface);
        setLoading(surface, false);
      }
    })();
    inflight.set(surface, promise);
    return promise;
  }

  function invalidate(surface?: Surface): void {
    if (!surface) {
      catalog.value = new Map();
      return;
    }
    if (!catalog.value.has(surface)) return;
    const next = new Map(catalog.value);
    next.delete(surface);
    catalog.value = next;
  }

  attachRealtimeRefresh(load);

  return { catalog, loading, fields, fieldByKey, load, invalidate };
}
