/**
 * Public typings for the host application's icon catalog.
 *
 * The editor never imports the host's icon registry directly (that would
 * couple the package to apps/web). Instead, the host passes a catalog and
 * a renderer down through `ContinuumEditor` props; node views consume both
 * via `provide/inject` keys defined here.
 */
import type { Component, InjectionKey } from 'vue';

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
