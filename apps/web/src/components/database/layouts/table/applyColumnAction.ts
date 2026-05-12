/**
 * `applyColumnAction` — translate a `ColumnActionPayload` from the
 * header cell into the appropriate `ColumnConfig[]` mutation (via
 * {@link tableColumnOps}) or sort-rule update, and push the result
 * through the view's `patch()` callback.
 *
 * Extracted from `TableLayout.vue` to keep the orchestrator within the
 * per-file line budget; the helper has no Vue runtime dependency and
 * can be unit-tested directly.
 */
import type { ColumnConfig, DatabaseView, SortRule } from '@continuum/shared';
import type { ColumnActionPayload } from './TableHeaderCell.vue';
import {
  freezeUpTo,
  reorderColumns,
  replaceColumn,
  setColumnVisibility,
  toggleColumnWrap,
  unfreezeFrom,
} from './tableColumnOps';

/** Build the next `sort` array with `propertyKey` prepended at given direction. */
function prependSortRule(
  rules: readonly SortRule[],
  propertyKey: string,
  direction: 'asc' | 'desc',
): SortRule[] {
  const next: SortRule[] = [{ propertyKey, direction }];
  for (const r of rules) if (r.propertyKey !== propertyKey) next.push(r);
  return next;
}

/**
 * Dispatch one column action to the right mutator and persist via
 * `patch`. Returns the awaited promise so callers can chain on save.
 */
export async function applyColumnAction(
  view: DatabaseView,
  materialized: readonly ColumnConfig[],
  payload: ColumnActionPayload,
  patch: (delta: Partial<DatabaseView>) => Promise<void>,
): Promise<void> {
  switch (payload.action) {
    case 'resize':
      return patch({
        columns: replaceColumn(materialized, payload.propertyKey, { width: payload.width }),
      });
    case 'hide':
      return patch({ columns: setColumnVisibility(materialized, payload.propertyKey, false) });
    case 'toggle-wrap':
      return patch({ columns: toggleColumnWrap(materialized, payload.propertyKey) });
    case 'freeze-up-to':
      return patch({ columns: freezeUpTo(materialized, payload.propertyKey) });
    case 'unfreeze':
      return patch({ columns: unfreezeFrom(materialized, payload.propertyKey) });
    case 'reorder':
      return patch({
        columns: reorderColumns(
          materialized,
          payload.sourceKey,
          payload.propertyKey,
          payload.position,
        ),
      });
    case 'sort-asc':
    case 'sort-desc': {
      const direction = payload.action === 'sort-asc' ? 'asc' : 'desc';
      return patch({ sort: prependSortRule(view.sort, payload.propertyKey, direction) });
    }
    case 'delete':
      // Property deletion is owned by the property panel; ignore here.
      return;
  }
}
