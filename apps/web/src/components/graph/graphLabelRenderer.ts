/**
 * Sigma label/hover canvas painters for the 2D Knowledge Graph view.
 *
 * Why these live inside `defaultDrawNodeLabel` rather than `afterRender`:
 *   - Sigma calls the label callback once per node with `data.x/y/size`
 *     **already transformed** into the labels-canvas coordinate system.
 *     The same x/y produces correctly-anchored text below the node,
 *     so reusing it for the icon guarantees pixel-perfect alignment
 *     under any pan, zoom, drag or HiDPI configuration.
 *   - Hooking `afterRender` and converting graph→viewport ourselves was
 *     producing icons that drifted away from nodes during interaction.
 *
 * Background nodes have `data.label` cleared by the reducer, so the
 * icon and pill appear only for focus, search matches and highlights.
 */
import type { Sigma } from '@continuum/graph';
import type { GraphPalette } from '@/composables/useGraphPalette';
import type { AppIconName as IconName } from '@/assets/icons';
import { getIconImage } from './iconRasterizer';
import { graphDisplayLabel } from '@/utils/graphLabels';

export type NodeRenderData = {
  label?: string;
  x: number;
  y: number;
  size: number;
  kind?: string;
  color?: string;
  highlighted?: boolean;
  dimmed?: boolean;
  showIcon?: boolean;
  showLabel?: boolean;
};
export type RenderSettings = { labelSize: number; labelFont: string };
export type NodeRenderFn = (
  ctx: CanvasRenderingContext2D,
  data: NodeRenderData,
  settings: RenderSettings,
) => void;

export interface LabelRendererContext {
  palette: GraphPalette;
  iconOf(kind: string): IconName;
}

/**
 * Draw the kind icon centred on the node, then a card-style label
 * pill below it. Hover variant additionally paints a soft accent
 * halo around the node so the focus is unmistakeable without burying
 * the glyph.
 */
function drawIconAndLabel(
  ctx: CanvasRenderingContext2D,
  data: NodeRenderData,
  settings: RenderSettings,
  img: HTMLImageElement | null,
  variant: 'label' | 'hover',
  pal: GraphPalette,
): void {
  const isHover = variant === 'hover';

  // Hover halo — soft accent ring that frames the node without covering
  // the icon. Drawn under the icon so the glyph stays crisp on top.
  if (isHover) {
    const r = data.size + 4;
    const grad = ctx.createRadialGradient(data.x, data.y, data.size * 0.6, data.x, data.y, r * 1.4);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.55, pal.accentSoft);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.arc(data.x, data.y, r * 1.4, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Crisp 1px accent ring exactly on the node edge.
    ctx.beginPath();
    ctx.arc(data.x, data.y, data.size + 1.5, 0, Math.PI * 2);
    ctx.lineWidth = 1.25;
    ctx.strokeStyle = pal.edgeFocus;
    ctx.stroke();
  }

  if (data.showIcon && img && data.size >= 6) {
    const px = data.size * 1.15;
    const half = px / 2;
    ctx.drawImage(img, data.x - half, data.y - half, px, px);
  }
  if (!data.showLabel || !data.label) return;

  const label = graphDisplayLabel(data.label, isHover ? 40 : 30);
  if (!label) return;

  const weight = isHover ? '600' : '500';
  const fontPx = settings.labelSize;
  ctx.font = `${weight} ${fontPx}px ${settings.labelFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Smoother text rendering for the pill labels under each node.
  // `textRendering: geometricPrecision` lets the browser pick the
  // higher-quality rasterizer (Direct2D / CoreText), and the explicit
  // image-smoothing flags guarantee bilinear filtering for the icon
  // glyphs drawn just above. Both are no-ops on engines that ignore
  // them, so the fallback is the same baseline antialiasing as before.
  (ctx as CanvasRenderingContext2D & { textRendering?: string }).textRendering =
    'geometricPrecision';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const padX = 8;
  const padY = 4;
  const radius = 6;
  const textW = ctx.measureText(label).width;
  const w = Math.ceil(textW + padX * 2);
  const h = Math.ceil(fontPx + padY * 2);
  // Snap the pill to integer device pixels so the rounded-rect strokes
  // stay crisp instead of being blurred across two columns/rows.
  const x = Math.round(data.x - w / 2);
  const y = Math.round(data.y + data.size + 6);
  const labelX = Math.round(data.x);
  const labelY = Math.round(y + h / 2);

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fillStyle = pal.labelBg;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = isHover ? pal.edgeFocus : pal.labelBorder;
  ctx.stroke();

  ctx.fillStyle = pal.labelFg;
  ctx.fillText(label, labelX, labelY);
}

/**
 * Label renderer — called for every node that needs a visible label.
 * Dimmed nodes are background dots: no icon, no pill.
 */
export function makeLabelRenderer(sigma: Sigma, getCtx: () => LabelRendererContext): NodeRenderFn {
  const refresh = (): void => {
    sigma.refresh({ skipIndexation: true });
  };
  return (ctx, data, settings) => {
    if (data.dimmed || (!data.showLabel && !data.showIcon)) return;
    const lc = getCtx();
    const kind = String(data.kind ?? 'custom');
    const img = getIconImage(lc.iconOf(kind), refresh);
    drawIconAndLabel(ctx, data, settings, img, 'label', lc.palette);
  };
}

/**
 * Hover renderer — called for the single hovered node on the
 * `hovers` canvas. Sigma's default draws an opaque white circle
 * that buries the icon; we replace it with a soft accent halo +
 * the same icon/label pair so the glyph survives the hover state.
 */
export function makeHoverRenderer(sigma: Sigma, getCtx: () => LabelRendererContext): NodeRenderFn {
  const refresh = (): void => {
    sigma.refresh({ skipIndexation: true });
  };
  return (ctx, data, settings) => {
    const lc = getCtx();
    const kind = String(data.kind ?? 'custom');
    const img = getIconImage(lc.iconOf(kind), refresh);
    drawIconAndLabel(ctx, { ...data, showIcon: true }, settings, img, 'hover', lc.palette);
  };
}
