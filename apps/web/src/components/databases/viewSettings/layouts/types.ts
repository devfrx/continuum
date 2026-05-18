/**
 * viewSettings/layouts/types.ts — shared contract for per-layout settings panels.
 *
 * Mirrors the design of `views/types.ts` (the renderer registry) so the
 * settings catalogue stays in lockstep with the renderer catalogue:
 * every `DatabaseViewType` that ships a renderer also ships a settings
 * component, registered in `./registry.ts` and rendered by
 * `viewSettings/LayoutPanel.vue`.
 *
 * Each layout-settings component receives the active view + schema and
 * emits *partial* layout patches. The popover lifts that patch up to
 * `DatabaseToolbar → DatabaseBody → useDatabaseBundle.patchView` so it
 * lands in `config.layout` alongside any prior knobs.
 */
import type { DatabaseView, PropertyDefinition } from '@continuum/shared';

/** Props every per-layout settings component receives. */
export interface LayoutSettingsProps {
  /** The view being edited. Source of truth for current layout knobs. */
  readonly view: DatabaseView;
  /** Schema of the database the view resolves against (effective DB). */
  readonly schema: readonly PropertyDefinition[];
}

/** Emits every per-layout settings component is allowed to raise. */
export interface LayoutSettingsEmits {
  /**
   * Partial patch merged into `config.layout` server-side. Only include
   * the keys that actually changed so unrelated knobs are preserved.
   */
  (event: 'patch-layout', patch: Record<string, unknown>): void;
}

/** Canonical "Open pages in" mode shared across layouts. */
export type OpenInMode = 'sidePeek' | 'centerPeek' | 'fullPage';

/**
 * Common display knobs shared by most layouts (toggles + open-in mode).
 * Stored under `config.layout` with these exact keys so any renderer
 * can opt in without coordinating a separate persistence contract.
 */
export interface CommonDisplayLayout {
  /** Show the row's note icon next to the title. Default `true`. */
  showPageIcon?: boolean;
  /**
   * Show the source database title on each row — only meaningful when
   * the view has a `dataSourceDatabaseId` override. Default `false`.
   */
  showDataSourceTitles?: boolean;
  /** Wrap long content across multiple lines. Default `false`. */
  wrapContent?: boolean;
  /** How clicking a row opens the note. Default `'sidePeek'`. */
  openIn?: OpenInMode;
}

/** Pull a typed common-display value out of an open layout record. */
export function readCommonDisplay(
  layout: Record<string, unknown> | null | undefined,
): Required<CommonDisplayLayout> {
  const src = (layout ?? {}) as CommonDisplayLayout;
  return {
    showPageIcon: src.showPageIcon ?? true,
    showDataSourceTitles: src.showDataSourceTitles ?? false,
    wrapContent: src.wrapContent ?? false,
    openIn: src.openIn ?? 'sidePeek',
  };
}
