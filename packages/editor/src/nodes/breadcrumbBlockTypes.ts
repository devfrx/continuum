/**
 * Persisted attributes for the dynamic breadcrumb block.
 *
 * The block stores presentation preferences only. The current folder path
 * and note title are supplied by the host at render time, so moving a note
 * never leaves stale breadcrumbs in its body.
 */
export const BREADCRUMB_BLOCK_SCHEMA_VERSION = 1;

export interface BreadcrumbBlockAttrs {
  /** Whether the current note title should appear as the final segment. */
  showLeaf: boolean;
  /** Stable schema marker for future attr migrations. */
  schemaVersion: number;
}

export const DEFAULT_BREADCRUMB_BLOCK_ATTRS: BreadcrumbBlockAttrs = {
  showLeaf: true,
  schemaVersion: BREADCRUMB_BLOCK_SCHEMA_VERSION,
};

export function normalizeBreadcrumbBlockAttrs(
  input: Partial<BreadcrumbBlockAttrs> | null | undefined,
): BreadcrumbBlockAttrs {
  return {
    showLeaf: typeof input?.showLeaf === 'boolean'
      ? input.showLeaf
      : DEFAULT_BREADCRUMB_BLOCK_ATTRS.showLeaf,
    schemaVersion: typeof input?.schemaVersion === 'number'
      ? input.schemaVersion
      : BREADCRUMB_BLOCK_SCHEMA_VERSION,
  };
}
