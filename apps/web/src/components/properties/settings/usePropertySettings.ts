/**
 * usePropertySettings — local config draft + debounced PATCH save for a
 * single {@link PropertyDefinition}.
 *
 * The draft tracks the panel's current view of `definition.config` so
 * inputs stay responsive while the server save is in flight. Writes go
 * through `api.properties.update`, which the rest of the app already
 * relies on for label / type / icon edits — same endpoint, same
 * realtime fan-out via the `database-schema-changed` event.
 */
import { ref, watch, type Ref } from 'vue';
import { api } from '@/api';
import {
    publishDatabaseSchemaChanged,
    publishNoteUpdated,
} from '@/lib/realtime';
import type { PropertyConfig, PropertyDefinition } from '@continuum/shared';

const SAVE_DEBOUNCE_MS = 220;

export interface UsePropertySettings {
    /** Current in-flight draft of the property's config. */
    draft: Ref<PropertyConfig | null>;
    /** Apply a patch optimistically and schedule a debounced PATCH save. */
    patch: (next: PropertyConfig) => void;
    saving: Ref<boolean>;
    error: Ref<string | null>;
}

export function usePropertySettings(
    definition: Ref<PropertyDefinition | null>,
    onSaved: (def: PropertyDefinition) => void,
): UsePropertySettings {
    const draft = ref<PropertyConfig | null>(definition.value?.config ?? null);
    const saving = ref(false);
    const error = ref<string | null>(null);

    let saveTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSavedJson = JSON.stringify(definition.value?.config ?? null);

    watch(
        () => definition.value?.id,
        () => {
            draft.value = definition.value?.config ?? null;
            lastSavedJson = JSON.stringify(definition.value?.config ?? null);
            error.value = null;
            if (saveTimer) {
                clearTimeout(saveTimer);
                saveTimer = null;
            }
        },
    );

    async function flush(): Promise<void> {
        const target = definition.value;
        const config = draft.value;
        if (!target || !config) return;
        const nextJson = JSON.stringify(config);
        if (nextJson === lastSavedJson) return;
        saving.value = true;
        error.value = null;
        try {
            const updated = await api.properties.update(target.id, { config });
            lastSavedJson = JSON.stringify(updated.config);
            onSaved(updated);
            if (updated.scope === 'database' && updated.databaseId) {
                publishDatabaseSchemaChanged(updated.databaseId);
            } else if (updated.scope === 'note' && updated.noteId) {
                publishNoteUpdated(updated.noteId);
            }
        } catch (err) {
            error.value = err instanceof Error ? err.message : 'Failed to save settings';
        } finally {
            saving.value = false;
        }
    }

    function patch(next: PropertyConfig): void {
        draft.value = next;
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
            saveTimer = null;
            void flush();
        }, SAVE_DEBOUNCE_MS);
    }

    return { draft, patch, saving, error };
}
