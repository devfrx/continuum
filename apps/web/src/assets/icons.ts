/**
 * icons.ts — Centralized icon registry for Continuum.
 *
 * Every icon used across the application is declared here as a named
 * entry mapping to a Solar Bold icon ID from the Iconify ecosystem.
 *
 * To swap a single icon, change its `icon` value.
 * To swap the entire icon set, replace the `icon` values with IDs from
 * any other Iconify-compatible set (e.g. 'ph:gear-fill', 'fluent:settings-24-filled').
 *
 * Usage in Vue templates: <Icon name="settings" :size="16" />
 * Usage in JS/HTML strings: getIconSvgString('copy', 16)
 *
 * Icon set: Solar Bold (rounded filled) — https://icon-sets.iconify.design/solar/
 */

import { getIconData, iconToSVG } from '@iconify/utils';
import { icons as solarIcons } from '@iconify-json/solar';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface IconDef {
  /** Iconify icon ID — format: 'prefix:name', e.g. 'solar:settings-bold'. */
  icon?: string;
  /** Raw SVG child elements, used for custom icons that don't come from Iconify. */
  inner?: string;
  /** Custom viewBox — defaults to '0 0 24 24'. Only used when `inner` is set. */
  viewBox?: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const _ICONS = {
  // ── Navigation ───────────────────────────────────────────────────────────
  'notes': { icon: 'solar:notebook-bold' },
  'graph': { icon: 'solar:branching-paths-up-bold' },
  'search': { icon: 'solar:magnifer-bold' },
  'settings': { icon: 'solar:settings-bold' },
  'sidebar': { icon: 'solar:sidebar-minimalistic-bold' },
  'sidebar-collapse': { icon: 'solar:round-double-alt-arrow-left-bold' },
  'sidebar-expand': { icon: 'solar:round-double-alt-arrow-right-bold' },
  'ai': { icon: 'solar:magic-stick-3-bold' },
  'home': { icon: 'solar:home-2-bold' },
  'theme-light': { icon: 'solar:sun-bold' },
  'theme-dark': { icon: 'solar:moon-bold' },

  // ── Actions ──────────────────────────────────────────────────────────────
  'plus': {
    inner:
      '<line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '<line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    viewBox: '0 0 24 24',
  },
  'minus': {
    inner: '<line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    viewBox: '0 0 24 24',
  },
  'close': {
    inner:
      '<line x1="6" y1="6" x2="18" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
      + '<line x1="18" y1="6" x2="6" y2="18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    viewBox: '0 0 24 24',
  },
  'check': { icon: 'solar:check-read-bold' },
  'edit': { icon: 'solar:pen-2-bold' },
  'trash': { icon: 'solar:trash-bin-trash-bold' },
  'copy': { icon: 'solar:copy-bold' },
  'save': { icon: 'solar:diskette-bold' },
  'download': { icon: 'solar:download-minimalistic-bold' },
  'menu': { icon: 'solar:hamburger-menu-bold' },
  'more-horizontal': { icon: 'solar:menu-dots-bold' },
  'more-vertical': { icon: 'solar:menu-dots-square-bold' },
  'filter': { icon: 'solar:filter-bold' },
  'refresh': { icon: 'solar:refresh-bold' },
  'expand': { icon: 'solar:alt-arrow-down-bold' },
  'collapse': { icon: 'solar:alt-arrow-up-bold' },
  'maximize': { icon: 'solar:maximize-square-bold' },
  'minimize': { icon: 'solar:minimize-square-bold' },

  // ── Direction ────────────────────────────────────────────────────────────
  'chevron-up': { icon: 'solar:alt-arrow-up-bold' },
  'chevron-down': { icon: 'solar:alt-arrow-down-bold' },
  'chevron-left': { icon: 'solar:alt-arrow-left-bold' },
  'chevron-right': { icon: 'solar:alt-arrow-right-bold' },
  'arrow-up': { icon: 'solar:arrow-up-bold' },
  'arrow-down': { icon: 'solar:arrow-down-bold' },
  'arrow-left': { icon: 'solar:arrow-left-bold' },
  'arrow-right': { icon: 'solar:arrow-right-bold' },

  // ── Editor — text formatting ─────────────────────────────────────────────
  'bold': { icon: 'solar:text-bold-bold' },
  'note-title': { icon: 'solar:text-bold' },
  'italic': { icon: 'solar:text-italic-bold' },
  'strike': { icon: 'solar:text-cross-bold' },
  'underline': { icon: 'solar:text-underline-bold' },
  'code': { icon: 'solar:code-bold' },
  'link': { icon: 'solar:link-bold' },
  'unlink': { icon: 'solar:link-broken-bold' },
  'heading-1': { icon: 'solar:text-bold' },
  'heading-2': { icon: 'solar:text-bold' },
  'heading-3': { icon: 'solar:text-bold' },
  'heading-4': { icon: 'solar:text-bold' },
  'list-bullet': { icon: 'solar:list-bold' },
  'list-ordered': { icon: 'solar:list-arrow-down-bold' },
  'quote': { icon: 'solar:chat-square-bold' },
  'code-block': { icon: 'solar:code-square-bold' },
  'divider': { icon: 'solar:menu-dots-bold' },
  'wikilink': { icon: 'solar:link-bold' },
  'eye': { icon: 'solar:eye-bold' },
  'eye-off': { icon: 'solar:eye-closed-bold' },

  // ── Editor — blocks & inline ────────────────────────────────────────────
  'image': { icon: 'solar:gallery-bold' },
  'file': { icon: 'solar:document-bold' },
  'callout': { icon: 'solar:notification-unread-bold' },
  'toggle': { icon: 'solar:square-alt-arrow-right-bold' },
  'task': { icon: 'solar:checklist-bold' },
  'table': { icon: 'solar:posts-carousel-vertical-bold' },
  'chart': { icon: 'solar:chart-bold' },
  'history': { icon: 'solar:history-bold' },
  'palette': { icon: 'solar:palette-bold' },
  'highlighter': { icon: 'solar:pen-new-square-bold' },
  'align-left': { icon: 'solar:text-align-left-bold' },
  'align-center': { icon: 'solar:text-align-center-bold' },
  'align-right': { icon: 'solar:text-align-right-bold' },
  'align-justify': { icon: 'solar:text-align-justify-bold' },
  'subscript': { icon: 'solar:text-bold' },
  'superscript': { icon: 'solar:text-bold' },
  'cut': { icon: 'solar:scissors-square-bold' },
  'paste': { icon: 'solar:clipboard-bold' },
  'footnote': { icon: 'solar:bookmark-bold' },
  'lock': { icon: 'solar:lock-keyhole-bold' },
  'lock-open': { icon: 'solar:lock-keyhole-unlocked-bold' },

  // ── Graph ────────────────────────────────────────────────────────────────
  'node': { icon: 'solar:atom-bold' },
  'connection': { icon: 'solar:link-circle-bold' },
  'zoom-in': { icon: 'solar:magnifer-zoom-in-bold' },
  'zoom-out': { icon: 'solar:magnifer-zoom-out-bold' },
  'fit-screen': { icon: 'solar:maximize-square-2-bold' },
  'layout': { icon: 'solar:widget-4-bold' },
  'drag': { icon: 'solar:posts-carousel-horizontal-bold' },
  'play': { icon: 'solar:play-bold' },
  'loader': { icon: 'solar:refresh-bold' },
  'pause': { icon: 'solar:pause-bold' },
  'activity': { icon: 'solar:pulse-bold' },
  'snowflake': { icon: 'solar:snowflake-bold' },
  'cube': { icon: 'solar:box-minimalistic-bold' },
  'grid': { icon: 'solar:widget-2-bold' },

  // ── Status ───────────────────────────────────────────────────────────────
  'circle-filled': { icon: 'solar:record-circle-bold' },
  'circle': { icon: 'solar:record-bold' },
  'dot': { icon: 'solar:circle-bold' },
  'sparkles': { icon: 'solar:stars-bold' },
  'lightning': { icon: 'solar:bolt-bold' },
  'warning': { icon: 'solar:danger-triangle-bold' },
  'info': { icon: 'solar:info-circle-bold' },
  'error': { icon: 'solar:close-circle-bold' },
  'tag': { icon: 'solar:tag-bold' },
  'clock': { icon: 'solar:clock-circle-bold' },

  // ── Loaders ──────────────────────────────────────────────────────────────
  /** Spinning refresh arrow — pair with a `.spin` CSS class on the consumer. */
  'spinner': { icon: 'solar:refresh-bold' },

  // ── Categories (kinds) ───────────────────────────────────────────────────
  'kind-note': { icon: 'solar:notebook-bold' },
  'kind-character': { icon: 'solar:user-bold' },
  'kind-location': { icon: 'solar:map-point-bold' },
  'kind-item': { icon: 'solar:box-bold' },
  'kind-event': { icon: 'solar:calendar-bold' },
  'kind-faction': { icon: 'solar:users-group-rounded-bold' },
  'kind-lore': { icon: 'solar:book-bold' },
  'kind-class': { icon: 'solar:medal-star-bold' },
  'kind-race': { icon: 'solar:user-id-bold' },
  'kind-custom': { icon: 'solar:tag-bold' },
  'kind-folder': { icon: 'solar:folder-bold' },
  'kind-book': { icon: 'solar:book-2-bold' },
  'kind-sword': { icon: 'solar:bolt-bold' },
  'kind-shield': { icon: 'solar:shield-bold' },
  'kind-flame': { icon: 'solar:fire-bold' },
  'kind-leaf': { icon: 'solar:leaf-bold' },
  'kind-star': { icon: 'solar:star-bold' },
  'kind-crown': { icon: 'solar:crown-bold' },
  'kind-skull': { icon: 'solar:skateboard-bold' },
  'kind-heart': { icon: 'solar:heart-bold' },

  // ── Folders ──────────────────────────────────────────────────────────────
  'folder': { icon: 'solar:folder-bold' },
  'folder-open': { icon: 'solar:folder-open-bold' },
  'folder-with-files': { icon: 'solar:folder-with-files-bold' },
  'folder-add': { icon: 'solar:add-folder-bold' },
  'folder-favourite': { icon: 'solar:folder-favourite-bookmark-bold' },
  'inbox': { icon: 'solar:inbox-bold' },

  // ── Property types ───────────────────────────────────────────────────────
  'prop-text': { icon: 'solar:text-bold' },
  'prop-long-text': { icon: 'solar:text-square-bold' },
  'prop-number': { icon: 'solar:hashtag-bold' },
  'prop-date': { icon: 'solar:calendar-bold' },
  'prop-date-range': { icon: 'solar:calendar-mark-bold' },
  'prop-checkbox': { icon: 'solar:check-square-bold' },
  'prop-select': { icon: 'solar:list-bold' },
  'prop-multi-select': { icon: 'solar:tag-horizontal-bold' },
  'prop-url': { icon: 'solar:link-bold' },
  'prop-email': { icon: 'solar:letter-bold' },
  'prop-relation': { icon: 'solar:link-circle-bold' },
  'prop-clock': { icon: 'solar:clock-circle-bold' },
  'prop-phone': { icon: 'solar:phone-bold' },
  'prop-files': { icon: 'solar:paperclip-bold' },
  'prop-status': { icon: 'solar:hourglass-bold' },
  'prop-rollup': { icon: 'solar:layers-bold' },
  'prop-formula': { icon: 'solar:calculator-bold' },
  'prop-button': { icon: 'solar:bolt-circle-bold' },
  'prop-created-time': { icon: 'solar:calendar-add-bold' },
  'prop-created-by': { icon: 'solar:user-bold' },
  'prop-edited-time': { icon: 'solar:pen-2-bold' },
  'prop-edited-by': { icon: 'solar:user-rounded-bold' },
  'prop-unique-id': { icon: 'solar:hashtag-square-bold' },
  'prop-verification': { icon: 'solar:verified-check-bold' },
  'prop-progress': { icon: 'solar:graph-bold' },} as const;

export type AppIconName = keyof typeof _ICONS;

/**
 * Typed icon registry. Use `AppIconName` for autocomplete on icon names.
 */
export const ICONS = _ICONS as Record<AppIconName, IconDef>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns a complete `<svg>` HTML string for use outside Vue templates.
 * The `strokeWidth` parameter is kept for API compatibility but is unused
 * since Solar icons are fill-based.
 */
export function getIconSvgString(
  name: AppIconName,
  size: number = 16,
  _strokeWidth?: number,
): string {
  const def = ICONS[name];
  if (def.inner != null) {
    const viewBox = def.viewBox ?? '0 0 24 24';
    return `<svg width="${size}" height="${size}" viewBox="${viewBox}" fill="none" aria-hidden="true">${def.inner}</svg>`;
  }
  if (!def.icon) return '';
  const colonIdx = def.icon.indexOf(':');
  const iconName = def.icon.slice(colonIdx + 1);
  const iconData = getIconData(solarIcons, iconName);
  if (!iconData) return '';
  const svg = iconToSVG(iconData, { width: String(size), height: String(size) });
  const attrs = Object.entries({ ...svg.attributes, 'aria-hidden': 'true' })
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<svg ${attrs}>${svg.body}</svg>`;
}

/** Type guard: checks whether `name` is a known registry entry. */
export function isValidIconName(name: string): name is AppIconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}
