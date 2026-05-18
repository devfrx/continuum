/**
 * Per-note custom property values.
 *
 * Stateful composable scoped to a single note id (the active note in the
 * editor). Loads the note's properties + values once, then keeps them in
 * sync with the server through `set` / `clear`.
 *
 * Returned `entries` is the source of truth for the `PropertyPanel` UI.
 *
 * Unlike `useProperties` (which is a global singleton), this composable is
 * instantiated per-note and resets when `noteId` changes.
 */
import { ref, watch, type Ref } from 'vue';
import { api } from '@/api';
import type {
  NoteProperty,
  PropertyConfig,
  PropertyDefinition,
  PropertyType,
  PropertyValue,
} from '@continuum/shared';

export interface UseNotePropertiesReturn {
  entries: Ref<NoteProperty[]>;
  loaded: Ref<boolean>;
  loading: Ref<boolean>;
  /** Force a reload from the server. */
  reload: () => Promise<void>;
  /** Persist a value (clears server-side when value is logically empty). */
  set: (propertyId: string, value: PropertyValue) => Promise<void>;
  /** Explicitly clear a value. */
  clear: (propertyId: string) => Promise<void>;
  /** Create a new note-scoped property definition on this note. */
  createDefinition: (data: {
    label: string;
    type: PropertyType;
    key?: string;
    icon?: string | null;
    description?: string | null;
    config?: PropertyConfig;
    position?: string;
  }) => Promise<PropertyDefinition>;
  /** Persist the complete display order of this note's definitions. */
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
  const loaded = ref(false);
  const loading = ref(false);

  async function reload(): Promise<void> {
    const id = noteIdRef.value;
    if (!id) {
      entries.value = [];
      loaded.value = false;
      return;
    }
    loading.value = true;
    try {
      entries.value = await api.properties.listForNote(id);
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
    // ...then refetch so formulas, rollups and auto-managed values that
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
    await reload();
  }

  watch(
    noteIdRef,
    () => {
      loaded.value = false;
      entries.value = [];
      void reload();
    },
    { immediate: true },
  );

  async function createDefinition(data: {
    label: string;
    type: PropertyType;
    key?: string;
    icon?: string | null;
    description?: string | null;
    config?: PropertyConfig;
    position?: string;
  }): Promise<PropertyDefinition> {
    const id = noteIdRef.value;
    if (!id) throw new Error('Cannot create a property without an active note');
    const created = await api.properties.createForNote(id, data);
    await reload();
    return created;
  }

  async function reorderDefinitions(ids: string[]): Promise<void> {
    const id = noteIdRef.value;
    if (!id) return;
    await api.properties.reorderForNote(id, ids);
    await reload();
  }

  return {
    entries,
    loaded,
    loading,
    reload,
    set,
    clear,
    createDefinition,
    reorderDefinitions,
  };
}
