/**
 * useDragAndDrop — centralised drag-and-drop primitives.
 *
 * Most movement-style drag interactions across the app (note rows in
 * the sidebar, properties in panels, rows in card views, kanban cards
 * across columns, …) used to ship their own hand-rolled HTML5 drag
 * handlers. That made the UX inconsistent: some surfaces snapped, some
 * flickered, none had drop indicators, and there was no shared notion
 * of "what is currently being dragged".
 *
 * This module exposes two small primitives:
 *
 *   – `useDragSource`   bind to a draggable element to broadcast a
 *                       payload through a typed MIME channel.
 *   – `useDropTarget`   bind to a receiving element to accept payloads
 *                       of a given MIME list and trigger a callback.
 *
 * Both expose Vue event handler maps (`dragHandlers`, `dropHandlers`)
 * that the consumer spreads via `v-on="..."`. Reactive `isDragging` /
 * `isOver` flags drive visual feedback (ghost styling, drop indicator
 * line, accent borders) without each call site re-implementing local
 * `ref<string|null>` plumbing.
 *
 * A reactive `globalDragState` is kept across all sources so any drop
 * target can introspect what's currently in flight (kind, payload,
 * MIME) without depending on `DataTransfer.types` — useful for
 * `acceptKind` filters and for surfaces that want to gray themselves
 * out while a drag is active.
 *
 * Autoscroll: drop targets can opt into vertical-edge autoscroll of
 * an ancestor container, which fixes long Kanban columns and tall
 * sidebars where the user otherwise gets stuck at the viewport edge.
 *
 * Out of scope: TipTap block drag handles inside the editor — those
 * have a custom DOM contract (`data-tiptap-drag-handle`) and stay on
 * their own implementation per project convention.
 */
import { reactive, readonly, ref, type ComputedRef, type Ref } from 'vue';

// ─────────────────────────── MIME registry ───────────────────────────

/**
 * Canonical MIME channels used by movement-style drags across the app.
 * Stored centrally so adding a new draggable surface is one entry here
 * + one `useDragSource({ mime: DRAG_MIME.something })` call.
 */
export const DRAG_MIME = {
    noteId: 'application/x-continuum-note-id',
    rowId: 'application/x-continuum-row-id',
    cardId: 'application/x-continuum-card-id',
    propertyId: 'application/x-continuum-property-id',
} as const;

export type DragMime = (typeof DRAG_MIME)[keyof typeof DRAG_MIME];

// ─────────────────────────── Global state ────────────────────────────

interface MutableDragState {
    /** MIME channel of the active drag, `null` when idle. */
    mime: string | null;
    /** Stringified payload (id) of the active drag, `null` when idle. */
    payload: string | null;
    /** Optional opaque tag describing the source (`'database-row'`, …). */
    kind: string | null;
}

const mutableDragState = reactive<MutableDragState>({
    mime: null,
    payload: null,
    kind: null,
});

/** Read-only view of the active drag — safe to expose to any caller. */
export const globalDragState = readonly(mutableDragState);

function setGlobalDragState(mime: string, payload: string, kind: string | null): void {
    mutableDragState.mime = mime;
    mutableDragState.payload = payload;
    mutableDragState.kind = kind;
}

function clearGlobalDragState(): void {
    mutableDragState.mime = null;
    mutableDragState.payload = null;
    mutableDragState.kind = null;
}

// ─────────────────────────── Drag source ────────────────────────────

type DisabledFlag = ComputedRef<boolean> | Ref<boolean> | (() => boolean);

function isDisabled(flag: DisabledFlag | undefined): boolean {
    if (flag === undefined) return false;
    return typeof flag === 'function' ? flag() : flag.value;
}

export interface UseDragSourceOptions {
    /** MIME channel to write the payload into. */
    readonly mime: string;
    /** Optional tag forwarded to `globalDragState.kind`. */
    readonly kind?: string;
    /** Resolve the payload at dragstart. Return `null` to abort. */
    readonly getPayload: () => string | null;
    /** Source is inert (e.g. read-only view). */
    readonly disabled?: DisabledFlag;
    /** Lifecycle hooks for telemetry / custom side effects. */
    readonly onStart?: (event: DragEvent) => void;
    readonly onEnd?: () => void;
}

export interface DragSourceHandlers {
    readonly dragstart: (event: DragEvent) => void;
    readonly dragend: () => void;
}

export interface UseDragSourceReturn {
    readonly isDragging: Ref<boolean>;
    readonly dragHandlers: DragSourceHandlers;
}

/**
 * Create a draggable surface. Bind the returned handlers via
 * `v-on="dragHandlers"` on the element you want to be the source.
 */
export function useDragSource(options: UseDragSourceOptions): UseDragSourceReturn {
    const isDragging = ref(false);

    function dragstart(event: DragEvent): void {
        if (isDisabled(options.disabled)) {
            event.preventDefault();
            return;
        }
        const payload = options.getPayload();
        if (!payload) {
            event.preventDefault();
            return;
        }
        event.stopPropagation();
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(options.mime, payload);
            // Mirror to text/plain so legacy targets (and DOM inspectors)
            // can still observe a meaningful value.
            event.dataTransfer.setData('text/plain', payload);
        }
        setGlobalDragState(options.mime, payload, options.kind ?? null);
        isDragging.value = true;
        options.onStart?.(event);
    }

    function dragend(): void {
        isDragging.value = false;
        clearGlobalDragState();
        options.onEnd?.();
    }

    return {
        isDragging,
        dragHandlers: { dragstart, dragend },
    };
}

// ─────────────────────────── Drop target ────────────────────────────

export interface AutoscrollOptions {
    /** Element to scroll. Defaults to the dragover event's currentTarget. */
    readonly container?: () => HTMLElement | null;
    /** Distance in px from each edge that activates autoscroll. Default 48. */
    readonly edge?: number;
    /** Max scroll speed in px per frame at the very edge. Default 18. */
    readonly speed?: number;
}

export interface UseDropTargetOptions {
    /** MIME channel(s) this target accepts. */
    readonly accept: string | readonly string[];
    /**
     * Optional kind filter — only invoked when `globalDragState.kind`
     * matches one of the listed values. Useful to discriminate between
     * two sources that share the same MIME (e.g. two row collections).
     */
    readonly acceptKind?: string | readonly string[];
    /** Triggered on a valid drop. `payload` is the string read from the MIME. */
    readonly onDrop: (payload: string, event: DragEvent) => void | Promise<void>;
    /** Hover lifecycle hooks for finer visual states. */
    readonly onEnter?: (event: DragEvent) => void;
    readonly onOver?: (event: DragEvent) => void;
    readonly onLeave?: (event: DragEvent) => void;
    /** Target is inert (e.g. read-only view). */
    readonly disabled?: DisabledFlag;
    /** Autoscroll the containing scroller while the user dwells near an edge. */
    readonly autoscroll?: AutoscrollOptions | false;
}

export interface DropTargetHandlers {
    readonly dragenter: (event: DragEvent) => void;
    readonly dragover: (event: DragEvent) => void;
    readonly dragleave: (event: DragEvent) => void;
    readonly drop: (event: DragEvent) => Promise<void> | void;
}

export interface UseDropTargetReturn {
    readonly isOver: Ref<boolean>;
    readonly dropHandlers: DropTargetHandlers;
}

/**
 * Create a drop target. Bind the returned handlers via
 * `v-on="dropHandlers"` on the receiving element.
 */
export function useDropTarget(options: UseDropTargetOptions): UseDropTargetReturn {
    const isOver = ref(false);
    const accepts: readonly string[] = Array.isArray(options.accept)
        ? options.accept
        : [options.accept as string];
    const kindFilter: readonly string[] | null =
        options.acceptKind === undefined
            ? null
            : Array.isArray(options.acceptKind)
                ? options.acceptKind
                : [options.acceptKind as string];

    function canAccept(event: DragEvent): boolean {
        if (isDisabled(options.disabled)) return false;
        if (kindFilter) {
            if (mutableDragState.kind === null || !kindFilter.includes(mutableDragState.kind)) {
                return false;
            }
        }
        const types = event.dataTransfer?.types;
        if (!types) return false;
        for (const mime of accepts) {
            if (types.includes(mime)) return true;
        }
        return false;
    }

    function dragenter(event: DragEvent): void {
        if (!canAccept(event)) return;
        event.preventDefault();
        event.stopPropagation();
        isOver.value = true;
        options.onEnter?.(event);
    }

    function dragover(event: DragEvent): void {
        if (!canAccept(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        isOver.value = true;
        if (options.autoscroll !== false) {
            runAutoscroll(event, options.autoscroll ?? {});
        }
        options.onOver?.(event);
    }

    function dragleave(event: DragEvent): void {
        // Native dragleave fires when crossing into a child too; guard
        // by only clearing when leaving the element rectangle.
        const target = event.currentTarget as HTMLElement | null;
        const related = event.relatedTarget as Node | null;
        if (target && related && target.contains(related)) return;
        isOver.value = false;
        options.onLeave?.(event);
    }

    async function drop(event: DragEvent): Promise<void> {
        if (!canAccept(event)) return;
        event.preventDefault();
        event.stopPropagation();
        isOver.value = false;
        let payload: string | null = null;
        for (const mime of accepts) {
            const v = event.dataTransfer?.getData(mime);
            if (v) {
                payload = v;
                break;
            }
        }
        if (!payload) {
            payload = event.dataTransfer?.getData('text/plain') || mutableDragState.payload;
        }
        if (!payload) return;
        await options.onDrop(payload, event);
    }

    return {
        isOver,
        dropHandlers: { dragenter, dragover, dragleave, drop },
    };
}

// ─────────────────────────── Autoscroll ─────────────────────────────

/**
 * Apply vertical autoscroll based on cursor proximity to the container
 * edges. Triggered from `dragover`; the browser fires that event at
 * least every animation frame while the cursor moves or stays put with
 * the button down, which is enough to drive smooth scrolling without
 * needing an external rAF loop.
 */
function runAutoscroll(event: DragEvent, opts: AutoscrollOptions): void {
    const fallback = (event.currentTarget as HTMLElement | null) ?? null;
    const container = opts.container?.() ?? fallback;
    if (!container) return;
    const edge = opts.edge ?? 48;
    const speed = opts.speed ?? 18;
    const rect = container.getBoundingClientRect();
    const top = event.clientY - rect.top;
    const bottom = rect.bottom - event.clientY;
    if (top < edge && top >= 0) {
        const intensity = (edge - top) / edge;
        container.scrollTop -= Math.max(2, Math.round(speed * intensity));
    } else if (bottom < edge && bottom >= 0) {
        const intensity = (edge - bottom) / edge;
        container.scrollTop += Math.max(2, Math.round(speed * intensity));
    }
}
