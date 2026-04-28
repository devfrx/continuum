/**
 * Reactive snapshot of the graph-related CSS custom properties.
 *
 * Canvas-based renderers (Sigma 2D, three.js 3D) cannot consume CSS
 * variables directly — they need plain color strings. This composable
 * resolves them once on mount and re-resolves whenever the active
 * theme attribute on `<html>` changes, exposing a reactive ref that
 * components can `watch()` to repaint.
 */

import { onBeforeUnmount, onMounted, shallowRef, type ShallowRef } from 'vue';

export interface GraphPalette {
  bg: string;
  grid: string;
  labelBg: string;
  labelBorder: string;
  labelFg: string;
  edge: string;
  edgeDim: string;
  edgeFocus: string;
  nodeDim: string;
  nodeHidden: string;
  accent: string;
  accentSoft: string;
}

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

function snapshot(): GraphPalette {
  return {
    bg: readVar('--graph-bg', '#faf7f2'),
    grid: readVar('--graph-grid', 'rgba(31,27,22,0.05)'),
    labelBg: readVar('--graph-label-bg', '#ffffff'),
    labelBorder: readVar('--graph-label-border', '#e8e1d5'),
    labelFg: readVar('--graph-label-fg', '#1f1b16'),
    edge: readVar('--graph-edge', 'rgba(120,110,96,0.55)'),
    edgeDim: readVar('--graph-edge-dim', 'rgba(155,144,130,0.22)'),
    edgeFocus: readVar('--graph-edge-focus', 'rgba(201,110,74,0.95)'),
    nodeDim: readVar('--graph-node-dim', '#d9d2c6'),
    nodeHidden: readVar('--graph-node-hidden', 'rgba(31,27,22,0.06)'),
    accent: readVar('--accent', '#c96e4a'),
    accentSoft: readVar('--accent-soft', 'rgba(201,110,74,0.14)'),
  };
}

/**
 * Returns a reactive palette ref that re-snapshots whenever the
 * `data-theme` attribute on `<html>` changes (driven by `useTheme`).
 */
export function useGraphPalette(): ShallowRef<GraphPalette> {
  const palette = shallowRef<GraphPalette>(snapshot());
  let observer: MutationObserver | null = null;

  onMounted(() => {
    palette.value = snapshot();
    observer = new MutationObserver(() => {
      palette.value = snapshot();
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
  });

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
  });

  return palette;
}
