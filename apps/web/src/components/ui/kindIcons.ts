/**
 * Curated catalogue of icons available when creating / editing a category.
 *
 * Uses the **Lucide** icon set (prefix `lucide:*`) — the same collection
 * loaded throughout Continuum — so the picker is visually consistent with
 * every other icon in the application.
 *
 * Icons are grouped semantically. ~240 hand-picked entries useful for
 * D&D / worldbuilding / general knowledge bases.
 */

export interface KindIconGroup {
  /** Section heading shown in the picker. */
  label: string;
  /** Iconify ids (all `lucide:*`). */
  icons: readonly string[];
}

export const KIND_ICON_GROUPS: readonly KindIconGroup[] = [
  {
    label: 'People & Beings',
    icons: [
      'lucide:user', 'lucide:circle-user', 'lucide:users', 'lucide:user-round',
      'lucide:user-plus', 'lucide:user-cog', 'lucide:user-check', 'lucide:user-minus',
      'lucide:user-search', 'lucide:smile', 'lucide:smile-plus', 'lucide:frown',
      'lucide:skull', 'lucide:ghost', 'lucide:bot', 'lucide:brain',
      'lucide:bird', 'lucide:cat', 'lucide:dog', 'lucide:rabbit',
      'lucide:fish', 'lucide:bug', 'lucide:horse', 'lucide:cow',
      'lucide:hand', 'lucide:footprints',
    ],
  },
  {
    label: 'Places',
    icons: [
      'lucide:map', 'lucide:map-pin', 'lucide:map-pin-plus', 'lucide:globe',
      'lucide:earth', 'lucide:landmark', 'lucide:castle', 'lucide:church',
      'lucide:warehouse', 'lucide:house', 'lucide:home', 'lucide:tent',
      'lucide:building', 'lucide:building-2', 'lucide:store', 'lucide:graduation-cap',
      'lucide:hospital', 'lucide:factory', 'lucide:fence', 'lucide:door-closed',
      'lucide:door-open', 'lucide:mountain', 'lucide:mountain-snow', 'lucide:tree-pine',
      'lucide:palm-tree', 'lucide:sprout', 'lucide:waves', 'lucide:tornado',
      'lucide:cloud-fog', 'lucide:flame',
    ],
  },
  {
    label: 'Items & Objects',
    icons: [
      'lucide:sword', 'lucide:shield', 'lucide:shield-check', 'lucide:shield-plus',
      'lucide:hammer', 'lucide:wrench', 'lucide:knife', 'lucide:target',
      'lucide:diamond', 'lucide:gem', 'lucide:crown', 'lucide:trophy',
      'lucide:medal', 'lucide:key', 'lucide:key-round', 'lucide:lock',
      'lucide:scroll', 'lucide:book', 'lucide:book-open', 'lucide:book-open-text',
      'lucide:book-marked', 'lucide:library', 'lucide:notebook', 'lucide:notepad-text',
      'lucide:folder', 'lucide:folder-open', 'lucide:archive', 'lucide:package',
      'lucide:gift', 'lucide:wallet', 'lucide:coins', 'lucide:banknote',
      'lucide:hand-coins', 'lucide:crosshair', 'lucide:wand-2', 'lucide:flask-conical',
      'lucide:test-tube', 'lucide:bone', 'lucide:dice-1', 'lucide:dice-3',
      'lucide:dice-5', 'lucide:dice-6', 'lucide:anvil', 'lucide:shopping-basket',
    ],
  },
  {
    label: 'Magic & Lore',
    icons: [
      'lucide:sparkles', 'lucide:wand', 'lucide:zap', 'lucide:zap-off',
      'lucide:flame', 'lucide:snowflake', 'lucide:droplet', 'lucide:cloud',
      'lucide:cloud-lightning', 'lucide:cloud-rain', 'lucide:cloud-snow',
      'lucide:sun', 'lucide:sunrise', 'lucide:sun-dim', 'lucide:moon',
      'lucide:moon-star', 'lucide:star', 'lucide:sparkle', 'lucide:atom',
      'lucide:hexagon', 'lucide:triangle', 'lucide:infinity', 'lucide:eye',
      'lucide:lightbulb', 'lucide:rainbow', 'lucide:biohazard', 'lucide:activity',
    ],
  },
  {
    label: 'Factions & Society',
    icons: [
      'lucide:flag', 'lucide:flag-triangle-right', 'lucide:scale', 'lucide:gavel',
      'lucide:handshake', 'lucide:contact', 'lucide:cross', 'lucide:heart-handshake',
      'lucide:heart', 'lucide:share-2', 'lucide:link', 'lucide:link-2-off',
      'lucide:network',
    ],
  },
  {
    label: 'Events & Time',
    icons: [
      'lucide:calendar', 'lucide:calendar-check', 'lucide:calendar-days', 'lucide:clock',
      'lucide:hourglass', 'lucide:timer', 'lucide:alarm-clock', 'lucide:rotate-cw',
      'lucide:rotate-ccw', 'lucide:bookmark', 'lucide:bell', 'lucide:bell-ring',
      'lucide:megaphone', 'lucide:party-popper', 'lucide:cake', 'lucide:wine',
      'lucide:beer', 'lucide:utensils',
    ],
  },
  {
    label: 'Nature & Animals',
    icons: [
      'lucide:leaf', 'lucide:flower', 'lucide:flower-2', 'lucide:cherry',
      'lucide:apple', 'lucide:carrot', 'lucide:feather', 'lucide:paw-print',
      'lucide:fish', 'lucide:droplets', 'lucide:wind', 'lucide:cactus',
    ],
  },
  {
    label: 'Notes & Documents',
    icons: [
      'lucide:file-text', 'lucide:file', 'lucide:files', 'lucide:file-search',
      'lucide:file-plus', 'lucide:file-up', 'lucide:clipboard', 'lucide:clipboard-list',
      'lucide:tag', 'lucide:hash', 'lucide:list', 'lucide:list-ordered',
      'lucide:list-checks',
    ],
  },
  {
    label: 'Symbols & Shapes',
    icons: [
      'lucide:circle', 'lucide:square', 'lucide:diamond', 'lucide:octagon',
      'lucide:shapes', 'lucide:asterisk', 'lucide:at-sign', 'lucide:dollar-sign',
      'lucide:percent', 'lucide:plus', 'lucide:minus', 'lucide:x',
      'lucide:check', 'lucide:circle-help', 'lucide:triangle-alert', 'lucide:info',
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
export const DEFAULT_KIND_ICON = 'lucide:tag';
