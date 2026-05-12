/**
 * Materialise the effective ordered list of columns for a table layout.
 *
 * The on-disk `view.columns` is *sparse*: when a kind is brand-new it is
 * empty and the UI is expected to "show every property in the kind's
 * `position` order". Once the user starts hiding/reordering/resizing
 * columns, the array becomes the source of truth and any property
 * definition without an entry in it is treated as hidden.
 *
 * This composable joins both sides into a single deterministic list of
 * `{ definition, column }` pairs that the table layout can render
 * without further branching.
 *
 * It is read-only: persistence of column edits belongs to M5/M8.
 */
import { computed, watch, type ComputedRef, type Ref } from 'vue';
import type { ColumnConfig, DatabaseView, PropertyDefinition } from '@continuum/shared';
import { useProperties } from '@/composables/useProperties';

/** Default per-column rendering hints when a `ColumnConfig` is synthesized. */
const DEFAULT_WIDTH = 180;

/**
 * Sentinel `propertyKey` used by table-internal code to refer to the
 * frozen title column (rendered by `TableTitleCell`, not by a
 * `ColumnConfig`). It is intentionally illegal as a real property key
 * (a real key never starts with `__`), so existence checks like
 * `key === TITLE_PROPERTY_KEY` are unambiguous.
 *
 * The title column is NOT reorderable and never appears in
 * `view.columns`; this constant only exists so reorder / freeze code
 * can exclude it explicitly when needed.
 */
export const TITLE_PROPERTY_KEY = '__title' as const;

/** A property definition paired with the resolved column config used by the row grid. */
export interface ResolvedColumn {
  definition: PropertyDefinition;
  column: ColumnConfig;
}

export interface UseTableColumnsReturn {
  /** Visible columns, in left-to-right render order. */
  columns: ComputedRef<ResolvedColumn[]>;
  /**
   * The full `ColumnConfig[]` (visible + hidden) ordered by `position`,
   * one per known property definition. This is the canonical array to
   * feed into `tableColumnOps` mutators before persisting via `patch()`.
   */
  materialized: ComputedRef<ColumnConfig[]>;
}

/**
 * @param viewRef Reactive view; columns reactively recompute when its
 *   `columns` array changes.
 * @param kindIdRef Reactive kind id; property defs are loaded for this kind.
 */
export function useTableColumns(
  viewRef: Ref<DatabaseView | null>,
  kindIdRef: Ref<string>,
): UseTableColumnsReturn {
  const properties = useProperties();

  watch(
    kindIdRef,
    (kindId) => {
      if (kindId) void properties.load(kindId);
    },
    { immediate: true },
  );

  const columns = computed<ResolvedColumn[]>(() => {
    const kindId = kindIdRef.value;
    if (!kindId) return [];
    const defs = properties.forKind(kindId);
    if (defs.length === 0) return [];

    const sortedDefs = [...defs].sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
    );

    const view = viewRef.value;
    const stored = view?.columns ?? [];

    if (stored.length === 0) {
      // No saved column config — show every property in definition order.
      return sortedDefs.map((definition) => ({
        definition,
        column: synthesize(definition),
      }));
    }

    const defByKey = new Map(sortedDefs.map((d) => [d.key, d] as const));
    const out: ResolvedColumn[] = [];
    for (const column of stored) {
      if (!column.visible) continue;
      const definition = defByKey.get(column.propertyKey);
      if (!definition) continue;
      out.push({ definition, column });
    }
    return out;
  });

  /**
   * Build the full materialised column array (one entry per known
   * property def, including hidden ones). Order: stored `position` for
   * known columns, then unknown property defs appended in their own
   * `position` order so newly-added properties still surface.
   */
  const materialized = computed<ColumnConfig[]>(() => {
    const kindId = kindIdRef.value;
    if (!kindId) return [];
    const defs = properties.forKind(kindId);
    if (defs.length === 0) return [];

    const sortedDefs = [...defs].sort((a, b) =>
      a.position < b.position ? -1 : a.position > b.position ? 1 : 0,
    );
    const stored = viewRef.value?.columns ?? [];
    const storedByKey = new Map(stored.map((c) => [c.propertyKey, c] as const));

    const orderedKnown = [...stored]
      .filter((c) => storedByKey.has(c.propertyKey))
      .sort((a, b) => a.position.localeCompare(b.position));

    const out: ColumnConfig[] = [];
    const seen = new Set<string>();
    for (const c of orderedKnown) {
      const def = sortedDefs.find((d) => d.key === c.propertyKey);
      if (!def) continue;
      out.push({ ...c });
      seen.add(c.propertyKey);
    }
    for (const def of sortedDefs) {
      if (seen.has(def.key)) continue;
      out.push(synthesize(def));
    }
    return out;
  });

  return { columns, materialized };
}

/** Build a default `ColumnConfig` for a property definition (when none is saved). */
function synthesize(definition: PropertyDefinition): ColumnConfig {
  return {
    propertyKey: definition.key,
    visible: true,
    width: DEFAULT_WIDTH,
    position: definition.position,
    frozen: false,
    wrap: false,
  };
}
