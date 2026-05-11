import { onBeforeUnmount } from 'vue';

export interface UseTypeaheadOptions<T> {
    /** Returns the current array of items to search through. */
    items: () => readonly T[];
    /** Returns the searchable label for an item (compared case-insensitively). */
    getLabel: (item: T) => string;
    /** Invoked with the matched index in the original `items()` array. */
    onMatch: (index: number) => void;
    /** Returns the index to start scanning from (wrapping). Defaults to 0. */
    startFrom?: () => number;
    /** Idle ms before the keystroke buffer resets. Defaults to 700. */
    idleMs?: number;
}

/**
 * Keystroke-based typeahead matcher. Accumulates printable single-character
 * keys into a buffer; for each keystroke it scans `items()` from
 * `startFrom()` (wrapping) and calls `onMatch(index)` for the first item
 * whose label starts with the buffer (case-insensitive). The buffer clears
 * after `idleMs` of inactivity.
 *
 * Returns `handleKey` to wire into a `@keydown` handler and `reset` to
 * clear the buffer manually (e.g. when the popup closes).
 */
export function useTypeahead<T>(opts: UseTypeaheadOptions<T>): {
    handleKey: (e: KeyboardEvent) => void;
    reset: () => void;
} {
    const idle = opts.idleMs ?? 700;
    let buffer = '';
    let timer: number | null = null;

    function reset(): void {
        buffer = '';
        if (timer !== null) {
            window.clearTimeout(timer);
            timer = null;
        }
    }

    function handleKey(e: KeyboardEvent): void {
        if (e.key.length !== 1 || e.metaKey || e.ctrlKey || e.altKey) return;
        buffer += e.key.toLowerCase();
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
            buffer = '';
            timer = null;
        }, idle);

        const items = opts.items();
        const n = items.length;
        if (!n) return;
        const startBase = opts.startFrom?.() ?? 0;
        const start = startBase < 0 ? 0 : startBase;
        for (let off = 0; off < n; off += 1) {
            const idx = (start + off) % n;
            if (opts.getLabel(items[idx]!).toLowerCase().startsWith(buffer)) {
                opts.onMatch(idx);
                return;
            }
        }
    }

    onBeforeUnmount(reset);

    return { handleKey, reset };
}
