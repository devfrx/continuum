/**
 * views/registry.ts — central catalogue of database view renderers.
 *
 * Every `DatabaseViewType` has exactly one entry here. Entries marked
 * `status: 'ready'` ship with a dedicated renderer; `status: 'planned'`
 * entries fall back to `PlaceholderView` so the type is still pickable
 * from the toolbar and add-view modal — the placeholder advertises
 * itself as "coming soon" and shows the configured icon / label /
 * description from this registry. Promoting a placeholder to a real
 * renderer is therefore a one-file change: replace `PlaceholderView`
 * with the new component and flip `status` to `'ready'`.
 *
 * `VIEW_REGISTRY_LIST` preserves the canonical picker order declared by
 * `DATABASE_VIEW_TYPES` in `@continuum/shared`.
 */
import {
    DATABASE_VIEW_TYPES,
    type DatabaseViewType,
} from '@continuum/shared';
import DatabaseTableView from '../DatabaseTableView.vue';
import DatabaseListView from '../DatabaseListView.vue';
import BoardView from './BoardView.vue';
import GalleryView from './GalleryView.vue';
import CalendarView from './CalendarView.vue';
import PlaceholderView from './PlaceholderView.vue';
import type { DatabaseViewRegistryEntry } from './types';

export const viewRegistry: Record<DatabaseViewType, DatabaseViewRegistryEntry> = {
    table: {
        type: 'table',
        label: 'Table',
        description: 'Rows and columns with inline editing.',
        icon: 'view-table',
        status: 'ready',
        component: DatabaseTableView,
    },
    board: {
        type: 'board',
        label: 'Board',
        description: 'Kanban grouped by a select or status property.',
        icon: 'view-board',
        status: 'ready',
        component: BoardView,
    },
    gallery: {
        type: 'gallery',
        label: 'Gallery',
        description: 'Card grid with optional cover image.',
        icon: 'view-gallery',
        status: 'ready',
        component: GalleryView,
    },
    list: {
        type: 'list',
        label: 'List',
        description: 'Compact one-line rows for fast scanning.',
        icon: 'view-list',
        status: 'ready',
        component: DatabaseListView,
    },
    calendar: {
        type: 'calendar',
        label: 'Calendar',
        description: 'Month grid scheduled by a date property.',
        icon: 'view-calendar',
        status: 'ready',
        component: CalendarView,
    },
    timeline: {
        type: 'timeline',
        label: 'Timeline',
        description: 'Horizontal bars spanning a date range.',
        icon: 'view-timeline',
        status: 'planned',
        component: PlaceholderView,
    },
    chart: {
        type: 'chart',
        label: 'Chart',
        description: 'Aggregate numbers into bars, lines or pies.',
        icon: 'view-chart',
        status: 'planned',
        component: PlaceholderView,
    },
    dashboard: {
        type: 'dashboard',
        label: 'Dashboard',
        description: 'Composed panels of metrics and other views.',
        icon: 'view-dashboard',
        status: 'planned',
        component: PlaceholderView,
    },
    feed: {
        type: 'feed',
        label: 'Feed',
        description: 'Reverse-chronological stream of entries.',
        icon: 'view-feed',
        status: 'planned',
        component: PlaceholderView,
    },
    map: {
        type: 'map',
        label: 'Map',
        description: 'Plot rows on a geographic map.',
        icon: 'view-map',
        status: 'planned',
        component: PlaceholderView,
    },
    form: {
        type: 'form',
        label: 'Form',
        description: 'Public-facing form that appends a new row on submit.',
        icon: 'view-form',
        status: 'planned',
        component: PlaceholderView,
    },
};

/** Picker order — kept in lockstep with `DATABASE_VIEW_TYPES`. */
export const VIEW_REGISTRY_LIST: readonly DatabaseViewRegistryEntry[] =
    DATABASE_VIEW_TYPES.map((t) => viewRegistry[t]);

/** Convenience accessor with a stable fallback to `table`. */
export function viewEntryFor(type: DatabaseViewType): DatabaseViewRegistryEntry {
    return viewRegistry[type] ?? viewRegistry.table;
}
