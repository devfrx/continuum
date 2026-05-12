/**
 * Cursor-paginated query runner for a Database View.
 *
 * Watches the active {@link DatabaseView} and re-issues
 * `POST /api/kinds/:kindId/query` whenever its identity changes (a new
 * view id, a new kind, or any debounced patch that produces a fresh
 * `updatedAt`). Returns the live page of rows together with the server-
 * computed group buckets and per-column calc-row results so consumers
 * (TableLayout / DatabaseView slots) never have to re-aggregate locally.
 *
 * Pagination is cursor-based; `loadMore()` appends the next page in
 * place. `reloadRow()` refetches a single note's properties so server-
 * computed values (formula / rollup) refresh after an inline edit
 * without invalidating the whole page.
 */
import { ref, watch, type Ref } from 'vue';
import type {
  CalcFnResult,
  DatabaseView,
  NoteWithProperties,
  QueryGroupBucket,
} from '@continuum/shared';
import { api } from '@/api';

export interface UseViewQueryReturn {
  rows: Ref<NoteWithProperties[]>;
  groups: Ref<QueryGroupBucket[] | undefined>;
  /** Per-property-key footer aggregation, in the order the view requested. */
  calc: Ref<Record<string, CalcFnResult>>;
  total: Ref<number>;
  loading: Ref<boolean>;
  hasMore: Ref<boolean>;
  /** Reset and fetch the first page. */
  reload: () => Promise<void>;
  /** Fetch the next page (cursor-based), appending in place. */
  loadMore: () => Promise<void>;
  /** Refetch a single row (after an inline edit). */
  reloadRow: (noteId: string) => Promise<void>;
}

/** Default page size — kept aligned with `QUERY_PAGE_SIZE_DEFAULT`. */
const PAGE_SIZE = 50;

/**
 * @param viewRef Reactive {@link DatabaseView}; the query is keyed off
 *   `view.id` and `view.updatedAt` so pending toolbar/header patches
 *   (which mutate the view locally before the debounced PATCH) trigger
 *   a fresh page load.
 */
export function useViewQuery(viewRef: Ref<DatabaseView | null>): UseViewQueryReturn {
  const rows = ref<NoteWithProperties[]>([]);
  const groups = ref<QueryGroupBucket[] | undefined>(undefined);
  const calc = ref<Record<string, CalcFnResult>>({});
  const total = ref(0);
  const loading = ref(false);
  const hasMore = ref(false);
  const cursor = ref<string | null>(null);

  /** Issue a query against the current view; replaces local state on success. */
  async function reload(): Promise<void> {
    const view = viewRef.value;
    if (!view) {
      rows.value = [];
      groups.value = undefined;
      calc.value = {};
      total.value = 0;
      hasMore.value = false;
      cursor.value = null;
      return;
    }
    loading.value = true;
    try {
      const res = await api.views.query(view.kindId, {
        view,
        cursor: null,
        pageSize: PAGE_SIZE,
      });
      rows.value = res.rows;
      groups.value = res.groups;
      calc.value = res.calc ?? {};
      total.value = res.total;
      cursor.value = res.nextCursor;
      hasMore.value = res.nextCursor !== null;
    } catch (err) {
      console.warn('[useViewQuery] reload failed', err);
      rows.value = [];
      groups.value = undefined;
      calc.value = {};
      total.value = 0;
      hasMore.value = false;
      cursor.value = null;
    } finally {
      loading.value = false;
    }
  }

  /** Append the next page without disturbing already-rendered rows. */
  async function loadMore(): Promise<void> {
    const view = viewRef.value;
    if (!view || loading.value || !hasMore.value || cursor.value === null) return;
    loading.value = true;
    try {
      const res = await api.views.query(view.kindId, {
        view,
        cursor: cursor.value,
        pageSize: PAGE_SIZE,
      });
      rows.value = [...rows.value, ...res.rows];
      cursor.value = res.nextCursor;
      hasMore.value = res.nextCursor !== null;
      // Calc/total/groups are page-independent; refresh from latest response.
      calc.value = res.calc ?? {};
      total.value = res.total;
      groups.value = res.groups;
    } catch (err) {
      console.warn('[useViewQuery] loadMore failed', err);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Refetch a single note's properties and splice it into `rows` in place.
   * Uses the dedicated note + properties endpoints so a single inline edit
   * never re-runs the full paginated query.
   */
  async function reloadRow(noteId: string): Promise<void> {
    const idx = rows.value.findIndex((r) => r.note.id === noteId);
    if (idx < 0) return;
    try {
      const [note, properties] = await Promise.all([
        api.notes.get(noteId),
        api.properties.listForNote(noteId),
      ]);
      const next = [...rows.value];
      next[idx] = { note, properties };
      rows.value = next;
    } catch (err) {
      console.warn('[useViewQuery] reloadRow failed', err);
    }
  }

  // Reload whenever the view identity or its mutated config changes.
  watch(
    () => {
      const v = viewRef.value;
      return v ? `${v.id}:${v.updatedAt}` : null;
    },
    () => {
      void reload();
    },
    { immediate: true },
  );

  return { rows, groups, calc, total, loading, hasMore, reload, loadMore, reloadRow };
}
