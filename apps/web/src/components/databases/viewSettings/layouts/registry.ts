/**
 * viewSettings/layouts/registry.ts — per-view-type settings catalogue.
 *
 * Mirrors `views/registry.ts` (the renderer catalogue) so the settings
 * panel knows which component to instantiate for the current view
 * type. Every `DatabaseViewType` has exactly one entry: ready types
 * point to their dedicated settings component; planned types fall back
 * to `PlannedLayoutSettings`, which still persists the shared display
 * knobs so the values are ready for the real renderer ships.
 */
import type { Component } from 'vue';
import type { DatabaseViewType } from '@continuum/shared';
import TableLayoutSettings from './TableLayoutSettings.vue';
import BoardLayoutSettings from './BoardLayoutSettings.vue';
import GalleryLayoutSettings from './GalleryLayoutSettings.vue';
import CalendarLayoutSettings from './CalendarLayoutSettings.vue';
import ListLayoutSettings from './ListLayoutSettings.vue';
import PlannedLayoutSettings from './PlannedLayoutSettings.vue';

export const layoutSettingsRegistry: Record<DatabaseViewType, Component> = {
    table: TableLayoutSettings,
    board: BoardLayoutSettings,
    gallery: GalleryLayoutSettings,
    list: ListLayoutSettings,
    calendar: CalendarLayoutSettings,
    timeline: PlannedLayoutSettings,
    chart: PlannedLayoutSettings,
    dashboard: PlannedLayoutSettings,
    feed: PlannedLayoutSettings,
    map: PlannedLayoutSettings,
    form: PlannedLayoutSettings,
};

export function layoutSettingsFor(type: DatabaseViewType): Component {
    return layoutSettingsRegistry[type] ?? PlannedLayoutSettings;
}
