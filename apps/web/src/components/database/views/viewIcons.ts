/**
 * Maps a {@link LayoutConfig.type} discriminator to the icon shown in the
 * saved-view tab strip and in the "create new view" popover.
 *
 * Icons resolve via the central `<Icon>` component which accepts both
 * registered short names from `@/assets/icons` and raw Iconify ids
 * (`prefix:slug`). For layouts that do not have a registered short name
 * (board / calendar / timeline) we fall back to a Solar iconify id so the
 * tab strip never renders the dashed-square fallback.
 */
import type { LayoutConfig } from '@continuum/shared';

/** Layout discriminator → icon name accepted by `<Icon>`. */
export const viewIcons: Record<LayoutConfig['type'], string> = {
  table: 'table',
  board: 'solar:posts-carousel-horizontal-bold',
  gallery: 'image',
  list: 'list-bullet',
  calendar: 'kind-event',
  timeline: 'solar:graph-up-bold',
};

/** Human label shown next to a layout icon in pickers. */
export const viewLabels: Record<LayoutConfig['type'], string> = {
  table: 'Table',
  board: 'Board',
  gallery: 'Gallery',
  list: 'List',
  calendar: 'Calendar',
  timeline: 'Timeline',
};
