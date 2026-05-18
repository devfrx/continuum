/**
 * realtime/publishers.ts — strongly-typed helpers for emitting events.
 *
 * Centralizing publish call-sites here keeps event payload shapes
 * consistent and gives a single grep target when auditing realtime
 * coverage. Every call must happen *after* the underlying API mutation
 * has resolved successfully — events are invalidation triggers, not
 * speculative updates.
 *
 * The publisher names use a verb-object form mirroring the event kind
 * so they read naturally at the call site (e.g.
 * `publishDatabaseRowsChanged(databaseId, { rowNoteId })`).
 */

import { publish } from './bus';

export function publishNoteUpdated(noteId: string): void {
  publish({ kind: 'note.updated', noteId });
}

export function publishNoteCreated(noteId: string): void {
  publish({ kind: 'note.created', noteId });
}

export function publishNoteDeleted(noteId: string): void {
  publish({ kind: 'note.deleted', noteId });
}

export function publishDatabaseUpdated(databaseId: string): void {
  publish({ kind: 'database.updated', databaseId });
}

export function publishDatabaseDeleted(databaseId: string): void {
  publish({ kind: 'database.deleted', databaseId });
}

export function publishDatabaseSchemaChanged(databaseId: string): void {
  publish({ kind: 'database.schema.changed', databaseId });
}

export function publishBlockViewChanged(
  blockId: string,
  viewId: string | null,
): void {
  publish({ kind: 'block.view.changed', blockId, viewId });
}

export function publishDatabaseRowsChanged(
  databaseId: string,
  options: { rowNoteId?: string } = {},
): void {
  publish({
    kind: 'database.rows.changed',
    databaseId,
    rowNoteId: options.rowNoteId,
  });
}

export function publishPropertyValueChanged(
  noteId: string,
  definitionId: string,
): void {
  publish({ kind: 'property.value.changed', noteId, definitionId });
}
