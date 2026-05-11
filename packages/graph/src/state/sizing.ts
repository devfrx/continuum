/**
 * Node sizing + deterministic seed-position helpers for the graph.
 *
 * These are pure utilities consumed by both the static layouts and the
 * live force simulation; they do not depend on any layout library.
 */
import type Graph from 'graphology';
import { nodeSizeForDegree } from '../render.js';

/**
 * Stable hash of an arbitrary string. Used to seed deterministic node
 * positions and per-id jitter so layouts reproduce across reloads.
 */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Restores a deterministic position for a node when layout produced NaN. */
export function seededPosition(id: string): { x: number; y: number } {
  const angle = (hashString(id) % 360) * (Math.PI / 180);
  const radius = (1 + (hashString(id + ':r') % 100) / 20) * 30;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/**
 * Replaces any non-finite node coordinates with a deterministic fallback.
 * Internal helper shared by every layout pass.
 */
export function sanitizePositions(graph: Graph): void {
  graph.forEachNode((id, attrs) => {
    const x = attrs.x as number | undefined;
    const y = attrs.y as number | undefined;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      const fb = seededPosition(id);
      graph.setNodeAttribute(id, 'x', fb.x);
      graph.setNodeAttribute(id, 'y', fb.y);
    }
  });
}

/**
 * Recomputes the `size` attribute of every node from its current degree.
 * Call once after edges are added.
 */
export function applyDegreeSizing(graph: Graph): void {
  graph.forEachNode((id) => {
    const d = graph.degree(id);
    graph.setNodeAttribute(id, 'size', nodeSizeForDegree(d));
    graph.setNodeAttribute(id, 'baseSize', nodeSizeForDegree(d));
  });
}
