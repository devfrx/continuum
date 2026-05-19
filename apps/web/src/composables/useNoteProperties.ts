/**
 * Per-note custom property values.
 *
 * Stateful composable scoped to a single note id (the active note in the
 * editor). Loads the note's effective schema (private + shared from
 * every database it belongs to) and keeps it in sync with the server.
 *
 * Realtime sync
 * ─────────────
 * `useNoteProperties` subscribes to the in-app realtime bus so any
 * mutation performed elsewhere — adding a property to a database, the
 * note being added/removed from a database, a value being edited in a
 * sibling surface — triggers a refetch transparently. The list of
 * databases to watch is dynamic: it comes from the response itself.
 */
import { computed, ref, watch, type Ref } from 'vue';
import { api } from '@/api';
import { subscribe } from '@/lib/realtime/bus';
import {
  publishDatabaseSchemaChanged,
  publishNoteUpdated,
  publishPropertyValueChanged,
} from '@/lib/realtime/publishers';
import type {
  NoteProperty,
  PropertyConfig,
  PropertyDefinition,
  PropertyType,
  PropertyValue,
} from '@continuum/shared';

export interface UseNotePropertiesReturn {
  entries: Ref<NoteProperty[]>;
  /** Ids of every database the note is currently a row of (reactive). */
  databaseIds: Ref<string[]>;
  loaded: Ref<boolean>;
  loading: Ref<boolean>;
  /** Force a reload from the server. */
  reload: () => Promise<void>;
  /** Persist a value (clears server-side when value is logically empty). */
  set: (propertyId: string, value: PropertyValue) => Promise<void>;
  /** Explicitly clear a value. */
  clear: (propertyId: string) => Promise<void>;
  /**
   * Create a new property definition rooted on this note. Routing
   * mirrors the backend rules of `POST /api/notes/:id/properties`:
   *   – standalone note → private (`scope='note'`).
   *   – exactly one database membership → shared on it.
   *   – multiple memberships → caller must pass `databaseId` or set
   *     `private: true`.
   */
  createDefinition: (data: {
    label: string;
    type: PropertyType;
    key?: string;
    icon?: string | null;
    description?: string | null;
    config?: PropertyConfig;
    position?: string;
    /** Force the legacy per-note (private) schema. */
    private?: boolean;
    /** Pick a specific database when the note belongs to several. */
    databaseId?: string;
  }) => Promise<PropertyDefinition>;
  /** Persist the complete display order of this note's *private* definitions. */
  reorderDefinitions: (ids: string[]) => Promise<void>;
}

/**
 * @param noteIdRef - Reactive note id. Whenever it changes, entries reload.
 *   Pass `null` to detach (e.g. when no note is selected).
 */
export function useNoteProperties(
  noteIdRef: Ref<string | null>,
): UseNotePropertiesReturn {
  const entries = ref<NoteProperty[]>([]);
  const databaseIds = ref<string[]>([]);
  const loaded = ref(false);
  const loading = ref(false);

  async function reload(): Promise<void> {
    const id = noteIdRef.value;
    if (!id) {
      entries.value = [];
      databaseIds.value = [];
      loaded.value = false;
      return;
    }
    loading.value = true;
    try {
      const response = await api.properties.listForNote(id);
      entries.value = response.properties;
      databaseIds.value = response.databaseIds;
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  async function set(propertyId: string, value: PropertyValue): Promise<void> {
    const id = noteIdRef.value;
    if (!id) return;
    // Optimistic local patch keeps the editor snappy...
    const { value: stored } = await api.properties.setValue(id, propertyId, value);
    entries.value = entries.value.map((e) =>
      e.definition.id === propertyId ? { ...e, value: stored } : e,
    );
    // Broadcast so any database table / saved view rendering this same
    // (note, property) pair refetches surgically. We send the event for
    // both private and shared definitions — listeners filter on noteId.
    publishPropertyValueChanged(id, propertyId);
    // Finally refetch so formulas / rollups / auto-managed values that
    // depend on this property recompute server-side and show fresh data.
    await reload();
  }

  async function clear(propertyId: string): Promise<void> {
    const id = noteIdRef.value;
    if (!id) return;
    await api.properties.clearValue(id, propertyId);
    entries.value = entries.value.map((e) =>
      e.definition.id === propertyId ? { ...e, value: null } : e,
    );
    publishPropertyValueChanged(id, propertyId);
    await reload();
  }

  async function createDefinition(data: {
    label: string;
    type: PropertyType;
    key?: string;
    icon?: string | null;
    description?: string | null;
    config?: PropertyConfig;
    position?: string;
    private?: boolean;
    databaseId?: string;
  }): Promise<PropertyDefinition> {
    const id = noteIdRef.value;
    if (!id) throw new Error('Cannot create a property without an active note');
    const created = await api.properties.createForNote(id, data);
    // Fan out the right event depending on where the definition landed.
    if (created.scope === 'database' && created.databaseId) {
      publishDatabaseSchemaChanged(created.databaseId);
    } else {
      publishNoteUpdated(id);
    }
    await reload();
    return created;
  }

  async function reorderDefinitions(ids: string[]): Promise<void> {
    const id = noteIdRef.value;
    if (!id) return;
    await api.properties.reorderForNote(id, ids);
    publishNoteUpdated(id);
    await reload();
  }

  // ── Realtime subscriptions ────────────────────────────────────────────
  // We subscribe once for the lifetime of the composable. The handler
  // closes over `noteIdRef.value` and `databaseIds.value` so it always
  // sees the latest state. Unsubscribe happens in the watcher cleanup
  // below to avoid leaks when the consumer detaches.
  const watchedDbIds = computed(() => databaseIds.value.slice());
  let unsubscribe: (() => void) | null = null;
  function attach(): void {
    if (unsubscribe) return;
    unsubscribe = subscribe((event) => {
      const id = noteIdRef.value;
      if (!id) return;
      switch (event.kind) {
        case 'note.updated':
        case 'note.deleted':
          if (event.noteId === id) void reload();
          break;
        case 'property.value.changed':
          if (event.noteId === id) void reload();
          break;
        case 'database.schema.changed':
        case 'database.updated':
          if (watchedDbIds.value.includes(event.databaseId)) void reload();
          break;
        case 'database.rows.changed':
          // The note may have just been added to / removed from a database.
          if (event.rowNoteId === id || watchedDbIds.value.includes(event.databaseId)) {
            void reload();
          }
          break;
        default:
          break;
      }
    });
  }
  function detach(): void {
    unsubscribe?.();
    unsubscribe = null;
  }

  watch(
    noteIdRef,
    (id) => {
      loaded.value = false;
      entries.value = [];
      databaseIds.value = [];
      if (id) attach();
      else detach();
      void reload();
    },
    { immediate: true },
  );

  return {
    entries,
    databaseIds,
    loaded,
    loading,
    reload,
    set,
    clear,
    createDefinition,
    reorderDefinitions,
  };
}
