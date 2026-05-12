/**
 * State container for one open Database View.
 *
 * Loads the active view config from the server, exposes a reactive `view`
 * ref, and persists local mutations via a debounced PATCH. The composable
 * is consumed by `<DatabaseView>` and the M5 toolbar; M3 layouts read the
 * same `view` to drive the query.
 *
 * Save strategy: every `patch(delta)` is merged into `view.value`
 * synchronously (optimistic UI) and queued for a 250 ms debounced PATCH.
 * On HTTP error the pending queue is dropped and `reload()` is invoked so
 * the UI never desynchronises silently.
 */
import { ref, watch, type Ref } from 'vue';
import type { DatabaseView, DatabaseViewConfig } from '@continuum/shared';
import { api } from '@/api';

export interface UseDatabaseViewReturn {
  view: Ref<DatabaseView | null>;
  loading: Ref<boolean>;
  /** Force a reload of the view config from the server. */
  reload: () => Promise<void>;
  /** Apply a partial mutation to the view config (debounced server PATCH). */
  patch: (delta: Partial<DatabaseView>) => Promise<void>;
}

/** Keys that live inside the JSONB `config` column on the server row. */
const CONFIG_KEYS: readonly (keyof DatabaseViewConfig)[] = [
  'layout',
  'columns',
  'sort',
  'filter',
  'group',
  'calculation',
  'search',
];

/** Top-level row fields the API accepts on PATCH. */
const ROW_KEYS = ['name', 'locked', 'isDefault'] as const;

interface UpdatePayload {
  name?: string;
  locked?: boolean;
  isDefault?: boolean;
  config?: DatabaseViewConfig;
}

export function useDatabaseView(
  kindIdRef: Ref<string | null>,
  viewIdRef: Ref<string | null>,
): UseDatabaseViewReturn {
  const view = ref<DatabaseView | null>(null);
  const loading = ref(false);

  /** Set of touched top-level keys since the last successful save. */
  const touchedKeys = new Set<string>();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  /** Resolve which view to load: explicit id wins, else the kind's default. */
  async function fetchView(
    kindId: string,
    viewId: string | null,
  ): Promise<DatabaseView | null> {
    if (viewId) return api.views.get(kindId, viewId);
    const list = await api.views.list(kindId);
    const def = list.find((v) => v.isDefault) ?? list[0];
    return def ? api.views.get(kindId, def.id) : null;
  }

  async function reload(): Promise<void> {
    const kindId = kindIdRef.value;
    if (!kindId) {
      view.value = null;
      return;
    }
    loading.value = true;
    try {
      view.value = await fetchView(kindId, viewIdRef.value);
    } catch (err) {
      console.warn('[useDatabaseView] failed to load view', err);
      view.value = null;
    } finally {
      loading.value = false;
    }
  }

  /** Build the payload for `PATCH /views/:id` from current local state. */
  function buildPayload(touched: Set<string>, current: DatabaseView): UpdatePayload {
    const payload: UpdatePayload = {};
    for (const k of ROW_KEYS) {
      if (!touched.has(k)) continue;
      if (k === 'name') payload.name = current.name;
      else if (k === 'locked') payload.locked = current.locked;
      else if (k === 'isDefault') payload.isDefault = current.isDefault;
    }
    if (CONFIG_KEYS.some((k) => touched.has(k))) {
      payload.config = {
        layout: current.layout,
        columns: current.columns,
        sort: current.sort,
        filter: current.filter,
        group: current.group,
        calculation: current.calculation,
        search: current.search ?? null,
      };
    }
    return payload;
  }

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void flushSave();
    }, 250);
  }

  async function flushSave(): Promise<void> {
    const current = view.value;
    const kindId = kindIdRef.value;
    if (!current || !kindId || touchedKeys.size === 0) return;
    const payload = buildPayload(touchedKeys, current);
    touchedKeys.clear();
    try {
      view.value = await api.views.update(kindId, current.id, payload);
    } catch (err) {
      console.warn('[useDatabaseView] save failed, reloading', err);
      await reload();
    }
  }

  async function patch(delta: Partial<DatabaseView>): Promise<void> {
    const current = view.value;
    if (!current) return;
    // Optimistic local merge.
    view.value = { ...current, ...delta } as DatabaseView;
    for (const key of Object.keys(delta)) touchedKeys.add(key);
    scheduleSave();
  }

  // Reload whenever the surrounding identifiers change.
  watch(
    [kindIdRef, viewIdRef],
    () => {
      void reload();
    },
    { immediate: true },
  );

  return { view, loading, reload, patch };
}
