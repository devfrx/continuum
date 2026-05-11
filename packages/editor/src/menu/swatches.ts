/**
 * Color swatches and quick-icon ids used by the right-click menu.
 *
 * Kept as separate constants (rather than inline literals) so the
 * submenu factories stay focused on structure and the palettes can be
 * tweaked in one place.
 */

export interface Swatch {
  id: string;
  label: string;
  /** CSS color value applied to the editor; `inherit`/`transparent` clear the mark. */
  value: string;
}

export const TEXT_SWATCHES: Swatch[] = [
  { id: 'default', label: 'Default', value: 'inherit' },
  { id: 'gray', label: 'Gray', value: '#9CA3AF' },
  { id: 'brown', label: 'Brown', value: '#B45309' },
  { id: 'orange', label: 'Orange', value: '#F97316' },
  { id: 'yellow', label: 'Yellow', value: '#EAB308' },
  { id: 'green', label: 'Green', value: '#10B981' },
  { id: 'blue', label: 'Blue', value: '#3B82F6' },
  { id: 'purple', label: 'Purple', value: '#8B5CF6' },
  { id: 'pink', label: 'Pink', value: '#EC4899' },
  { id: 'red', label: 'Red', value: '#EF4444' },
];

export const HIGHLIGHT_SWATCHES: Swatch[] = [
  { id: 'h-default', label: 'None', value: 'transparent' },
  { id: 'h-gray', label: 'Gray', value: '#E5E7EB' },
  { id: 'h-yellow', label: 'Yellow', value: '#FEF3C7' },
  { id: 'h-orange', label: 'Orange', value: '#FFEDD5' },
  { id: 'h-green', label: 'Green', value: '#D1FAE5' },
  { id: 'h-blue', label: 'Blue', value: '#DBEAFE' },
  { id: 'h-purple', label: 'Purple', value: '#EDE9FE' },
  { id: 'h-pink', label: 'Pink', value: '#FCE7F3' },
  { id: 'h-red', label: 'Red', value: '#FEE2E2' },
];

/**
 * Curated set of app-icon ids surfaced as quick-picks in the right-click
 * "Callout icon" submenu. The CalloutNodeView popover holds the full
 * searchable grid plus the "Custom URL" tab; this list is just the
 * fast-path for users who never leave the menu.
 */
export const CALLOUT_QUICK_ICONS: string[] = [
  'info',
  'warning',
  'error',
  'sparkles',
  'callout',
  'lightning',
  'kind-flame',
  'kind-star',
  'kind-heart',
  'kind-shield',
  'kind-skull',
  'kind-crown',
];
