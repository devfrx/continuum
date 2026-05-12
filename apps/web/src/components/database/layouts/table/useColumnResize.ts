/**
 * `useColumnResize` — pointer-driven column-width drag handler.
 *
 * Owns the local `liveWidth` ref so the column resizes visually during
 * the drag, and emits a single `commit` callback on pointer-up with the
 * final clamped width. Persistence (the actual `patch()` call) is the
 * caller's responsibility — this composable knows nothing about views.
 *
 * Resize is intentionally one-shot at commit time: the parent's
 * `patch()` is debounced (250 ms) so streaming a width per pointermove
 * would still be safe, but a single commit avoids an unnecessary chain
 * of in-flight PATCH requests when the user drags slowly.
 */
import { onBeforeUnmount, ref, type Ref } from 'vue';

/** Lower / upper bounds used by the clamp; mirrored in `tableGrid.ts`. */
const MIN_WIDTH = 64;
const MAX_WIDTH = 1200;

export interface UseColumnResizeOptions {
  /** Current persisted width to start the drag from. */
  startWidthOf: () => number;
  /** Called once when the user releases the pointer with the final width. */
  commit: (width: number) => void;
}

export interface UseColumnResizeReturn {
  /** Live (unsaved) width during the drag, or `null` when idle. */
  liveWidth: Ref<number | null>;
  /** Whether a drag is currently active (for cursor / overlay styling). */
  active: Ref<boolean>;
  /** Pointer-down handler for the resizer element. */
  onPointerDown: (event: PointerEvent) => void;
}

export function useColumnResize(opts: UseColumnResizeOptions): UseColumnResizeReturn {
  const liveWidth = ref<number | null>(null);
  const active = ref(false);

  let startX = 0;
  let startWidth = 0;
  let pointerId: number | null = null;
  let target: HTMLElement | null = null;

  /** Clamp to the table-wide width bounds. */
  function clamp(value: number): number {
    if (value < MIN_WIDTH) return MIN_WIDTH;
    if (value > MAX_WIDTH) return MAX_WIDTH;
    return Math.round(value);
  }

  function onMove(event: PointerEvent): void {
    if (!active.value) return;
    liveWidth.value = clamp(startWidth + (event.clientX - startX));
  }

  function endDrag(commitChange: boolean): void {
    if (!active.value) return;
    const final = liveWidth.value;
    active.value = false;
    if (target && pointerId != null) {
      try {
        target.releasePointerCapture(pointerId);
      } catch {
        /* element may already be detached during fast unmounts */
      }
    }
    target?.removeEventListener('pointermove', onMove);
    target?.removeEventListener('pointerup', onUp);
    target?.removeEventListener('pointercancel', onCancel);
    target = null;
    pointerId = null;
    if (commitChange && final != null && final !== startWidth) opts.commit(final);
    liveWidth.value = null;
  }

  function onUp(): void {
    endDrag(true);
  }

  function onCancel(): void {
    endDrag(false);
  }

  function onPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    target = event.currentTarget as HTMLElement;
    pointerId = event.pointerId;
    startX = event.clientX;
    startWidth = opts.startWidthOf();
    liveWidth.value = startWidth;
    active.value = true;
    try {
      target.setPointerCapture(pointerId);
    } catch {
      /* setPointerCapture can throw on detached nodes */
    }
    target.addEventListener('pointermove', onMove);
    target.addEventListener('pointerup', onUp);
    target.addEventListener('pointercancel', onCancel);
  }

  onBeforeUnmount(() => endDrag(false));

  return { liveWidth, active, onPointerDown };
}
