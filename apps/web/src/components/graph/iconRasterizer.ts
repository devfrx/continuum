/**
 * Rasterise icon glyphs into HTMLImageElements for use on the Sigma
 * canvas overlay (so each node can show its kind icon on top of the
 * coloured circle).
 *
 * Strategy:
 *   1. Build an SVG string with `fill="white"` so the glyph reads against
 *      every saturated kind colour.
 *   2. Wrap it in a Blob URL and load it as an `<img>`. SVGs draw
 *      crisply at any size when drawn via `ctx.drawImage`.
 *   3. Cache the resolved Image per icon-name forever — icons are static.
 *
 * Two icon name shapes are supported:
 *   - `solar:user-bold` (any iconify id) → resolved via Iconify's offline
 *     registry (loaded by `iconify.ts`).
 *   - Any local registry key from `@/assets/icons` (e.g. `kind-character`,
 *     `kind-location`) → either delegated to its iconify id, or wrapped
 *     in a synthetic SVG using the registry's inline markup.
 */
import { getIconData } from '@iconify/utils';
import { icons as solarIcons } from '@iconify-json/solar';
import { ICONS, type AppIconName as IconName } from '@/assets/icons';

type CacheEntry = HTMLImageElement | 'loading' | 'error';

const cache = new Map<string, CacheEntry>();

/** Build an SVG string with `fill="white"` for the given icon name. */
function buildSvg(name: string): string | null {
  // Direct iconify id (`prefix:slug`).
  if (name.includes(':')) return buildIconifySvg(name);

  // Registry name — resolve through the central registry.
  const local = (ICONS as Record<string, { icon?: string; inner?: string; viewBox?: string }>)[name];
  if (!local) return null;
  if (local.inner) {
    const viewBox = local.viewBox ?? '0 0 24 24';
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="white">${local.inner}</svg>`;
  }
  if (local.icon) return buildIconifySvg(local.icon);
  return null;
}

function buildIconifySvg(id: string): string | null {
  // Only the solar collection is bundled offline; anything else is unsupported.
  const colon = id.indexOf(':');
  if (colon === -1) return null;
  const prefix = id.slice(0, colon);
  const slug = id.slice(colon + 1);
  if (prefix !== 'solar') return null;
  const data = getIconData(solarIcons, slug);
  if (!data) return null;
  const w = data.width ?? 24;
  const h = data.height ?? 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="white">${data.body}</svg>`;
}

/**
 * Returns the cached image for an icon, or `null` while it loads / if
 * the name is unknown. Callers should re-invoke after the supplied
 * `onReady` callback fires (typically to refresh Sigma).
 *
 * The same `onReady` may fire multiple times across the app lifetime —
 * once per cache miss — so the caller's handler must be idempotent.
 */
export function getIconImage(
  name: string,
  onReady?: () => void,
): HTMLImageElement | null {
  if (!name) return null;
  const cached = cache.get(name);
  if (cached === 'loading' || cached === 'error') return null;
  if (cached) return cached;

  const svg = buildSvg(name);
  if (!svg) {
    cache.set(name, 'error');
    return null;
  }

  cache.set(name, 'loading');
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.onload = () => {
    cache.set(name, img);
    URL.revokeObjectURL(url);
    onReady?.();
  };
  img.onerror = () => {
    cache.set(name, 'error');
    URL.revokeObjectURL(url);
  };
  img.src = url;
  return null;
}

/** Test helper — empties the cache. Not used in production code. */
export function _resetIconCache(): void {
  cache.clear();
}

export type { IconName };
