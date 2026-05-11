/**
 * Format a timestamp as a compact "time ago" label suitable for dense list
 * rows (sidebar, recent notes, …). Falls back to a localised date once the
 * delta exceeds a week.
 *
 * Buckets:
 *   - `< 1 minute`  → `"now"`
 *   - `< 1 hour`    → `"X m"`
 *   - `< 1 day`     → `"X h"`
 *   - `< 1 week`    → short weekday, e.g. `"Tue"`
 *   - same year     → `"12 Mar"`
 *   - older         → `"12 Mar 24"`
 *
 * Empty / invalid inputs return an empty string so callers can render the
 * result unconditionally.
 *
 * @param input - `Date`, ISO string, epoch milliseconds, or null/undefined.
 */
export function relativeTime(input: Date | string | number | null | undefined): string {
  if (input === null || input === undefined || input === '') return '';
  const date = input instanceof Date ? input : new Date(input);
  const ts = date.getTime();
  if (Number.isNaN(ts)) return '';
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h`;
  if (diff < 604_800_000) return date.toLocaleDateString(undefined, { weekday: 'short' });
  if (date.getFullYear() === new Date().getFullYear()) {
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
}
