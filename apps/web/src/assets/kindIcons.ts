/**
 * Curated catalogue of icons available when creating / editing a category.
 *
 * Uses the **Solar Bold** icon set (prefix `solar:*-bold`) — the single
 * collection bundled by Continuum — so the picker is visually consistent
 * with every other icon in the application.
 *
 * Icons are grouped semantically. Hand-picked entries useful for D&D,
 * worldbuilding and general knowledge bases.
 */

export interface KindIconGroup {
  /** Section heading shown in the picker. */
  label: string;
  /** Iconify ids (all `solar:*-bold`). */
  icons: readonly string[];
}

export const KIND_ICON_GROUPS: readonly KindIconGroup[] = [
  {
    label: 'People & Beings',
    icons: [
      'solar:user-bold', 'solar:user-circle-bold', 'solar:users-group-rounded-bold', 'solar:user-rounded-bold',
      'solar:user-plus-bold', 'solar:user-id-bold', 'solar:user-check-bold', 'solar:user-minus-bold',
      'solar:user-speak-bold', 'solar:smile-circle-bold', 'solar:emoji-funny-square-bold', 'solar:sad-square-bold',
      'solar:skateboard-bold', 'solar:ghost-bold', 'solar:programming-bold', 'solar:brain-bold',
      'solar:cat-bold', 'solar:dog-bold', 'solar:peace-bold',
      'solar:bug-bold', 'solar:hand-shake-bold', 'solar:walking-bold',
    ],
  },
  {
    label: 'Places',
    icons: [
      'solar:map-bold', 'solar:map-point-bold', 'solar:map-point-add-bold', 'solar:global-bold',
      'solar:planet-bold', 'solar:buildings-bold', 'solar:castle-bold', 'solar:church-bold',
      'solar:shop-bold', 'solar:home-bold', 'solar:home-2-bold', 'solar:tent-bold',
      'solar:buildings-2-bold', 'solar:buildings-3-bold', 'solar:shop-2-bold', 'solar:square-academic-cap-bold',
      'solar:hospital-bold', 'solar:garage-bold', 'solar:square-bold',
      'solar:mountains-bold', 'solar:tree-bold', 'solar:leaf-bold', 'solar:waterdrops-bold',
      'solar:tornado-bold', 'solar:cloud-bold', 'solar:fire-bold',
    ],
  },
  {
    label: 'Items & Objects',
    icons: [
      'solar:bolt-bold', 'solar:shield-bold', 'solar:shield-check-bold', 'solar:shield-plus-bold',
      'solar:hammer-bold', 'solar:settings-bold', 'solar:cutter-bold', 'solar:target-bold',
      'solar:diamond-bold', 'solar:crown-bold', 'solar:crown-star-bold', 'solar:cup-star-bold',
      'solar:medal-ribbon-bold', 'solar:key-bold', 'solar:key-square-bold', 'solar:lock-bold',
      'solar:scroll-bold', 'solar:book-bold', 'solar:book-2-bold', 'solar:book-bookmark-bold',
      'solar:bookmark-bold', 'solar:library-bold', 'solar:notebook-bold', 'solar:notes-bold',
      'solar:folder-bold', 'solar:folder-open-bold', 'solar:archive-bold', 'solar:box-bold',
      'solar:gift-bold', 'solar:wallet-bold', 'solar:dollar-bold', 'solar:money-bag-bold',
      'solar:hand-money-bold', 'solar:magic-stick-3-bold', 'solar:test-tube-bold',
      'solar:bone-bold', 'solar:dice-bold', 'solar:basket-bold',
    ],
  },
  {
    label: 'Magic & Lore',
    icons: [
      'solar:stars-bold', 'solar:magic-stick-bold', 'solar:bolt-circle-bold',
      'solar:fire-bold', 'solar:snowflake-bold', 'solar:waterdrop-bold', 'solar:cloud-bold',
      'solar:cloud-bolt-bold', 'solar:cloud-rain-bold', 'solar:cloud-snowfall-bold',
      'solar:sun-bold', 'solar:sunrise-bold', 'solar:sun-2-bold', 'solar:moon-bold',
      'solar:moon-stars-bold', 'solar:star-bold', 'solar:star-fall-2-bold', 'solar:atom-bold',
      'solar:hexagon-bold', 'solar:tuning-3-bold', 'solar:infinity-bold', 'solar:eye-bold',
      'solar:lightbulb-bold', 'solar:rainbow-bold', 'solar:radioactive-bold', 'solar:pulse-bold',
    ],
  },
  {
    label: 'Factions & Society',
    icons: [
      'solar:flag-bold', 'solar:flag-2-bold', 'solar:scale-bold', 'solar:gavel-bold',
      'solar:hand-shake-bold', 'solar:plain-bold', 'solar:heart-shine-bold',
      'solar:heart-bold', 'solar:share-bold', 'solar:link-bold', 'solar:link-broken-bold',
      'solar:branching-paths-up-bold',
    ],
  },
  {
    label: 'Events & Time',
    icons: [
      'solar:calendar-bold', 'solar:calendar-mark-bold', 'solar:calendar-date-bold', 'solar:clock-circle-bold',
      'solar:hourglass-bold', 'solar:stopwatch-bold', 'solar:alarm-bold', 'solar:refresh-bold',
      'solar:restart-bold', 'solar:bell-bold', 'solar:bell-bing-bold',
      'solar:megaphone-bold', 'solar:confetti-minimalistic-bold', 'solar:cake-bold', 'solar:bottle-bold',
      'solar:cup-bold', 'solar:dish-bold',
    ],
  },
  {
    label: 'Nature & Animals',
    icons: [
      'solar:leaf-bold', 'solar:plant-2-bold', 'solar:cherry-bold',
      'solar:apple-bold', 'solar:carrot-bold', 'solar:feather-bold', 'solar:paw-bold',
      'solar:waterdrop-bold', 'solar:wind-bold', 'solar:plant-bold',
    ],
  },
  {
    label: 'Notes & Documents',
    icons: [
      'solar:file-text-bold', 'solar:file-bold', 'solar:files-bold', 'solar:file-search-bold',
      'solar:file-add-bold', 'solar:file-send-bold', 'solar:clipboard-bold', 'solar:clipboard-list-bold',
      'solar:tag-bold', 'solar:hashtag-bold', 'solar:list-bold', 'solar:list-arrow-down-bold',
      'solar:checklist-bold',
    ],
  },
  {
    label: 'Symbols & Shapes',
    icons: [
      'solar:circle-bold', 'solar:square-bold', 'solar:diamond-bold', 'solar:hexagon-bold',
      'solar:layers-bold', 'solar:asterisk-square-bold', 'solar:at-bold', 'solar:dollar-bold',
      'solar:percent-circle-bold', 'solar:add-circle-bold', 'solar:minus-circle-bold', 'solar:close-circle-bold',
      'solar:check-circle-bold', 'solar:question-circle-bold', 'solar:danger-triangle-bold', 'solar:info-circle-bold',
    ],
  },
] as const;

/**
 * Flat list of every icon id, used by the search input in the picker.
 * Materialised once at module load — the groups themselves never change
 * at runtime so memoisation is free.
 */
export const KIND_ICONS_FLAT: readonly string[] = KIND_ICON_GROUPS.flatMap(
  (g) => g.icons,
);

/**
 * Default icon for newly-created categories.
 */
export const DEFAULT_KIND_ICON = 'solar:tag-bold';
