/**
 * Visual constants and Sigma program factories for the Continuum knowledge
 * graph. Colors are tuned to the warm cream / terracotta palette defined in
 * `apps/web/src/styles.css`.
 */
import { createNodeBorderProgram } from '@sigma/node-border';
import type { Settings } from 'sigma/settings';

export type LinkType = 'wikilink' | 'related' | string;

/**
 * Base node radius (graph units). Bumped from 9 → 14 so the dots read at
 * a glance on the cream background and labels sit comfortably below them.
 */
export const NODE_BASE_SIZE = 20;
/** Extra radius per edge (sqrt-scaled) so hubs are visibly larger. */
export const NODE_DEGREE_SCALE = 3.2;

/** Soft warm border keeps each node legible against the cream canvas. */
export const NODE_BORDER_COLOR = 'rgba(31, 27, 22, 0.22)';
export const NODE_BORDER_PIXELS = 1.5;

/**
 * Dim and hidden colors are intentionally OPAQUE warm-beige tones so they
 * blend with the cream canvas without ever revealing a white pixel.
 * `DIM_NODE_COLOR` is a soft taupe used when something else is focused.
 * `HIDDEN_NODE_COLOR` is even softer — used in focus mode and for filtered
 * kinds — but still on-palette.
 */
export const DIM_NODE_COLOR = '#D9D2C6';
export const HIDDEN_NODE_COLOR = '#EBE4D6';

export const DIM_EDGE_COLOR = 'rgba(120, 110, 96, 0.35)';
export const HIDDEN_EDGE_COLOR = 'rgba(155, 144, 130, 0.10)';
export const ACCENT_EDGE_COLOR = 'rgba(201, 110, 74, 0.95)';

export const EDGE_STYLES: Record<string, { color: string; size: number }> = {
  wikilink: { color: 'rgba(201, 110, 74, 0.85)', size: 2.2 },
  related: { color: 'rgba(120, 110, 96, 0.65)', size: 1.6 },
};

export const FALLBACK_EDGE_STYLE = {
  color: 'rgba(120, 110, 96, 0.55)',
  size: 1.4,
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
 */
export function buildSigmaProgramSettings(): Partial<Settings> {
  return {
    defaultNodeType: 'bordered',
    defaultEdgeType: 'arrow',
    nodeProgramClasses: {
      bordered: createNodeBorderProgram({
        borders: [
          { color: { value: NODE_BORDER_COLOR }, size: { value: NODE_BORDER_PIXELS, mode: 'pixels' } },
          { color: { attribute: 'color' }, size: { fill: true } },
        ],
      }),
    },
    /**
     * Custom label renderer — clean text without the default white pill.
     * Sits below the node, uses the warm dark-brown brand color, and bumps
     * weight slightly when highlighted.
     */
    defaultDrawNodeLabel: (ctx, data, settings) => {
      if (!data.label) return;
      const size = settings.labelSize;
      const weight = data.highlighted ? '600' : '500';
      ctx.font = `${weight} ${size}px ${settings.labelFont}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#3a342c';
      ctx.fillText(data.label, data.x, data.y + data.size + 4);
    },
    /**
     * Custom hover renderer — draws a clean **card** (rounded rectangle
     * with a soft shadow) underneath the label of the focused node.
     *
     * We deliberately do NOT redraw the label text here: Sigma calls
     * `defaultDrawNodeLabel` for the same node on the same frame, and
     * drawing the text twice produced the "double vision / blurry" look
     * the user reported. The card sits behind that native text, giving
     * the focused node an Obsidian-style chip without any glow halo.
     */
    defaultDrawNodeHover: (ctx, data, settings) => {
      if (!data.label) return;

      const fontSize = settings.labelSize;
      ctx.font = `600 ${fontSize}px ${settings.labelFont}`;
      const metrics = ctx.measureText(data.label);
      const padX = 10;
      const padY = 5;
      const w = metrics.width + padX * 2;
      const h = fontSize + padY * 2;
      const x = data.x - w / 2;
      const y = data.y + data.size + 2;
      const r = Math.min(8, h / 2);

      // Rounded-rect path.
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();

      // Crisp card: warm cream fill, terracotta border. No blur, no glow.
      ctx.fillStyle = '#FBF7EE';
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(201, 110, 74, 0.55)';
      ctx.stroke();

      // Bold label centered inside the card.
      ctx.fillStyle = '#1f1b16';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(data.label, data.x, y + h / 2 + 0.5);
    },
  };
}
