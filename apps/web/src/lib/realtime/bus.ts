/**
 * realtime/bus.ts — typed in-app event bus with cross-tab fan-out.
 *
 * Purpose
 * ───────
 * Continuum is a local-first single-user app, but mutations performed in
 * one surface (e.g. editing a property in `NoteInlineProperties`) must
 * propagate immediately to every other mounted surface that shows the
 * same data (e.g. a `DatabaseTableView` rendering that same row in the
 * embedded database block). A shared event bus is the simplest, lowest-
 * latency mechanism for this — far cheaper than a server roundtrip and
 * with zero new dependencies.
 *
 * Cross-tab / cross-window propagation is added via `BroadcastChannel`
 * which is supported natively in Electron's Chromium renderer and in
 * every modern browser the web app runs in. Listeners receive both
 * local and remote events through the same callback; the source of the
 * event is opaque on purpose so consumers can react identically.
 *
 * Event taxonomy
 * ──────────────
 * The discriminated union below is the single source of truth for
 * what the application is allowed to broadcast. Adding a new event
 * means extending the union — TS will then force every publisher and
 * subscriber to handle it correctly.
 *
 * Idempotency contract
 * ────────────────────
 * Publishers MUST emit *after* the corresponding mutation has been
 * confirmed by the server. Subscribers MUST treat events as triggers to
 * refetch / invalidate, not as carriers of authoritative state — the
 * payload only carries enough identifiers to scope the refetch.
 */

// ── Event taxonomy ────────────────────────────────────────────────────────

/** Any note mutation: title, body, tags, lock, kind, folder, …. */
export interface NoteUpdatedEvent {
  kind: 'note.updated';
  noteId: string;
}

/** A new note was created (used by folder tree + recents). */
export interface NoteCreatedEvent {
  kind: 'note.created';
  noteId: string;
}

/** A note was removed (or moved out of scope). */
export interface NoteDeletedEvent {
  kind: 'note.deleted';
  noteId: string;
}

/** A database itself changed (title / icon / archive / lock). */
export interface DatabaseUpdatedEvent {
  kind: 'database.updated';
  databaseId: string;
}

/** A database was removed. */
export interface DatabaseDeletedEvent {
  kind: 'database.deleted';
  databaseId: string;
}

/** Property definitions on a database changed (add / rename / remove / reorder). */
export interface DatabaseSchemaChangedEvent {
  kind: 'database.schema.changed';
  databaseId: string;
}

/**
 * A block-scoped saved view changed (create / rename / type-change /
 * config / source swap / delete). `viewId` is `null` when the event
 * announces a structural change to the block as a whole (e.g. its
 * last view was deleted and the block is now unbound again).
 */
export interface BlockViewChangedEvent {
  kind: 'block.view.changed';
  blockId: string;
  viewId: string | null;
}

/**
 * The row set on a database changed (row added / removed / reordered)
 * or a row's contributing data changed (cell, title, tags). `rowNoteId`
 * is provided when the event originates from a specific row mutation,
 * so subscribers that mirror a single row (e.g. the note editor open on
 * that row) can react surgically.
 */
export interface DatabaseRowsChangedEvent {
  kind: 'database.rows.changed';
  databaseId: string;
  rowNoteId?: string;
}

/** A property value on a note changed (with or without a database context). */
export interface PropertyValueChangedEvent {
  kind: 'property.value.changed';
  noteId: string;
  definitionId: string;
}

/** All published events flow through this discriminated union. */
export type RealtimeEvent =
  | NoteUpdatedEvent
  | NoteCreatedEvent
  | NoteDeletedEvent
  | DatabaseUpdatedEvent
  | DatabaseDeletedEvent
  | DatabaseSchemaChangedEvent
  | BlockViewChangedEvent
  | DatabaseRowsChangedEvent
  | PropertyValueChangedEvent;

/** Convenience type alias for the discriminator. */
export type RealtimeEventKind = RealtimeEvent['kind'];

// ── Bus implementation ────────────────────────────────────────────────────

type Listener = (event: RealtimeEvent) => void;

/**
 * Module-scoped singleton state. A single bus per renderer process is
 * what we want — every consumer that imports this module shares it.
 */
const listeners = new Set<Listener>();

/** Tag added to every payload we send on the channel so we can ignore echoes. */
const SOURCE_TAG = Math.random().toString(36).slice(2);

interface ChannelPayload {
  source: string;
  event: RealtimeEvent;
}

const channel: BroadcastChannel | null = (() => {
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    const c = new BroadcastChannel('continuum:realtime');
    c.addEventListener('message', (ev) => {
      const data = ev.data as ChannelPayload | undefined;
      if (!data || data.source === SOURCE_TAG) return;
      dispatch(data.event);
    });
    return c;
  } catch {
    // Some sandboxed contexts may block BroadcastChannel — fall back to
    // local-only delivery.
    return null;
  }
})();

function dispatch(event: RealtimeEvent): void {
  // Snapshot to tolerate listeners that unsubscribe synchronously.
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (err) {
      // Listener errors must not break other subscribers. Surface them
      // through `console.error` so they remain visible in dev tools.
      // eslint-disable-next-line no-console
      console.error('[realtime] listener threw', err);
    }
  }
}

/**
 * Publish an event. Local listeners are notified synchronously; remote
 * windows receive it via the BroadcastChannel asynchronously.
 */
export function publish(event: RealtimeEvent): void {
  dispatch(event);
  if (channel) {
    const payload: ChannelPayload = { source: SOURCE_TAG, event };
    channel.postMessage(payload);
  }
}

/** Subscribe to every event. Returns an `unsubscribe` callback. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
