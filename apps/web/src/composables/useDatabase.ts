/**
 * Per-database / per-block composables.
 *
 * The data hierarchy is:
 *
 *   Database (datasource) ─┐
 *                          ├─→ rows, schema, raw queries
 *                          │
 *   Block (Tiptap node)    │
 *     └─→ BlockView × N ───┴─→ each view points at one datasource
 *
 * The composables below mirror that split:
 *
 *   - `useDatabaseBundle(databaseIdRef)` — loads a datasource's
 *     database row + schema in a single round-trip and exposes
 *     mutators for title / icon / lock / archive and property CRUD.
 *
 *   - `useBlockViews(blockIdRef)` — loads every saved view bound to a
 *     Tiptap block and exposes CRUD (`addView`, `patchView`,
 *     `removeView`). Each view names the datasource it renders.
 *
 *   - `useDatabaseQuery(databaseIdRef, configOverridesRef)` — runs the
 *     query endpoint whenever inputs change and exposes the paged
 *     snapshot. Drives the table / list / board body. The active
 *     view's config is composed client-side and passed in via
 *     `configOverridesRef`.
 *
 *   - `useDatabaseCellSetter()` — value setter wrapping
 *     `api.properties.setValue` keyed by note id. Drives the cell
 *     editors. Cell edits invalidate the parent query.
 */
import { computed, ref, watch, type Ref } from 'vue';
import { api } from '@/api';
import type {
  DatabaseBundle,
  DatabaseQueryRequest,
  DatabaseQueryResponse,
  DatabaseRowCreateInput,
  DatabaseView,
  DatabaseViewConfig,
  DatabaseViewType,
  PropertyConfig,
  PropertyDefinition,
  PropertyType,
  PropertyValue,
} from '@continuum/shared';
import {
  publishBlockViewChanged,
  publishDatabaseRowsChanged,
  publishDatabaseSchemaChanged,
  publishDatabaseUpdated,
  publishNoteCreated,
  publishNoteDeleted,
  publishPropertyValueChanged,
  useRealtime,
} from '@/lib/realtime';

// ─────────────────────────── Bundle ────────────────────────────────────

export interface UseDatabaseBundleReturn {
  bundle: Ref<DatabaseBundle | null>;
  loaded: Ref<boolean>;
  loading: Ref<boolean>;
  /** True when the supplied id resolved to a 404. */
  notFound: Ref<boolean>;
  reload: () => Promise<void>;
  /** Patch the database (title, icon, lock, …). */
  patchDatabase: (
    patch: Partial<{
      title: string;
      description: string | null;
      icon: string | null;
      locked: boolean;
      archived: boolean;
    }>,
  ) => Promise<void>;
  /** Create a new database-scoped property definition. */
  addProperty: (data: {
    label: string;
    type: PropertyType;
    key?: string;
    icon?: string | null;
    description?: string | null;
    config?: PropertyConfig;
  }) => Promise<PropertyDefinition | null>;
  reorderProperties: (ids: string[]) => Promise<void>;
}

export function useDatabaseBundle(
  databaseIdRef: Ref<string | null>,
): UseDatabaseBundleReturn {
  const bundle = ref<DatabaseBundle | null>(null);
  const loaded = ref(false);
  const loading = ref(false);
  const notFound = ref(false);

  async function reload(): Promise<void> {
    const id = databaseIdRef.value;
    if (!id) {
      bundle.value = null;
      loaded.value = false;
      notFound.value = false;
      return;
    }
    loading.value = true;
    notFound.value = false;
    try {
      bundle.value = await api.databases.bundle(id);
      loaded.value = true;
    } catch (err) {
      // The shared http helper throws `${status} ${statusText}` on non-2xx
      // — distinguish a 404 (missing datasource) so the embed can fall
      // back to the "unbound" placeholder instead of showing a generic
      // error.
      if (err instanceof Error && err.message.startsWith('404')) {
        bundle.value = null;
        notFound.value = true;
        loaded.value = true;
      } else {
        throw err;
      }
    } finally {
      loading.value = false;
    }
  }

  watch(
    databaseIdRef,
    () => {
      loaded.value = false;
      bundle.value = null;
      void reload();
    },
    { immediate: true },
  );

  // Cross-window live sync — when another window / tab mutates this
  // datasource, refresh the bundle so the title and schema stay in
  // lockstep. Self-published events arrive through the same listener;
  // reloading is idempotent so the duplicate round-trip is harmless.
  useRealtime(
    ['database.updated', 'database.schema.changed', 'database.deleted'],
    (event) => {
      if (event.databaseId !== databaseIdRef.value) return;
      if (event.kind === 'database.deleted') {
        bundle.value = null;
        notFound.value = true;
        return;
      }
      void reload();
    },
  );

  async function patchDatabase(
    patch: Parameters<UseDatabaseBundleReturn['patchDatabase']>[0],
  ) {
    const id = databaseIdRef.value;
    if (!id) return;
    const updated = await api.databases.update(id, patch);
    if (bundle.value) bundle.value = { ...bundle.value, database: updated };
    publishDatabaseUpdated(id);
  }

  async function addProperty(
    data: Parameters<UseDatabaseBundleReturn['addProperty']>[0],
  ) {
    const id = databaseIdRef.value;
    if (!id) return null;
    const created = await api.databases.properties.create(id, data);
    if (bundle.value) {
      bundle.value = { ...bundle.value, schema: [...bundle.value.schema, created] };
    }
    publishDatabaseSchemaChanged(id);
    return created;
  }

  async function reorderProperties(ids: string[]): Promise<void> {
    const id = databaseIdRef.value;
    if (!id) return;
    const schema = await api.databases.properties.reorder(id, ids);
    if (bundle.value) bundle.value = { ...bundle.value, schema };
    publishDatabaseSchemaChanged(id);
  }

  return {
    bundle,
    loaded,
    loading,
    notFound,
    reload,
    patchDatabase,
    addProperty,
    reorderProperties,
  };
}

// ─────────────────────────── Block Views ───────────────────────────────

export interface UseBlockViewsReturn {
  views: Ref<DatabaseView[]>;
  loaded: Ref<boolean>;
  loading: Ref<boolean>;
  reload: () => Promise<void>;
  /** Append a new view to the block. Returns the new view id (or null). */
  addView: (input: {
    dataSourceDatabaseId: string;
    name: string;
    type: DatabaseViewType;
    config?: Partial<DatabaseViewConfig>;
  }) => Promise<string | null>;
  patchView: (
    viewId: string,
    patch: {
      name?: string;
      type?: DatabaseViewType;
      config?: Partial<DatabaseViewConfig>;
      dataSourceDatabaseId?: string;
    },
  ) => Promise<void>;
  removeView: (viewId: string) => Promise<void>;
}

/**
 * Load and mutate the block-scoped views bound to a Tiptap database
 * block. Empty array means the block is unbound (picker state).
 */
export function useBlockViews(blockIdRef: Ref<string | null>): UseBlockViewsReturn {
  const views = ref<DatabaseView[]>([]);
  const loaded = ref(false);
  const loading = ref(false);

  async function reload(): Promise<void> {
    const id = blockIdRef.value;
    if (!id) {
      views.value = [];
      loaded.value = false;
      return;
    }
    loading.value = true;
    try {
      views.value = await api.blockViews.list(id);
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  watch(
    blockIdRef,
    () => {
      loaded.value = false;
      views.value = [];
      void reload();
    },
    { immediate: true },
  );

  useRealtime(['block.view.changed'], (event) => {
    if (event.blockId !== blockIdRef.value) return;
    void reload();
  });

  async function addView(input: {
    dataSourceDatabaseId: string;
    name: string;
    type: DatabaseViewType;
    config?: Partial<DatabaseViewConfig>;
  }): Promise<string | null> {
    const blockId = blockIdRef.value;
    if (!blockId) return null;
    const created = await api.blockViews.create({ blockId, ...input });
    views.value = [...views.value, created];
    publishBlockViewChanged(blockId, created.id);
    return created.id;
  }

  async function patchView(
    viewId: string,
    patch: {
      name?: string;
      type?: DatabaseViewType;
      config?: Partial<DatabaseViewConfig>;
      dataSourceDatabaseId?: string;
    },
  ): Promise<void> {
    const blockId = blockIdRef.value;
    if (!blockId) return;
    const updated = await api.blockViews.update(viewId, patch);
    views.value = views.value.map((v) => (v.id === viewId ? updated : v));
    publishBlockViewChanged(blockId, viewId);
  }

  async function removeView(viewId: string): Promise<void> {
    const blockId = blockIdRef.value;
    if (!blockId) return;
    await api.blockViews.remove(viewId);
    views.value = views.value.filter((v) => v.id !== viewId);
    publishBlockViewChanged(blockId, null);
  }

  return { views, loaded, loading, reload, addView, patchView, removeView };
}

// ─────────────────────────── Query ─────────────────────────────────────

export interface UseDatabaseQueryReturn {
  response: Ref<DatabaseQueryResponse | null>;
  loading: Ref<boolean>;
  error: Ref<string | null>;
  reload: () => Promise<void>;
  /** Create a row (new note by default) and refresh the snapshot. */
  createRow: (data?: DatabaseRowCreateInput) => Promise<string | null>;
  /** Remove a row by membership id; optionally also delete the underlying note. */
  removeRow: (rowId: string, options?: { deleteNote?: boolean }) => Promise<void>;
  /** Persist a manual row order (full-list payload). */
  reorderRows: (ids: string[]) => Promise<void>;
}

/**
 * Reactive runner around `POST /api/databases/:id/query`.
 *
 * The query is recomputed whenever the datasource id or the inline
 * config override changes. Callers (typically the active BlockView)
 * compose the desired filter / sort / pagination client-side and pass
 * it in via `configOverrideRef`.
 */
export function useDatabaseQuery(
  databaseIdRef: Ref<string | null>,
  configOverrideRef: Ref<Partial<DatabaseViewConfig> | null>,
): UseDatabaseQueryReturn {
  const response = ref<DatabaseQueryResponse | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const request = computed<DatabaseQueryRequest>(() => ({
    config: configOverrideRef.value ?? undefined,
  }));

  async function reload(): Promise<void> {
    const id = databaseIdRef.value;
    if (!id) {
      response.value = null;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      response.value = await api.databases.query(id, request.value);
    } catch (err) {
      error.value = messageFromUnknownError(err);
      if (!response.value) response.value = { total: 0, rows: [] };
    } finally {
      loading.value = false;
    }
  }

  watch(
    [databaseIdRef, configOverrideRef],
    ([databaseId], previous) => {
      const [previousDatabaseId] = previous ?? [];
      if (databaseId !== previousDatabaseId) response.value = null;
      void reload();
    },
    { immediate: true, deep: true },
  );

  // Live sync — refresh the snapshot whenever any row in this database
  // is created / removed / re-ordered, or one of its property values
  // changes (including in a different block, window or tab). Schema
  // changes also invalidate row resolution (new columns appear blank
  // otherwise) so we listen here too.
  useRealtime(
    [
      'database.rows.changed',
      'database.schema.changed',
      'property.value.changed',
    ],
    (event) => {
      if (event.kind === 'property.value.changed') {
        const snapshot = response.value;
        if (!snapshot) return;
        const known = snapshot.rows.some((r) => r.noteId === event.noteId);
        if (!known) return;
      } else if (event.databaseId !== databaseIdRef.value) {
        return;
      }
      void reload();
    },
  );

  async function createRow(data: DatabaseRowCreateInput = {}): Promise<string | null> {
    const id = databaseIdRef.value;
    if (!id) return null;
    error.value = null;
    try {
      const { row } = await api.databases.rows.create(id, data);
      await reload();
      publishNoteCreated(row.noteId);
      publishDatabaseRowsChanged(id, { rowNoteId: row.noteId });
      return row.id;
    } catch (err) {
      error.value = messageFromUnknownError(err);
      return null;
    }
  }

  async function removeRow(
    rowId: string,
    options?: { deleteNote?: boolean },
  ): Promise<void> {
    const id = databaseIdRef.value;
    if (!id) return;
    error.value = null;
    const removed = response.value?.rows.find((r) => r.rowId === rowId);
    try {
      await api.databases.rows.remove(id, rowId, options);
      await reload();
      publishDatabaseRowsChanged(id, removed ? { rowNoteId: removed.noteId } : {});
      if (options?.deleteNote && removed) publishNoteDeleted(removed.noteId);
    } catch (err) {
      error.value = messageFromUnknownError(err);
    }
  }

  async function reorderRows(ids: string[]): Promise<void> {
    const id = databaseIdRef.value;
    if (!id) return;
    error.value = null;
    try {
      await api.databases.rows.reorder(id, ids);
      await reload();
      publishDatabaseRowsChanged(id);
    } catch (err) {
      error.value = messageFromUnknownError(err);
    }
  }

  return { response, loading, error, reload, createRow, removeRow, reorderRows };
}

function messageFromUnknownError(err: unknown): string {
  return err instanceof Error ? err.message : 'Database operation failed';
}

// ─────────────────────────── Cell setter ───────────────────────────────

/**
 * Tiny convenience wrapper for the in-row property editors. Each cell
 * passes the row's `noteId` and the affected `definitionId` plus the
 * new value; the helper persists it through the normal per-note property
 * pipeline (rows are real notes).
 */
export function useDatabaseCellSetter(): {
  setValue: (noteId: string, propertyId: string, value: PropertyValue) => Promise<void>;
  clearValue: (noteId: string, propertyId: string) => Promise<void>;
} {
  async function setValue(
    noteId: string,
    propertyId: string,
    value: PropertyValue,
  ): Promise<void> {
    await api.properties.setValue(noteId, propertyId, value);
    publishPropertyValueChanged(noteId, propertyId);
  }
  async function clearValue(noteId: string, propertyId: string): Promise<void> {
    await api.properties.clearValue(noteId, propertyId);
    publishPropertyValueChanged(noteId, propertyId);
  }
  return { setValue, clearValue };
}
