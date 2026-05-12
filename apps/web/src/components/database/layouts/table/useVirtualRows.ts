/**
 * Minimal uniform-height virtualization for the database table.
 *
 * Tracks scroll position + viewport height for a scroll container and
 * derives the slice of rows that need to be rendered, plus top/bottom
 * spacer heights so the scrollbar reflects the full row count. Also
 * wires an `IntersectionObserver` sentinel that calls `loadMore` when
 * the user nears the bottom of the list.
 *
 * Intentionally tiny — no library, no per-row measurement. Sufficient
 * for v1 (uniform row heights driven by `view.layout.rowHeight`).
 */
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

const VIEWPORT_BUFFER = 8;

export interface UseVirtualRowsParams {
  totalRef: Ref<number>;
  rowHeightRef: Ref<number>;
  hasMoreRef: Ref<boolean>;
  loadingRef: Ref<boolean>;
  loadMore: () => Promise<void>;
}

export interface VirtualWindow {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
}

export interface UseVirtualRowsReturn {
  scroller: Ref<HTMLDivElement | null>;
  sentinel: Ref<HTMLDivElement | null>;
  window: Ref<VirtualWindow>;
  onScroll: () => void;
}

export function useVirtualRows(params: UseVirtualRowsParams): UseVirtualRowsReturn {
  const scroller = ref<HTMLDivElement | null>(null);
  const sentinel = ref<HTMLDivElement | null>(null);
  const scrollTop = ref(0);
  const viewportHeight = ref(0);

  const window = computed<VirtualWindow>(() => {
    const total = params.totalRef.value;
    if (total === 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 };
    const h = params.rowHeightRef.value;
    const visible = Math.ceil(viewportHeight.value / h) + VIEWPORT_BUFFER * 2;
    const firstVisible = Math.floor(scrollTop.value / h);
    const start = Math.max(0, firstVisible - VIEWPORT_BUFFER);
    const end = Math.min(total, start + visible);
    return {
      start,
      end,
      padTop: start * h,
      padBottom: Math.max(0, (total - end) * h),
    };
  });

  function onScroll(): void {
    if (!scroller.value) return;
    scrollTop.value = scroller.value.scrollTop;
  }

  function measure(): void {
    if (!scroller.value) return;
    viewportHeight.value = scroller.value.clientHeight;
  }

  let observer: IntersectionObserver | null = null;
  function attachObserver(): void {
    if (!sentinel.value) return;
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && params.hasMoreRef.value && !params.loadingRef.value) {
            void params.loadMore();
          }
        }
      },
      { root: scroller.value ?? null, rootMargin: '200px' },
    );
    observer.observe(sentinel.value);
  }

  onMounted(() => {
    measure();
    attachObserver();
    globalThis.addEventListener('resize', measure);
  });
  onBeforeUnmount(() => {
    observer?.disconnect();
    globalThis.removeEventListener('resize', measure);
  });
  watch(sentinel, attachObserver);

  return { scroller, sentinel, window, onScroll };
}
