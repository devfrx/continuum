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
    bg: readVar('--graph-bg', '#161616'),
    grid: readVar('--graph-grid', 'rgba(232,220,200,0.03)'),
    labelBg: readVar('--graph-label-bg', '#232323'),
    labelBorder: readVar('--graph-label-border', 'rgba(255,255,255,0.06)'),
    labelFg: readVar('--graph-label-fg', '#EDEDE9'),
    edge: readVar('--graph-edge', 'rgba(160,155,144,0.45)'),
    edgeDim: readVar('--graph-edge-dim', 'rgba(95,91,83,0.28)'),
    edgeFocus: readVar('--graph-edge-focus', 'rgba(232,220,200,0.95)'),
    nodeDim: readVar('--graph-node-dim', '#323232'),
    nodeHidden: readVar('--graph-node-hidden', 'rgba(255,255,255,0.04)'),
    accent: readVar('--accent', '#E8DCC8'),
    accentSoft: readVar('--accent-soft', 'rgba(232,220,200,0.10)'),
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
