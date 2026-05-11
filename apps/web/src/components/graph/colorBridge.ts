/**
 * CSS ↔ Three.js colour bridge helpers extracted from `Graph3DCanvas.vue`.
 *
 * The 3D canvas reads its palette from CSS custom properties (so the
 * scene flips with dark mode), then needs to feed those values into both
 * Three.js materials (which want a `THREE.Color`) and 2D canvas
 * label sprites (which want an `rgba(...)` string with a custom alpha).
 *
 * NOTE: there is no overlap with `useGraphPalette.ts`; that composable
 * only resolves CSS custom properties to plain strings. These helpers
 * convert those strings to the formats Three.js / Canvas2D need.
 */
import * as THREE from 'three';

/**
 * Convert a CSS colour token (`#RRGGBB`, `rgb(...)`, `rgba(...)` or a
 * named colour) to a `THREE.Color`.
 *
 * `THREE.Color.set` accepts `#rgb`, `#rrggbb`, `rgb()` and named
 * colours but not `rgba()`, so the alpha component is stripped first.
 * On any parse failure the supplied numeric `fallback` (default
 * `0xe8dcc8`, the cream accent) is used.
 */
export function cssToThreeColor(input: string, fallback = 0xe8dcc8): THREE.Color {
  const c = new THREE.Color();
  try {
    const cleaned = input.startsWith('rgba')
      ? input.replace(/rgba\(([^)]+)\)/, (_m, body: string) => {
          const parts = body.split(',').slice(0, 3).join(',');
          return `rgb(${parts})`;
        })
      : input;
    c.set(cleaned);
    return c;
  } catch {
    return c.setHex(fallback);
  }
}

/**
 * Re-emit a CSS colour with a custom alpha channel as an `rgba(...)`
 * string. Accepts `#rrggbb`, `rgb(...)` and `rgba(...)` inputs; any
 * other format is returned unchanged so callers can pass through
 * unsupported tokens (e.g. `currentColor`) without crashing.
 */
export function cssWithAlpha(input: string, alpha: number): string {
  const hex = input.trim();
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (hex.startsWith('rgba(')) return hex.replace(/,\s*[\d.]+\)$/u, `, ${alpha})`);
  if (hex.startsWith('rgb(')) return hex.replace(/^rgb\((.*)\)$/u, `rgba($1, ${alpha})`);
  return input;
}
