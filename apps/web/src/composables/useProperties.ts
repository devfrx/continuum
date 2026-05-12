/**
 * Properties — definitions composable.
 *
 * Module-level singleton store mirroring the `useKinds.ts` convention.
 * Caches per-kind property definitions in a `Map<kindId, PropertyDefinition[]>`
 * and exposes CRUD helpers that keep the cache in sync with the server.
 *
 * Per-note values are handled separately by `useNoteProperties.ts` so the
 * value cache can be scoped to the active note without polluting the
 * definition cache.
 */
import { ref, type Ref } from 'vue';
import { api } from '@/api';
import type {
  PropertyConfig,
  PropertyDefinition,
  PropertyType,
} from '@continuum/shared';

/** kindId → ordered list of property definitions. */
const byKind = ref<Map<string, PropertyDefinition[]>>(new Map());
/** kindId set we have already fetched (avoids re-loading when empty). */
const loaded = ref<Set<string>>(new Set());
const loading = ref<Set<string>>(new Set());

export interface UsePropertiesReturn {
  byKind: Ref<Map<string, PropertyDefinition[]>>;
  loaded: Ref<Set<string>>;
  loading: Ref<Set<string>>;
  /** Read-only accessor for a single kind's definitions. */
  forKind: (kindId: string) => PropertyDefinition[];
  /** Fetch (or refetch) definitions for a kind. */
  load: (kindId: string, force?: boolean) => Promise<PropertyDefinition[]>;
  /** Look up a single definition by id across every cached kind. */
  byId: (id: string) => PropertyDefinition | null;
  /** Create a new property definition for a kind. */
  create: (
    kindId: string,
    data: {
      label: string;
      type: PropertyType;
      key?: string;
      icon?: string | null;
      description?: string | null;
      config?: PropertyConfig;
      position?: string;
    },
  ) => Promise<PropertyDefinition>;
  /** Patch an existing definition. */
  update: (
    id: string,
    data: Partial<{
      label: string;
      icon: string | null;
      description: string | null;
      config: PropertyConfig;
      position: string;
    }>,
  ) => Promise<PropertyDefinition>;
  /** Persist the complete display order for a kind's definitions. */
  reorder: (kindId: string, ids: string[]) => Promise<PropertyDefinition[]>;
  /** Delete a definition (cascades all stored values server-side). */
  remove: (id: string) => Promise<void>;
}

function setForKind(kindId: string, defs: PropertyDefinition[]): void {
  const next = new Map(byKind.value);
  next.set(kindId, defs);
  byKind.value = next;
}

export function useProperties(): UsePropertiesReturn {
  function forKind(kindId: string): PropertyDefinition[] {
    return byKind.value.get(kindId) ?? [];
  }

  async function load(kindId: string, force = false): Promise<PropertyDefinition[]> {
    if (!force && loaded.value.has(kindId)) return forKind(kindId);
    if (loading.value.has(kindId)) return forKind(kindId);
    loading.value = new Set(loading.value).add(kindId);
    try {
      const defs = await api.properties.listForKind(kindId);
      setForKind(kindId, defs);
      const nextLoaded = new Set(loaded.value);
      nextLoaded.add(kindId);
      loaded.value = nextLoaded;
      return defs;
    } finally {
      const nextLoading = new Set(loading.value);
      nextLoading.delete(kindId);
      loading.value = nextLoading;
    }
  }

  function byId(id: string): PropertyDefinition | null {
    for (const list of byKind.value.values()) {
      const match = list.find((d) => d.id === id);
      if (match) return match;
    }
    return null;
  }

  async function create(
    kindId: string,
    data: Parameters<UsePropertiesReturn['create']>[1],
  ): Promise<PropertyDefinition> {
    const created = await api.properties.create(kindId, data);
    const current = byKind.value.get(kindId) ?? [];
    setForKind(kindId, [...current, created]);
    return created;
  }

  async function update(
    id: string,
    data: Parameters<UsePropertiesReturn['update']>[1],
  ): Promise<PropertyDefinition> {
    const updated = await api.properties.update(id, data);
    const next = new Map(byKind.value);
    for (const [k, list] of next) {
      if (list.some((d) => d.id === id)) {
        next.set(
          k,
          list.map((d) => (d.id === id ? updated : d)),
        );
      }
    }
    byKind.value = next;
    return updated;
  }

  async function reorder(kindId: string, ids: string[]): Promise<PropertyDefinition[]> {
    const updated = await api.properties.reorder(kindId, ids);
    setForKind(kindId, updated);
    return updated;
  }

  async function remove(id: string): Promise<void> {
    await api.properties.remove(id);
    const next = new Map(byKind.value);
    for (const [k, list] of next) {
      const filtered = list.filter((d) => d.id !== id);
      if (filtered.length !== list.length) next.set(k, filtered);
    }
    byKind.value = next;
  }

  return { byKind, loaded, loading, forKind, load, byId, create, update, reorder, remove };
}
