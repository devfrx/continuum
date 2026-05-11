/**
 * useRecentNotes — track and surface notes the user has recently
 * viewed/edited, persisted across app restarts via localStorage.
 *
 * The store is a singleton (module-scoped `ref`) so every consumer
 * shares the same reactive list — recording an entry from the editor
 * view immediately updates the sidebar and any future surface that
 * subscribes.
 *
 * Storage layout (key `continuum.recentNotes.v1`):
 *   `[{ id: string; viewedAt: number }, …]`
 *
 * Behaviour:
 *   - `record(id)` moves the id to the front, deduplicating prior
 *     occurrences and updating the timestamp.
 *   - The list is capped at `MAX_ENTRIES` (20) so it can never grow
 *     unbounded.
 *   - Stale entries pointing at deleted notes are filtered out by
 *     `entriesWithNotes()` rather than mutated up-front, keeping the
 *     storage write-path small.
 */
import { ref, computed, type ComputedRef } from 'vue';
import type { Note } from '@continuum/shared';
import { STORAGE_KEYS } from '@/lib/storageKeys';

const STORAGE_KEY = STORAGE_KEYS.recentNotes;
const MAX_ENTRIES = 20;

export interface RecentEntry {
  id: string;
  viewedAt: number;
}

function readStorage(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (e): e is RecentEntry =>
          !!e && typeof e.id === 'string' && typeof e.viewedAt === 'number',
      )
      .slice(0, MAX_ENTRIES);
  } catch {
    // Corrupt JSON or storage disabled (private mode) — start fresh.
    return [];
  }
}

function writeStorage(entries: RecentEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or storage disabled — silently degrade.
  }
}

const entries = ref<RecentEntry[]>(readStorage());

/**
 * Move (or insert) the given id at the head of the list with the
 * current timestamp. No-op for empty ids so the editor can call this
 * unconditionally on selection changes without a guard.
 */
function record(id: string | null | undefined): void {
  if (!id) return;
  const now = Date.now();
  const next: RecentEntry[] = [{ id, viewedAt: now }];
  for (const entry of entries.value) {
    if (entry.id === id) continue;
    next.push(entry);
    if (next.length >= MAX_ENTRIES) break;
  }
  entries.value = next;
  writeStorage(next);
}

/**
 * Drop the entry for `id` (e.g. when a note is deleted). Cheap
 * enough to call optimistically; safe when the id wasn't tracked.
 */
function forget(id: string): void {
  const next = entries.value.filter((e) => e.id !== id);
  if (next.length === entries.value.length) return;
  entries.value = next;
  writeStorage(next);
}

/** Wipe the whole list (consumer-facing "Clear recent" action). */
function clear(): void {
  entries.value = [];
  writeStorage([]);
}

/**
 * Project the persisted ids onto the current notes list, dropping
 * entries whose underlying note no longer exists. The result is
 * already capped to `limit` (default 8) so callers can render it
 * directly without additional slicing.
 */
function entriesWithNotes(notes: Note[], limit = 8): { entry: RecentEntry; note: Note }[] {
  if (entries.value.length === 0) return [];
  const byId = new Map(notes.map((n) => [n.id, n]));
  const out: { entry: RecentEntry; note: Note }[] = [];
  for (const entry of entries.value) {
    const note = byId.get(entry.id);
    if (!note) continue;
    out.push({ entry, note });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Composable accessor. Returns the same singleton every call so all
 * surfaces stay in sync.
 */
export function useRecentNotes(): {
  entries: ComputedRef<RecentEntry[]>;
  record: (id: string | null | undefined) => void;
  forget: (id: string) => void;
  clear: () => void;
  entriesWithNotes: (notes: Note[], limit?: number) => { entry: RecentEntry; note: Note }[];
} {
  return {
    entries: computed(() => entries.value),
    record,
    forget,
    clear,
    entriesWithNotes,
  };
}
