/**
 * Public typings for the host application's icon catalog.
 *
 * The editor never imports the host's icon registry directly (that would
 * couple the package to apps/web). Instead, the host passes a catalog and
 * a renderer down through `ContinuumEditor` props; node views consume both
 * via `provide/inject` keys defined here.
 */
import type { Component, ComputedRef, InjectionKey } from 'vue';

export interface IconCatalogEntry {
  /** Stable identifier used as `name:<id>` in the Callout `icon` attribute. */
  id: string;
  /** Human-readable label shown in pickers and tooltips. */
  label: string;
  /** Optional grouping label to organise the picker (e.g. "Symbols"). */
  group?: string;
}

export const ICON_CATALOG_KEY: InjectionKey<IconCatalogEntry[]> = Symbol('continuum.iconCatalog');
export const ICON_COMPONENT_KEY: InjectionKey<Component> = Symbol('continuum.iconComponent');
export const SELECT_COMPONENT_KEY: InjectionKey<Component> = Symbol('continuum.selectComponent');

/**
 * Injection key for the host-supplied Notion-like Database renderer.
 *
 * The editor package owns the `database` Tiptap node + its NodeView
 * wrapper, but the actual table/list/board rendering and API calls live
 * in the host application (so the editor stays free of `apps/web`
 * dependencies). The host passes a single component through
 * `ContinuumEditor`'s `database-component` prop; the wrapper resolves it
 * via this key and forwards `attrs`, `updateAttributes` and `editable`.
 */
export const DATABASE_COMPONENT_KEY: InjectionKey<Component> = Symbol(
  'continuum.databaseComponent',
);

export interface EditorNoteContext {
  noteId: string | null;
  title: string;
  folderId: string | null;
  onSelectFolder?: (folderId: string | null) => void;
}

/** Host component used to render the dynamic breadcrumb block. */
export const BREADCRUMB_COMPONENT_KEY: InjectionKey<Component> = Symbol(
  'continuum.breadcrumbComponent',
);

/** Host component used to render video/audio/file blocks. */
export const MEDIA_COMPONENT_KEY: InjectionKey<Component> = Symbol(
  'continuum.mediaComponent',
);

/** Reactive note context consumed by host-aware node views. */
export const EDITOR_NOTE_CONTEXT_KEY: InjectionKey<ComputedRef<EditorNoteContext | null>> = Symbol(
  'continuum.editorNoteContext',
);
