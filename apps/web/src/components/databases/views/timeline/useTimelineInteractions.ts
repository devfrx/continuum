/**
 * useTimelineInteractions — pointer-driven state machine that powers
 * dragging existing bars, resizing them from either edge and dropping
 * unscheduled rows onto the axis.
 *
 * The composable is intentionally view-agnostic: it owns no DOM, no
 * grid math and no persistence. Callers feed in:
 *  – geometry helpers (`daysFromPx`, `dayAtClientX`)
 *  – a `commit` callback that writes the final day range
 *  – a `cancel` callback for cleanup when the drop falls outside the axis
 *
 * The returned `state` ref drives the visual ghost / preview rendering
 * in `TimelineView.vue`. While a gesture is in progress every
 * `pointermove` updates the ref synchronously, so the bar previews
 * track the cursor at the browser's native refresh rate without the
 * dataflow ping-ponging through Vue reactivity for each pixel.
 */
import { onBeforeUnmount, ref, type Ref } from 'vue';
import type { DatabaseRowSnapshot } from '@continuum/shared';

export type TimelineGestureMode =
    | 'move'
    | 'resize-left'
    | 'resize-right'
    | 'drop-new';

export interface TimelineGestureBase {
    rowId: string;
    /** Inclusive 1-based day where the gesture's preview currently starts. */
    previewStartDay: number;
    /** Inclusive 1-based day where the gesture's preview currently ends. */
    previewEndDay: number;
}

export interface TimelineGesture extends TimelineGestureBase {
    mode: TimelineGestureMode;
    row: DatabaseRowSnapshot;
}

interface InternalGesture extends TimelineGesture {
    pointerId: number;
    /** Cached values captured at gesture start. */
    initialStartDay: number;
    initialEndDay: number;
    initialClientX: number;
}

export interface CommitPayload {
    row: DatabaseRowSnapshot;
    mode: TimelineGestureMode;
    /** Final inclusive 1-based start day after snapping. */
    startDay: number;
    /** Final inclusive 1-based end day after snapping. */
    endDay: number;
    /** `true` when the gesture ended outside the axis (drop-new only). */
    outsideAxis: boolean;
}

export interface TimelineInteractionsOptions {
    /** Convert a horizontal pixel delta into a snapped day delta. */
    daysFromPx: (px: number) => number;
    /** Resolve the 1-based day at a client point (or `null` when outside). */
    dayAtClientPoint: (clientX: number, clientY: number) => number | null;
    /** Current number of days in the visible month. */
    daysInMonth: () => number;
    /** Called when the gesture ends and a write should be attempted. */
    onCommit: (payload: CommitPayload) => void;
}

export interface TimelineInteractions {
    /** Live gesture state (or `null` when idle). Use for ghost rendering. */
    gesture: Ref<TimelineGesture | null>;
    /** Start moving an existing bar's body. */
    beginMove: (event: PointerEvent, row: DatabaseRowSnapshot, startDay: number, endDay: number) => void;
    /** Start resizing an existing bar from one of its edges. */
    beginResize: (
        event: PointerEvent,
        row: DatabaseRowSnapshot,
        startDay: number,
        endDay: number,
        side: 'left' | 'right',
    ) => void;
    /** Start dropping an unscheduled row onto the axis. */
    beginDropFromTray: (event: PointerEvent, row: DatabaseRowSnapshot) => void;
    /** Force-cancel any active gesture (e.g. Escape). */
    cancel: () => void;
}

export function useTimelineInteractions(
    options: TimelineInteractionsOptions,
): TimelineInteractions {
    const gesture = ref<TimelineGesture | null>(null);
    let active: InternalGesture | null = null;

    function clampDay(day: number): number {
        const max = Math.max(1, options.daysInMonth());
        return Math.min(max, Math.max(1, day));
    }

    function onPointerMove(event: PointerEvent): void {
        if (!active || event.pointerId !== active.pointerId) return;
        const deltaPx = event.clientX - active.initialClientX;
        const deltaDays = options.daysFromPx(deltaPx);
        let nextStart = active.previewStartDay;
        let nextEnd = active.previewEndDay;
        if (active.mode === 'move') {
            nextStart = clampDay(active.initialStartDay + deltaDays);
            const duration = active.initialEndDay - active.initialStartDay;
            nextEnd = clampDay(nextStart + duration);
            if (nextEnd - nextStart !== duration) {
                // Clamp pushed the bar against an edge — re-derive start so
                // the duration is preserved.
                nextStart = clampDay(nextEnd - duration);
            }
        } else if (active.mode === 'resize-left') {
            nextStart = clampDay(Math.min(active.initialEndDay, active.initialStartDay + deltaDays));
            nextEnd = active.initialEndDay;
        } else if (active.mode === 'resize-right') {
            nextStart = active.initialStartDay;
            nextEnd = clampDay(Math.max(active.initialStartDay, active.initialEndDay + deltaDays));
        } else if (active.mode === 'drop-new') {
            const day = options.dayAtClientPoint(event.clientX, event.clientY);
            if (day === null) {
                // Hide the preview while the cursor is outside the axis.
                active.previewStartDay = 0;
                active.previewEndDay = 0;
                gesture.value = { ...(active as TimelineGesture) };
                return;
            }
            nextStart = day;
            nextEnd = day;
        }
        active.previewStartDay = nextStart;
        active.previewEndDay = nextEnd;
        gesture.value = { ...(active as TimelineGesture) };
    }

    function teardown(): void {
        window.removeEventListener('pointermove', onPointerMove, true);
        window.removeEventListener('pointerup', onPointerUp, true);
        window.removeEventListener('pointercancel', onPointerCancel, true);
        active = null;
        gesture.value = null;
    }

    function onPointerUp(event: PointerEvent): void {
        if (!active || event.pointerId !== active.pointerId) return;
        const finished = active;
        const outsideAxis = options.dayAtClientPoint(event.clientX, event.clientY) === null;
        teardown();
        if (finished.mode === 'drop-new' && outsideAxis) {
            options.onCommit({
                row: finished.row,
                mode: finished.mode,
                startDay: finished.previewStartDay,
                endDay: finished.previewEndDay,
                outsideAxis: true,
            });
            return;
        }
        if (finished.previewStartDay < 1 || finished.previewEndDay < 1) {
            return; // drop landed outside the axis on a drop-new preview
        }
        if (
            finished.mode !== 'drop-new'
            && finished.previewStartDay === finished.initialStartDay
            && finished.previewEndDay === finished.initialEndDay
        ) {
            return; // no-op gesture, skip the round-trip
        }
        options.onCommit({
            row: finished.row,
            mode: finished.mode,
            startDay: finished.previewStartDay,
            endDay: finished.previewEndDay,
            outsideAxis: false,
        });
    }

    function onPointerCancel(event: PointerEvent): void {
        if (!active || event.pointerId !== active.pointerId) return;
        teardown();
    }

    function start(internal: InternalGesture): void {
        active = internal;
        gesture.value = { ...(internal as TimelineGesture) };
        window.addEventListener('pointermove', onPointerMove, true);
        window.addEventListener('pointerup', onPointerUp, true);
        window.addEventListener('pointercancel', onPointerCancel, true);
    }

    function beginMove(
        event: PointerEvent,
        row: DatabaseRowSnapshot,
        startDay: number,
        endDay: number,
    ): void {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        start({
            mode: 'move',
            row,
            rowId: row.rowId,
            pointerId: event.pointerId,
            initialClientX: event.clientX,
            initialStartDay: startDay,
            initialEndDay: endDay,
            previewStartDay: startDay,
            previewEndDay: endDay,
        });
    }

    function beginResize(
        event: PointerEvent,
        row: DatabaseRowSnapshot,
        startDay: number,
        endDay: number,
        side: 'left' | 'right',
    ): void {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        start({
            mode: side === 'left' ? 'resize-left' : 'resize-right',
            row,
            rowId: row.rowId,
            pointerId: event.pointerId,
            initialClientX: event.clientX,
            initialStartDay: startDay,
            initialEndDay: endDay,
            previewStartDay: startDay,
            previewEndDay: endDay,
        });
    }

    function beginDropFromTray(event: PointerEvent, row: DatabaseRowSnapshot): void {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        start({
            mode: 'drop-new',
            row,
            rowId: row.rowId,
            pointerId: event.pointerId,
            initialClientX: event.clientX,
            initialStartDay: 0,
            initialEndDay: 0,
            previewStartDay: 0,
            previewEndDay: 0,
        });
    }

    function cancel(): void {
        if (active) teardown();
    }

    onBeforeUnmount(() => {
        if (active) teardown();
    });

    return { gesture, beginMove, beginResize, beginDropFromTray, cancel };
}
