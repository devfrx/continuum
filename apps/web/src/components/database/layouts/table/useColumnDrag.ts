/**
 * `useColumnDrag` — HTML5 drag-and-drop helpers for column reordering.
 *
 * Centralises the dataTransfer key, the "before/after" decision based on
 * cursor position relative to the target's bounding rect midpoint, and
 * the active drag-source / drop-target visual state.
 *
 * Each header cell instantiates its own composable; the source key is
 * carried via `dataTransfer.setData('text/columnKey', key)` so multiple
 * dragstart races are impossible — the only state shared between cells
 * is whatever the browser stores on the active drag operation.
 */
import { ref, type Ref } from 'vue';

/** Custom MIME type used to carry the dragged column's `propertyKey`. */
export const COLUMN_DRAG_MIME = 'text/columnKey';

/** Where to insert the dragged column relative to the drop target. */
export type DropPosition = 'before' | 'after';

export interface UseColumnDragOptions {
  /** Stable key for the column owning this cell. */
  propertyKey: string;
  /** Called on a successful drop with (sourceKey, position). */
  commit: (sourceKey: string, position: DropPosition) => void;
}

export interface UseColumnDragReturn {
  /** True while *this* cell is the drag source. */
  isSource: Ref<boolean>;
  /** Insertion-line position when this cell is the current dragover target. */
  indicator: Ref<DropPosition | null>;
  onDragStart: (event: DragEvent) => void;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
  onDragEnd: () => void;
}

export function useColumnDrag(opts: UseColumnDragOptions): UseColumnDragReturn {
  const isSource = ref(false);
  const indicator = ref<DropPosition | null>(null);

  /** Decide whether the cursor falls on the left or right half of `el`. */
  function decidePosition(event: DragEvent, el: HTMLElement): DropPosition {
    const rect = el.getBoundingClientRect();
    return event.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
  }

  function onDragStart(event: DragEvent): void {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(COLUMN_DRAG_MIME, opts.propertyKey);
    event.dataTransfer.effectAllowed = 'move';
    isSource.value = true;
  }

  function onDragOver(event: DragEvent): void {
    // We only accept other column drags — bail when a different payload is in flight.
    const types = event.dataTransfer?.types;
    if (!types || !Array.from(types).includes(COLUMN_DRAG_MIME)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    indicator.value = decidePosition(event, event.currentTarget as HTMLElement);
  }

  function onDragLeave(event: DragEvent): void {
    // Suppress flicker when the pointer crosses an internal child boundary.
    const next = event.relatedTarget as Node | null;
    const root = event.currentTarget as HTMLElement;
    if (next && root.contains(next)) return;
    indicator.value = null;
  }

  function onDrop(event: DragEvent): void {
    const sourceKey = event.dataTransfer?.getData(COLUMN_DRAG_MIME) ?? '';
    const position = indicator.value;
    indicator.value = null;
    if (!sourceKey || sourceKey === opts.propertyKey || !position) return;
    event.preventDefault();
    opts.commit(sourceKey, position);
  }

  function onDragEnd(): void {
    isSource.value = false;
    indicator.value = null;
  }

  return {
    isSource,
    indicator,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  };
}
