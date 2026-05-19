/**
 * useTimelineGeometry — tracks the timeline axis container width and
 * exposes the pixel/day conversions used by the interactive bars.
 *
 * The axis lives in a horizontally scrollable container with a fixed
 * minimum width (so narrow databases still get a readable monthly
 * Gantt). The composable observes the *axis element itself* with a
 * `ResizeObserver` and recomputes the per-day pixel width whenever the
 * layout changes (window resize, sidebar toggle, font swap…).
 */
import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';

export interface TimelineGeometry {
    /** Live width of the axis element in CSS pixels. */
    axisWidthPx: Ref<number>;
    /** Width of a single day cell in CSS pixels. */
    pxPerDay: Ref<number>;
    /** Convert a horizontal delta (px) to a snapped integer day delta. */
    daysFromPx: (px: number) => number;
    /**
    * Resolve the 1-based day number at a given page coordinate.
    * Returns `null` when the point is outside the axis bounds.
     */
    dayAtClientPoint: (clientX: number, clientY: number) => number | null;
}

export function useTimelineGeometry(
    axisEl: Ref<HTMLElement | null>,
    daysInMonth: Ref<number>,
): TimelineGeometry {
    const axisWidthPx = ref(0);
    let observer: ResizeObserver | null = null;

    function attach(el: HTMLElement | null): void {
        observer?.disconnect();
        observer = null;
        if (!el) return;
        axisWidthPx.value = el.getBoundingClientRect().width;
        observer = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (entry) axisWidthPx.value = entry.contentRect.width;
        });
        observer.observe(el);
    }

    watch(axisEl, (el) => attach(el), { immediate: true });

    onBeforeUnmount(() => {
        observer?.disconnect();
        observer = null;
    });

    const pxPerDay = computed(() => {
        const days = Math.max(1, daysInMonth.value);
        return axisWidthPx.value / days;
    });

    function daysFromPx(px: number): number {
        const w = pxPerDay.value;
        if (w <= 0) return 0;
        return Math.round(px / w);
    }

    function dayAtClientPoint(clientX: number, clientY: number): number | null {
        const el = axisEl.value;
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        if (clientX < rect.left || clientX > rect.right) return null;
        if (clientY < rect.top || clientY > rect.bottom) return null;
        const w = pxPerDay.value;
        if (w <= 0) return null;
        const day = Math.floor((clientX - rect.left) / w) + 1;
        return Math.min(daysInMonth.value, Math.max(1, day));
    }

    return { axisWidthPx, pxPerDay, daysFromPx, dayAtClientPoint };
}
