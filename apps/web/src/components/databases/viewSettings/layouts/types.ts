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
 * `DatabaseToolbar → DatabaseBody → useBlockViews.patchView` so it
 * lands in `config.layout` alongside any prior knobs.
 */
import type { DatabaseView, PropertyDefinition } from '@continuum/shared';
export {
  readCommonDisplay,
  readCardDisplay,
  type CommonDisplayLayout,
  type OpenInMode,
  type ResolvedCommonDisplayLayout,
  type CardDisplayLayout,
  type CardPreviewMode,
  type CardSize,
  type CardLayout,
  type ResolvedCardDisplayLayout,
} from '../../layout';

/** Props every per-layout settings component receives. */
export interface LayoutSettingsProps {
  /** The view being edited. Source of truth for current layout knobs. */
  readonly view: DatabaseView;
  /** Schema of the datasource the view resolves against. */
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
