import { ref, computed, type ComputedRef, type Ref } from 'vue';
import { api } from '@/api';
import type { KindDefinition } from '@continuum/shared';

const kinds = ref<KindDefinition[]>([]);
const loaded = ref(false);
const loading = ref(false);

/**
 * Convert HSL (0-360, 0-100, 0-100) into a `#RRGGBB` hex string.
 */
function hslToHex(h: number, s: number, l: number): string {
  const sN = s / 100;
  const lN = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sN * Math.min(lN, 1 - lN);
  const f = (n: number): number =>
    lN - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toHex = (x: number): string =>
    Math.round(x * 255).toString(16).padStart(2, '0');
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
}

/**
 * Hash an arbitrary string into a deterministic warm-palette color, used as a
 * fallback when a kind id has no registered definition (e.g. legacy data).
 */
function deterministicColor(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return hslToHex(hue, 38, 55);
}

export interface UseKindsReturn {
  kinds: Ref<KindDefinition[]>;
  sorted: ComputedRef<KindDefinition[]>;
  loaded: Ref<boolean>;
  loading: Ref<boolean>;
  load: (force?: boolean) => Promise<void>;
  byId: (id: string) => KindDefinition | null;
  colorOf: (id: string) => string;
  iconOf: (id: string) => string;
  labelOf: (id: string) => string;
  create: (data: Partial<KindDefinition>) => Promise<KindDefinition>;
  update: (id: string, data: Partial<KindDefinition>) => Promise<KindDefinition>;
  remove: (id: string) => Promise<void>;
}

/**
 * Module-level reactive store for note categories. Shared across all callers
 * so updates in one component reflect everywhere without prop drilling.
 */
export function useKinds(): UseKindsReturn {
  /** Fetch the kinds list from the server, memoised unless `force` is true. */
  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return;
    loading.value = true;
    try {
      kinds.value = await api.kinds.list();
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  function byId(id: string): KindDefinition | null {
    return kinds.value.find((k) => k.id === id) ?? null;
  }

  function colorOf(id: string): string {
    return byId(id)?.color ?? deterministicColor(id || 'note');
  }

  function iconOf(id: string): string {
    return byId(id)?.icon ?? 'kind-custom';
  }

  function labelOf(id: string): string {
    return byId(id)?.label ?? id;
  }

  /** Create a new kind and append it to the local cache. */
  async function create(data: Partial<KindDefinition>): Promise<KindDefinition> {
    const k = await api.kinds.create(data);
    kinds.value = [...kinds.value, k];
    return k;
  }

  /** Update an existing kind, replacing the row in the local cache. */
  async function update(
    id: string,
    data: Partial<KindDefinition>,
  ): Promise<KindDefinition> {
    const k = await api.kinds.update(id, data);
    kinds.value = kinds.value.map((x) => (x.id === id ? k : x));
    return k;
  }

  /** Remove a kind. Server reassigns affected notes to `'note'`. */
  async function remove(id: string): Promise<void> {
    await api.kinds.remove(id);
    kinds.value = kinds.value.filter((k) => k.id !== id);
  }

  const sorted = computed<KindDefinition[]>(() =>
    [...kinds.value].sort(
      (a, b) =>
        Number(b.builtin) - Number(a.builtin) || a.label.localeCompare(b.label),
    ),
  );

  return {
    kinds,
    sorted,
    loaded,
    loading,
    load,
    byId,
    colorOf,
    iconOf,
    labelOf,
    create,
    update,
    remove,
  };
}
