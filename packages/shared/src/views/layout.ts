// ===== Layout configuration for Database Views =====
//
// Discriminated union over the six Notion-style layouts. Each layout owns
// the visual settings exclusive to it; properties shared with the table
// (visibility, ordering, width) live in `ColumnConfig`.

import { z } from 'zod';

/** Row height presets accepted by the table layout. */
export const ROW_HEIGHTS = ['short', 'medium', 'tall'] as const;
export type RowHeight = (typeof ROW_HEIGHTS)[number];

/** How an opened note is displayed when clicked from a row. */
export const OPEN_MODES = ['side-peek', 'center-peek', 'full-page'] as const;
export type OpenMode = (typeof OPEN_MODES)[number];

/** Card size presets shared by board and gallery layouts. */
export const CARD_SIZES = ['small', 'medium', 'large'] as const;
export type CardSize = (typeof CARD_SIZES)[number];

/** Image fit mode for gallery covers. */
export const IMAGE_FITS = ['cover', 'contain'] as const;
export type ImageFit = (typeof IMAGE_FITS)[number];

/** Granularity of the timeline x-axis. */
export const TIMELINE_GRANULARITIES = [
  'hour',
  'day',
  'week',
  'month',
  'quarter',
  'year',
] as const;
export type TimelineGranularity = (typeof TIMELINE_GRANULARITIES)[number];

// ───────── Per-type layout configs ─────────

export interface TableLayout {
  type: 'table';
  rowHeight: RowHeight;
  /** Word-wrap default for cells (per-column override lives in ColumnConfig). */
  wrap: boolean;
  openMode: OpenMode;
}

export interface BoardLayout {
  type: 'board';
  /** Property key the columns are grouped by (select/status/checkbox/...). */
  groupByPropertyKey: string;
  hideEmptyGroups: boolean;
  cardSize: CardSize;
  /** Optional `files` property whose first image is used as the card cover. */
  coverPropertyKey?: string;
}

export interface GalleryLayout {
  type: 'gallery';
  cardSize: CardSize;
  /** Optional `files` property whose first image is used as the card cover. */
  coverPropertyKey?: string;
  fitImage: ImageFit;
}

export interface ListLayout {
  type: 'list';
  /** Property keys shown as inline meta below the title. */
  showProperties: string[];
}

export interface CalendarLayout {
  type: 'calendar';
  /** `date` or `dateRange` property used to place notes on the calendar. */
  datePropertyKey: string;
  showWeekends: boolean;
  startOnMonday: boolean;
}

export interface TimelineLayout {
  type: 'timeline';
  /** Property key whose date provides the timeline-bar start. */
  startPropertyKey: string;
  /** Optional end-date property — when unset, bars are points. */
  endPropertyKey?: string;
  granularity: TimelineGranularity;
}

/** Discriminated union of every supported layout. */
export type LayoutConfig =
  | TableLayout
  | BoardLayout
  | GalleryLayout
  | ListLayout
  | CalendarLayout
  | TimelineLayout;

// ───────── Schemas ─────────

export const layoutConfigSchema: z.ZodType<LayoutConfig> = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('table'),
    rowHeight: z.enum(ROW_HEIGHTS),
    wrap: z.boolean(),
    openMode: z.enum(OPEN_MODES),
  }),
  z.object({
    type: z.literal('board'),
    groupByPropertyKey: z.string().min(1),
    hideEmptyGroups: z.boolean(),
    cardSize: z.enum(CARD_SIZES),
    coverPropertyKey: z.string().min(1).optional(),
  }),
  z.object({
    type: z.literal('gallery'),
    cardSize: z.enum(CARD_SIZES),
    coverPropertyKey: z.string().min(1).optional(),
    fitImage: z.enum(IMAGE_FITS),
  }),
  z.object({
    type: z.literal('list'),
    showProperties: z.array(z.string().min(1)),
  }),
  z.object({
    type: z.literal('calendar'),
    datePropertyKey: z.string().min(1),
    showWeekends: z.boolean(),
    startOnMonday: z.boolean(),
  }),
  z.object({
    type: z.literal('timeline'),
    startPropertyKey: z.string().min(1),
    endPropertyKey: z.string().min(1).optional(),
    granularity: z.enum(TIMELINE_GRANULARITIES),
  }),
]);

/** Default table layout used when materialising a new view. */
export function defaultTableLayout(): TableLayout {
  return { type: 'table', rowHeight: 'medium', wrap: false, openMode: 'side-peek' };
}
