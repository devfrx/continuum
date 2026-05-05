/**
 * Visual constants and Sigma program factories for the Continuum knowledge
 * graph. The hosting view drives reactive colours through `useGraphPalette`;
 * the constants here are conservative dark-charcoal fallbacks so the
 * package stays usable without the web app's CSS layer.
 */
import { createNodeBorderProgram } from '@sigma/node-border';
import type { Settings } from 'sigma/settings';

export type LinkType = 'wikilink' | 'related' | string;

/**
 * Base node radius (graph units). Sized for legibility at typical zoom
 * with labels sitting comfortably below.
 */
export const NODE_BASE_SIZE = 20;
/** Extra radius per edge (sqrt-scaled) so hubs are visibly larger. */
export const NODE_DEGREE_SCALE = 3.2;

/** Subtle light rim that reads on the dark canvas without overpowering the kind colour. */
export const NODE_BORDER_COLOR = 'rgba(255, 255, 255, 0.18)';
export const NODE_BORDER_PIXELS = 1.25;

/**
 * Dim / hidden fallbacks used when no palette is provided. They are dark
 * neutrals that disappear into the charcoal background — the active
 * renderer always overrides via the reactive palette.
 */
export const DIM_NODE_COLOR = '#323232';
export const HIDDEN_NODE_COLOR = 'rgba(255, 255, 255, 0.04)';

export const DIM_EDGE_COLOR = 'rgba(95, 91, 83, 0.28)';
export const HIDDEN_EDGE_COLOR = 'rgba(0, 0, 0, 0)';
export const ACCENT_EDGE_COLOR = 'rgba(232, 220, 200, 0.95)';

export const EDGE_STYLES: Record<string, { color: string; size: number }> = {
  wikilink: { color: 'rgba(232, 220, 200, 0.55)', size: 1.8 },
  related: { color: 'rgba(160, 155, 144, 0.40)', size: 1.4 },
};

export const FALLBACK_EDGE_STYLE = {
  color: 'rgba(160, 155, 144, 0.45)',
  size: 1.2,
};

export function edgeStyleFor(linkType: LinkType): { color: string; size: number } {
  return EDGE_STYLES[linkType] ?? FALLBACK_EDGE_STYLE;
}

/**
 * Computes node visual size based on its degree.
 *   size = sqrt(degree) * scale + base
 */
export function nodeSizeForDegree(degree: number): number {
  return Math.sqrt(Math.max(0, degree)) * NODE_DEGREE_SCALE + NODE_BASE_SIZE;
}

/**
 * Returns Sigma settings overrides for the custom node-border + curved-arrow
 * edge programs. Spread into `new Sigma(graph, container, { ...overrides })`.
 *
 * The hosting view is expected to override `defaultDrawNodeLabel` and
 * `defaultDrawNodeHover` with palette-aware, icon-aware versions; the
 * defaults below are minimal stand-ins for embeds that don't.
 */
export function buildSigmaProgramSettings(): Partial<Settings> {
  return {
    defaultNodeType: 'bordered',
    defaultEdgeType: 'arrow',
    nodeProgramClasses: {
      bordered: createNodeBorderProgram({
        borders: [
          // Outer border colour is attribute-driven so per-node reducers
          // can paint a vivid ring on user-highlighted / selected nodes
          // (the reducer sets `borderColor` on the node attributes).
          // Falls back to the muted default so untouched nodes keep their
          // current look.
          {
            color: { attribute: 'borderColor', defaultValue: NODE_BORDER_COLOR },
            size: { value: NODE_BORDER_PIXELS, mode: 'pixels' },
          },
          { color: { attribute: 'color' }, size: { fill: true } },
        ],
      }),
    },
    /** Minimal label fallback — palette-agnostic. */
    defaultDrawNodeLabel: (ctx, data, settings) => {
      if (!data.label) return;
      const size = settings.labelSize;
      ctx.font = `500 ${size}px ${settings.labelFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#EDEDE9';
      ctx.fillText(data.label, data.x, data.y + data.size + 4);
    },
    /** Minimal hover fallback — bold variant of the label. */
    defaultDrawNodeHover: (ctx, data, settings) => {
      if (!data.label) return;
      const size = settings.labelSize;
      ctx.font = `600 ${size}px ${settings.labelFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#EDEDE9';
      ctx.fillText(data.label, data.x, data.y + data.size + 4);
    },
  };
}
