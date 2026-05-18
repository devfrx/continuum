/**
 * realtime/useRealtime.ts — Vue composable wrapper around the realtime bus.
 *
 * Subscribes to the singleton bus exposed by `./bus`, applies an optional
 * kind filter, and unsubscribes automatically on component unmount.
 * Components that need to react to multiple kinds can register a single
 * listener and switch on `event.kind` inside the callback.
 *
 * Example
 * ───────
 * ```ts
 * useRealtime(['database.rows.changed', 'property.value.changed'], (event) => {
 *   if (event.kind === 'database.rows.changed' && event.databaseId === id.value) {
 *     void reload();
 *   }
 * });
 * ```
 *
 * The handler is captured by reference — if it closes over reactive
 * sources it sees the latest values without any extra wiring.
 */

import { onBeforeUnmount } from 'vue';
import { subscribe, type RealtimeEvent, type RealtimeEventKind } from './bus';

export type RealtimeHandler = (event: RealtimeEvent) => void;

/**
 * Subscribe to the realtime bus, narrowing the event type to the
 * requested kinds. Pass `null` to receive every event.
 */
export function useRealtime<K extends RealtimeEventKind>(
  kinds: K | readonly K[],
  handler: (event: Extract<RealtimeEvent, { kind: K }>) => void,
): void;
export function useRealtime(
  kinds: null,
  handler: RealtimeHandler,
): void;
export function useRealtime(
  kinds: RealtimeEventKind | readonly RealtimeEventKind[] | null,
  handler: (event: RealtimeEvent) => void,
): void {
  const allowed = kinds === null
    ? null
    : new Set(Array.isArray(kinds) ? kinds : [kinds as RealtimeEventKind]);
  const unsubscribe = subscribe((event) => {
    if (allowed && !allowed.has(event.kind)) return;
    handler(event);
  });
  onBeforeUnmount(unsubscribe);
}
