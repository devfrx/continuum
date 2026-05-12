/**
 * Visual constants and Sigma program factories for the Continuum knowledge
 * graph. The hosting view drives reactive colours through `useGraphPalette`;
 * the constants here are conservative dark-charcoal fallbacks so the
 * package stays usable without the web app's CSS layer.
 */
import { createNodeBorderProgram } from '@sigma/node-border';
import { NodeCircleProgram, createEdgeArrowProgram } from 'sigma/rendering';
import type { Settings } from 'sigma/settings';

export type LinkType = 'wikilink' | 'related' | string;

/**
 * Base node radius (graph units). Kept intentionally modest for dense
 * knowledge graphs: large discs look friendly in tiny demos, but turn
 * real notebooks into a blob once the graph reaches 100+ nodes.
 */
export const NODE_BASE_SIZE = 7.2;
/** Extra radius per edge (sqrt-scaled) so hubs are visible without dominating. */
export const NODE_DEGREE_SCALE = 1.05;

/** Subtle light rim that reads on the dark canvas without overpowering the kind colour. */
export const NODE_BORDER_COLOR = 'rgba(255, 255, 255, 0.18)';
export const NODE_BORDER_PIXELS = 1;

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
  wikilink: { color: 'rgba(232, 220, 200, 0.24)', size: 0.46 },
  related: { color: 'rgba(160, 155, 144, 0.18)', size: 0.38 },
};

export const FALLBACK_EDGE_STYLE = {
  color: 'rgba(160, 155, 144, 0.18)',
  size: 0.38,
};

export function edgeStyleFor(linkType: LinkType): { color: string; size: number } {
  return EDGE_STYLES[linkType] ?? FALLBACK_EDGE_STYLE;
}

/**
 * Computes node visual size. The 2D Knowledge Graph treats every node
 * identically — the only nodes allowed to differ in size are the ones
 * the user explicitly highlights — so this returns the constant
 * `NODE_BASE_SIZE` regardless of the node's degree. The `degree`
 * parameter is kept for API compatibility but ignored.
 */
export function nodeSizeForDegree(_degree: number): number {
  return NODE_BASE_SIZE;
}

/** Outer ring used by the `hollow` node program (no-fill mode). */
export const HOLLOW_BORDER_PIXELS = 2.4;
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
      bordered: NodeCircleProgram,
      // Hollow / outline-only program — used when "Nodi solidi" is OFF.
      // The outer ring carries the kind colour (via `borderColor`) and
      // the inner fill is the canvas background, producing a Roam/Logseq
      // style hollow disc that reads topology over chroma.
      hollow: createNodeBorderProgram({
        borders: [
          {
            color: { attribute: 'borderColor', defaultValue: NODE_BORDER_COLOR },
            size: { value: HOLLOW_BORDER_PIXELS, mode: 'pixels' },
          },
          { color: { attribute: 'color' }, size: { fill: true } },
        ],
      }),
    },
    edgeProgramClasses: {
      // Sigma's default arrow head ratios (length 2.5, wideness 2) render
      // a clean, compact triangular barb that reads against the uniform
      // edge stroke without looking like a wedge.
      arrow: createEdgeArrowProgram({
        lengthToThicknessRatio: 2.5,
        widenessToThicknessRatio: 2,
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
