/**
 * Canvas-painted label sprites for the 3D knowledge graph.
 *
 * Two flavours:
 *   - `paintNodeLabel(text, opts)` — the compact name-card sprite shown
 *     above a focused / highlighted / hovered node. Token-driven so the
 *     border, fill, accent rail and text colour all repaint when the
 *     theme palette changes.
 *   - `paintAxisGlyph(text, color)` — the small circular badge used by
 *     the drag-guide axis labels (X/Y/Z) and similar reference markers.
 *
 * Per-instance composable: each canvas owns its own painter. There is
 * no shared atlas — every call mints a fresh CanvasTexture so the
 * caller is responsible for `.dispose()`-ing the resulting sprite via
 * the standard `disposeObject` traversal.
 */
import * as THREE from 'three';
import type { Ref } from 'vue';
import type { GraphPalette } from '@/composables/useGraphPalette';
import { graphDisplayLabel } from '@/utils/graphLabels';
import { cssWithAlpha } from '@/components/graph/colorBridge';

export interface NodeLabelOptions {
  bold?: boolean;
  dim?: boolean;
  accent?: string;
}

export interface LabelSpritePainterApi {
  paintNodeLabel(text: string, opts?: NodeLabelOptions): THREE.Sprite | null;
  paintAxisGlyph(text: string, color: THREE.Color): THREE.Sprite | null;
}

function compactLabel(text: string): string {
  return graphDisplayLabel(text, 34);
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
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
}

export function useLabelSpritePainter(palette: Ref<GraphPalette>): LabelSpritePainterApi {
  const p = (): GraphPalette => palette.value;

  function paintNodeLabel(text: string, opts: NodeLabelOptions = {}): THREE.Sprite | null {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const label = compactLabel(text);
    const fontSize = opts.bold ? 18 : 16;
    const padX = 14;
    const padY = 7;
    const radius = 6;
    const railWidth = opts.bold ? 4 : 3;
    const margin = 6;

    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) return null;
    measure.font = `${opts.bold ? 700 : 600} ${fontSize}px Inter, system-ui, sans-serif`;
    const textW = measure.measureText(label).width;

    const w = Math.ceil(textW + padX * 2 + railWidth + 6);
    const h = Math.ceil(fontSize + padY * 2);
    const cssW = w + margin * 2;
    const cssH = h + margin * 2;

    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(cssW * dpr);
    canvas.height = Math.ceil(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);

    const x = margin;
    const y = margin;
    const accent = opts.accent ?? p().edgeFocus;

    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;
    roundedRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = cssWithAlpha(p().labelBg, opts.bold ? 0.88 : 0.76);
    ctx.fill();
    ctx.shadowColor = 'rgba(0, 0, 0, 0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    roundedRect(ctx, x, y, w, h, radius);
    ctx.lineWidth = opts.bold ? 1.25 : 1;
    ctx.strokeStyle = opts.bold ? p().edgeFocus : p().labelBorder;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + radius, y + 1);
    ctx.lineTo(x + w - radius, y + 1);
    ctx.strokeStyle = cssWithAlpha(p().labelFg, 0.1);
    ctx.lineWidth = 1;
    ctx.stroke();

    roundedRect(ctx, x + 7, y + 6, railWidth, h - 12, railWidth / 2);
    ctx.fillStyle = cssWithAlpha(accent, opts.dim ? 0.45 : 0.95);
    ctx.fill();

    if (opts.bold) {
      ctx.fillStyle = cssWithAlpha(accent, 0.08);
      roundedRect(ctx, x + railWidth + 12, y + 4, w - railWidth - 16, h - 8, radius - 3);
      ctx.fill();
    }

    ctx.font = `${opts.bold ? 700 : 600} ${fontSize}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = p().labelFg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + railWidth + padX + 5, y + h / 2 + 0.5);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: opts.dim ? 0.35 : 1,
      depthWrite: false,
      depthTest: false,
      // Sprites are unlit; keep the card from being washed by scene lights.
      toneMapped: false,
    });
    const sprite = new THREE.Sprite(material);
    // Each CSS px ~= 0.12 graph units. The shadow margin is included.
    sprite.scale.set(cssW * 0.12, cssH * 0.12, 1);
    return sprite;
  }

  function paintAxisGlyph(text: string, color: THREE.Color): THREE.Sprite | null {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = 34;
    const center = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(dpr, dpr);

    const axis = color.getStyle();
    const ink = p().labelFg;
    const shell = cssWithAlpha(p().labelBg, 0.76);
    const glow = cssWithAlpha(axis, 0.18);

    ctx.shadowColor = glow;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(center, center, 13.5, 0, Math.PI * 2);
    ctx.fillStyle = glow;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(center, center, 11.5, 0, Math.PI * 2);
    ctx.fillStyle = shell;
    ctx.fill();

    ctx.lineWidth = 1.15;
    ctx.strokeStyle = cssWithAlpha(axis, 0.78);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(center, center, 15.2, -Math.PI * 0.62, Math.PI * 0.18);
    ctx.strokeStyle = cssWithAlpha(axis, 0.52);
    ctx.lineWidth = 1.5;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(center, center, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = cssWithAlpha(axis, 0.18);
    ctx.fill();

    ctx.font = '700 11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.fillText(text, center, center + 0.35);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    }));
    sprite.scale.set(9, 9, 1);
    sprite.renderOrder = 20;
    return sprite;
  }

  return { paintNodeLabel, paintAxisGlyph };
}
