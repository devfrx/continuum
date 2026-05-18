/**
 * viewSettings/layouts/registry.ts — per-view-type settings catalogue.
 *
 * Mirrors `views/registry.ts` (the renderer catalogue) so the settings
 * panel knows which component to instantiate for the current view
 * type. Every `DatabaseViewType` has exactly one entry: ready types
 * point to their dedicated settings component; planned types fall back
 * to `PlannedLayoutSettings`, which intentionally exposes no controls
 * until a renderer can consume them.
 */
import type { Component } from 'vue';
import type { DatabaseViewType } from '@continuum/shared';
import TableLayoutSettings from './TableLayoutSettings.vue';
import BoardLayoutSettings from './BoardLayoutSettings.vue';
import GalleryLayoutSettings from './GalleryLayoutSettings.vue';
import CalendarLayoutSettings from './CalendarLayoutSettings.vue';
import ListLayoutSettings from './ListLayoutSettings.vue';
import TimelineLayoutSettings from './TimelineLayoutSettings.vue';
import FeedLayoutSettings from './FeedLayoutSettings.vue';
import ChartLayoutSettings from './ChartLayoutSettings.vue';
import PlannedLayoutSettings from './PlannedLayoutSettings.vue';

export const layoutSettingsRegistry: Record<DatabaseViewType, Component> = {
    table: TableLayoutSettings,
    board: BoardLayoutSettings,
    gallery: GalleryLayoutSettings,
    list: ListLayoutSettings,
    calendar: CalendarLayoutSettings,
    timeline: TimelineLayoutSettings,
    chart: ChartLayoutSettings,
    dashboard: PlannedLayoutSettings,
    feed: FeedLayoutSettings,
    map: PlannedLayoutSettings,
    form: PlannedLayoutSettings,
};

export function layoutSettingsFor(type: DatabaseViewType): Component {
    return layoutSettingsRegistry[type] ?? PlannedLayoutSettings;
}
