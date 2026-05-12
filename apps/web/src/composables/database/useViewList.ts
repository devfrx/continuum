/**
 * State container for the saved-view tab strip of one kind.
 *
 * Owns the `ViewSummary[]` list returned by `GET /kinds/:kindId/views`
 * and exposes ergonomic mutation helpers that wrap `api.views.*`. Each
 * helper applies an optimistic local update where safe and reloads from
 * the server on operations that have server-driven side effects (e.g.
 * `setDefault` clears `isDefault` on every sibling).
 *
 * Independent from {@link useDatabaseView}: this composable owns the tab
 * list, that one owns the currently-open view's full config.
 */
import { ref, watch, type Ref } from 'vue';
import {
  createDefaultViewConfig,
  defaultTableLayout,
  type DatabaseView,
  type DatabaseViewConfig,
  type LayoutConfig,
} from '@continuum/shared';
import { api, type ViewSummary } from '@/api';

/** Public surface of the composable. */
export interface UseViewListReturn {
  views: Ref<ViewSummary[]>;
  loading: Ref<boolean>;
  reload: () => Promise<void>;
  create: (name: string, layoutType: LayoutConfig['type']) => Promise<ViewSummary>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  duplicate: (id: string) => Promise<ViewSummary>;
  setDefault: (id: string) => Promise<void>;
  setLocked: (id: string, locked: boolean) => Promise<void>;
  reorder: (orderedIds: string[]) => Promise<void>;
}

/**
 * Build a layout config for a freshly-created view of the given type.
 *
 * Notes on the unhandled cases (`board`, `calendar`, `timeline`): those
 * layouts require a property key (`groupByPropertyKey`, `datePropertyKey`,
 * `startPropertyKey`) that the server-side schema validates as
 * `min(1)`. At creation time the user has not yet picked a property —
 * forcing one here would couple this layer to the kind's property list
 * and risk creating invalid views. We therefore start them as a `table`
 * layout; the user converts to the desired layout from the toolbar once
 * the required property exists.
 */
function buildLayout(type: LayoutConfig['type']): LayoutConfig {
  switch (type) {
    case 'table':
      return defaultTableLayout();
    case 'list':
      return { type: 'list', showProperties: [] };
    case 'gallery':
      return { type: 'gallery', cardSize: 'medium', fitImage: 'cover' };
    case 'board':
    case 'calendar':
    case 'timeline':
    default:
      return defaultTableLayout();
  }
}

/** Compose a complete view config seeded with the requested layout. */
function buildConfig(kindId: string, type: LayoutConfig['type']): DatabaseViewConfig {
  return { ...createDefaultViewConfig(kindId), layout: buildLayout(type) };
}

/** Project a full {@link DatabaseView} down to a tab-strip {@link ViewSummary}. */
function summarise(v: DatabaseView): ViewSummary {
  return {
    id: v.id,
    name: v.name,
    isDefault: v.isDefault,
    locked: v.locked,
    position: v.position,
    layoutType: v.layout.type,
    updatedAt: v.updatedAt,
  };
}

export function useViewList(kindIdRef: Ref<string>): UseViewListReturn {
  const views = ref<ViewSummary[]>([]);
  const loading = ref(false);

  async function reload(): Promise<void> {
    const kindId = kindIdRef.value;
    if (!kindId) {
      views.value = [];
      return;
    }
    loading.value = true;
    try {
      views.value = await api.views.list(kindId);
    } catch (err) {
      console.warn('[useViewList] failed to load views', err);
      views.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function create(name: string, layoutType: LayoutConfig['type']): Promise<ViewSummary> {
    const kindId = kindIdRef.value;
    const created = await api.views.create(kindId, {
      name,
      config: buildConfig(kindId, layoutType),
    });
    const summary = summarise(created);
    views.value = [...views.value, summary];
    return summary;
  }

  async function rename(id: string, name: string): Promise<void> {
    const kindId = kindIdRef.value;
    const updated = await api.views.update(kindId, id, { name });
    views.value = views.value.map((v) => (v.id === id ? summarise(updated) : v));
  }

  async function remove(id: string): Promise<void> {
    const kindId = kindIdRef.value;
    await api.views.remove(kindId, id);
    views.value = views.value.filter((v) => v.id !== id);
  }

  async function duplicate(id: string): Promise<ViewSummary> {
    const kindId = kindIdRef.value;
    const created = await api.views.duplicate(kindId, id);
    const summary = summarise(created);
    views.value = [...views.value, summary];
    return summary;
  }

  async function setDefault(id: string): Promise<void> {
    const kindId = kindIdRef.value;
    await api.views.update(kindId, id, { isDefault: true });
    // Server clears `isDefault` on siblings — reload so local state agrees.
    await reload();
  }

  async function setLocked(id: string, locked: boolean): Promise<void> {
    const kindId = kindIdRef.value;
    const updated = await api.views.update(kindId, id, { locked });
    views.value = views.value.map((v) => (v.id === id ? summarise(updated) : v));
  }

  async function reorder(orderedIds: string[]): Promise<void> {
    const kindId = kindIdRef.value;
    // Optimistic local sort — keep entries whose id is in the new order.
    const byId = new Map(views.value.map((v) => [v.id, v] as const));
    views.value = orderedIds.flatMap((id) => {
      const v = byId.get(id);
      return v ? [v] : [];
    });
    try {
      views.value = await api.views.reorder(kindId, orderedIds);
    } catch (err) {
      console.warn('[useViewList] reorder failed, reloading', err);
      await reload();
    }
  }

  watch(kindIdRef, () => void reload(), { immediate: true });

  return { views, loading, reload, create, rename, remove, duplicate, setDefault, setLocked, reorder };
}
