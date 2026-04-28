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
 *   - `lucide:user` / `ph:sword-fill` → resolved via Iconify's offline
 *     registry (loaded by `iconify.ts`).
 *   - Any local registry key from `components/ui/icons.ts` (e.g.
 *     `kind-character`, `kind-location`) → wrapped in a synthetic SVG
 *     using the existing inner-SVG markup.
 */
import { getIcon } from '@iconify/vue';
import { ICONS, type IconName } from '@/components/ui/icons';

type CacheEntry = HTMLImageElement | 'loading' | 'error';

const cache = new Map<string, CacheEntry>();

/** Build an SVG string with `fill="white"` for the given icon name. */
function buildSvg(name: string): string | null {
  if (name.includes(':')) {
    const data = getIcon(name);
    if (!data) return null;
    const w = data.width ?? 24;
    const h = data.height ?? 24;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" fill="white">${data.body}</svg>`;
  }
  const local = (ICONS as Record<string, { content: string; viewBox?: string }>)[name];
  if (!local) return null;
  const viewBox = local.viewBox ?? '0 0 24 24';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="white">${local.content}</svg>`;
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
