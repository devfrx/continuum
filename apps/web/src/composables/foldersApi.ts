/**
 * foldersApi — command wrappers around `api.folders.*` that keep the
 * shared `useFolders` store in sync.
 *
 * Why a separate file
 * ───────────────────
 * `useFolders` exposes reactive *state* (the tree + lookup helpers).
 * Mutating commands (create/update/move/remove) historically lived on
 * the same composable, which conflated read-only state with side-effect
 * operations. Splitting them here keeps the composable focused and lets
 * commands be imported individually as plain async functions.
 *
 * No circular import
 * ──────────────────
 * `foldersApi` imports `useFolders` (one direction); `useFolders` does
 * NOT import from `foldersApi`. The commands reach the singleton state
 * solely via `useFolders().refresh()` after the API call resolves.
 */
import { api } from '@/api';
import type { Folder } from '@continuum/shared';
import { useFolders } from './useFolders';

/** Create a folder, then refresh the shared tree. */
export async function createFolder(
  data: Parameters<typeof api.folders.create>[0],
): Promise<Folder> {
  const created = await api.folders.create(data);
  await useFolders().refresh();
  return created;
}

/** Patch a folder, then refresh the shared tree. */
export async function updateFolder(
  id: string,
  data: Parameters<typeof api.folders.update>[1],
): Promise<Folder> {
  const updated = await api.folders.update(id, data);
  await useFolders().refresh();
  return updated;
}

/** Move a folder under a new parent, then refresh the shared tree. */
export async function moveFolder(
  id: string,
  data: Parameters<typeof api.folders.move>[1],
): Promise<Folder> {
  const moved = await api.folders.move(id, data);
  await useFolders().refresh();
  return moved;
}

/** Delete a folder, then refresh the shared tree. */
export async function removeFolder(id: string): Promise<void> {
  await api.folders.remove(id);
  await useFolders().refresh();
}
