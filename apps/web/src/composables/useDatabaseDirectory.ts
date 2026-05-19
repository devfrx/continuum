/**
 * Lightweight, lazy-loaded directory of every database in the workspace.
 *
 * Many surfaces only need *names* (and the odd icon) for databases they
 * don't otherwise own — for example the property panel rendering a
 * "Shared · {dbName}" chip next to a shared definition, or the
 * `AddPropertyModal` showing the user where a property will land. Each
 * of those callers wanting to hit `/api/databases` separately would be
 * wasteful, so we keep a module-scoped cache with realtime invalidation.
 *
 * The cache is intentionally tiny: it stores the full `Database[]` and
 * an `id → Database` index. Mutations elsewhere in the app trigger
 * `database.updated` / `database.deleted` / `note.created` events on
 * the realtime bus; we use those to invalidate so the names stay
 * fresh without forcing each consumer to wire a subscription itself.
 */
import { computed, ref, type ComputedRef } from 'vue';
import { api } from '@/api';
import { subscribe } from '@/lib/realtime/bus';
import type { Database } from '@continuum/shared';

const list = ref<Database[]>([]);
const loaded = ref(false);
let loadingPromise: Promise<void> | null = null;

function ensureLoaded(): void {
    if (loaded.value || loadingPromise) return;
    loadingPromise = api.databases
        .list()
        .then((items) => {
            list.value = items;
            loaded.value = true;
        })
        .catch(() => {
            // Swallow: callers gracefully degrade to ids when names are missing.
        })
        .finally(() => {
            loadingPromise = null;
        });
}

let subscribed = false;
function ensureSubscribed(): void {
    if (subscribed) return;
    subscribed = true;
    subscribe((event) => {
        if (
            event.kind === 'database.updated'
            || event.kind === 'database.deleted'
            || event.kind === 'note.created'
        ) {
            // Force a refetch the next time someone reads.
            loaded.value = false;
        }
    });
}

export interface UseDatabaseDirectoryReturn {
    /** Reactive array of every database the user can see. */
    databases: ComputedRef<Database[]>;
    /** Resolve a database by id (returns `null` while the cache is empty). */
    byId: (id: string) => Database | null;
    /** Friendly display name for an id (falls back to a short id when unknown). */
    displayName: (id: string) => string;
    /** Force-refresh the cache (used after manual mutations). */
    refresh: () => Promise<void>;
}

/**
 * Returns the shared directory. Safe to call from any setup-time or
 * runtime context — subscriptions are attached once per app session.
 */
export function useDatabaseDirectory(): UseDatabaseDirectoryReturn {
    ensureSubscribed();
    ensureLoaded();
    const map = computed(() => new Map(list.value.map((db) => [db.id, db] as const)));
    return {
        databases: computed(() => list.value.slice()),
        byId: (id: string) => map.value.get(id) ?? null,
        displayName: (id: string) => map.value.get(id)?.title ?? id.slice(0, 6),
        refresh: async () => {
            loaded.value = false;
            loadingPromise = null;
            ensureLoaded();
            await loadingPromise;
        },
    };
}
