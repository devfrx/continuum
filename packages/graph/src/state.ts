/**
 * Layout helpers and graph utilities for the Continuum knowledge graph.
 *
 * Layouts:
 *   - `runForceLayout`: ForceAtlas2 (good general-purpose).
 *   - `runCircularLayout`: graphology-layout `circular`. Useful for an
 *     "exploded" overview where overlap matters less than legibility.
 *   - `runNoverlap`: post-pass that resolves any remaining node overlaps.
 */
import type Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { circular } from 'graphology-layout';
import noverlap from 'graphology-layout-noverlap';
import { nodeSizeForDegree } from './render.js';

/** Restores a deterministic position for a node when layout produced NaN. */
export function seededPosition(id: string): { x: number; y: number } {
  const angle = (hashString(id) % 360) * (Math.PI / 180);
  const radius = (1 + (hashString(id + ':r') % 100) / 20) * 30;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function sanitizePositions(graph: Graph): void {
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

export function runForceLayout(graph: Graph, iterations = 200): void {
  if (graph.order < 2) return;
  forceAtlas2.assign(graph, {
    iterations,
    settings: {
      gravity: 1,
      scalingRatio: 10,
      slowDown: 1,
      barnesHutOptimize: graph.order > 200,
      strongGravityMode: false,
      linLogMode: false,
    },
  });
  sanitizePositions(graph);
}

export function runCircularLayout(graph: Graph): void {
  if (graph.order < 2) return;
  circular.assign(graph, { scale: Math.max(80, graph.order * 6) });
  sanitizePositions(graph);
}

/**
 * Post-pass that nudges nodes apart so circles never overlap. Cheap on small
 * graphs; capped at 50 iterations so it stays interactive on large ones.
 */
export function runNoverlap(graph: Graph): void {
  if (graph.order < 2) return;
  noverlap.assign(graph, {
    maxIterations: 50,
    settings: {
      margin: 4,
      ratio: 1.05,
      speed: 3,
    },
  });
  sanitizePositions(graph);
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

/** 1-hop neighbourhood (incl. node) and connecting edge ids. */
export function highlightNeighbors(
  graph: Graph,
  nodeId: string,
): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  if (!graph.hasNode(nodeId)) return { nodes, edges };
  nodes.add(nodeId);
  graph.forEachNeighbor(nodeId, (n) => nodes.add(n));
  graph.forEachEdge(nodeId, (eid, _a, source, target) => {
    edges.add(eid);
    nodes.add(source);
    nodes.add(target);
  });
  return { nodes, edges };
}

// ---------- Live simulation (Obsidian-style continuous spring physics) ----------

export interface LiveSimulationHandle {
  /** Pause the simulation (e.g. while user is dragging a different surface). */
  pause(): void;
  /** Resume after a pause. */
  resume(): void;
  /** Hard stop — frees the rAF handle. */
  stop(): void;
  /** True while the rAF loop is active and not paused. */
  isRunning(): boolean;
  /** Re-warms the simulation: gives every node a small kick of energy. */
  reheat(strength?: number): void;
  /** Mark a node as actively dragged (skipped by integration). */
  setDragged(id: string | null): void;
}

export interface LiveSimulationOptions {
  /**
  * Link force ("rubber band" stiffness) - Obsidian's "Link force".
  * Per-edge attractive spring strength. Default 0.038.
   */
  linkStrength?: number;
  /** Natural rest distance for edges. Obsidian "Link distance". Default 68. */
  linkDistance?: number;
  /**
   * Repel force — Obsidian "Repel force". Negative means push apart.
   * Applied as `repelStrength / (dist*dist)` and capped at `repelMaxDist`.
  * Default 360: enough spacing to breathe without pushing small graphs to the edges.
   */
  repelStrength?: number;
  /**
   * Distance beyond which repulsion is ignored. Mimics Obsidian/d3-force
   * Barnes-Hut θ-cutoff and prevents far nodes from moving the world.
  * Default 220.
   */
  repelMaxDist?: number;
  /**
   * Center force — gentle pull toward origin. Kept very small by default
   * (≈0) because users dislike nodes "snapping back" after they drag
   * something out of place. The graph is still kept on-screen via a
   * tiny per-frame centroid nudge inside the integration loop, which
   * doesn't create a visible "attraction to center".
   */
  centerStrength?: number;
  /**
  * Velocity decay (friction). d3-force default is 0.4 -> keep 60% of v.
  * Higher = more friction, smoother, less jitter. Default 0.64.
   */
  velocityDecay?: number;
  /** Hard clamp on per-frame displacement (graph units). Default 3.0. */
  maxStep?: number;
  /** Callback after every frame — usually `sigma.refresh({ skipIndexation: true })`. */
  onTick?: () => void;
  /**
   * Baseline alpha — force multiplier that NEVER fully decays. Keeps the
  * simulation gently alive forever. Kept low (default 0.045) so motion
   * is a barely-perceptible breathing rather than a return-to-center.
   */
  alphaTarget?: number;
  /** Tiny centroid nudge that keeps the cluster framed without snap-back. Default 0.01. */
  centroidStrength?: number;
}

interface NodeState {
  vx: number;
  vy: number;
}

/**
 * Obsidian-style continuous force-directed simulation on rAF.
 *
 * Modelled after d3-force's `forceManyBody` + `forceLink` + `forceCenter`:
 *   1. Repulsion: F = α · repelStrength / d²   (capped at `repelMaxDist`).
 *   2. Link spring: F = α · (d − linkDistance) · linkStrength,
 *      with strength normalised by min(deg(source), deg(target)) so hubs
 *      don't get torn apart.
 *   3. Center force: F = α · centerStrength · (−position) — gentle pull
 *      back to origin after we re-center the centroid each frame.
 *   4. Integration: v ← (v + F) · (1 − velocityDecay); x ← x + clamp(v).
 *   5. Pinned / dragged nodes: velocity zeroed, position frozen.
 *   6. Alpha stays at `alphaTarget` (no auto-sleep) — gentle perpetual
 *      motion like Obsidian's graph view. Reheat() temporarily boosts α.
 */
export function startLiveSimulation(
  graph: Graph,
  opts: LiveSimulationOptions = {},
): LiveSimulationHandle {
  const linkStrength = opts.linkStrength ?? 0.038;
  const linkDistance = opts.linkDistance ?? 68;
  const repelStrength = opts.repelStrength ?? 360;
  const repelMaxDist = opts.repelMaxDist ?? 220;
  const repelMaxDist2 = repelMaxDist * repelMaxDist;
  // Per-node center pull — disabled by default. The previous 0.04 created
  // a visible "return to origin" after every drag, which the user found
  // annoying. Centroid framing is now handled by a much gentler nudge.
  const centerStrength = opts.centerStrength ?? 0;
  const velocityDecay = opts.velocityDecay ?? 0.64;
  const velocityKeep = 1 - velocityDecay;
  const maxStep = opts.maxStep ?? 3.0;
  // Very low baseline α: keeps the graph subtly alive without enough
  // energy to noticeably move nodes back after a drag.
  const alphaTarget = opts.alphaTarget ?? 0.045;
  const alphaDecay = 0.04; // per-frame decay of the *transient* boost on top of alphaTarget
  const centroidStrength = opts.centroidStrength ?? 0.01;

  const states = new Map<string, NodeState>();
  let rafId: number | null = null;
  let paused = false;
  let draggedId: string | null = null;
  /** Current force multiplier; floor = alphaTarget so motion never freezes. */
  let alpha = 1;

  function ensureState(id: string): NodeState {
    let s = states.get(id);
    if (!s) {
      s = { vx: 0, vy: 0 };
      states.set(id, s);
    }
    return s;
  }

  // Seed: ensure every node has a finite position.
  graph.forEachNode((id, attrs) => {
    if (!Number.isFinite(attrs.x) || !Number.isFinite(attrs.y)) {
      const fb = seededPosition(id);
      graph.setNodeAttribute(id, 'x', fb.x);
      graph.setNodeAttribute(id, 'y', fb.y);
    }
    ensureState(id);
  });

  // Reheat: temporarily boost α so the next few frames have stronger forces.
  function reheatImpl(strength = 1): void {
    alpha = Math.min(1.5, alpha + strength);
  }
  reheatImpl(0.6); // small initial nudge so motion is visible right away

  const tick = (): void => {
    if (paused) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    // Snapshot positions & sync state for any new nodes.
    const ids: string[] = [];
    const xs: Float64Array = new Float64Array(graph.order);
    const ys: Float64Array = new Float64Array(graph.order);
    let i = 0;
    graph.forEachNode((id, attrs) => {
      ids.push(id);
      xs[i] = Number(attrs.x) || 0;
      ys[i] = Number(attrs.y) || 0;
      ensureState(id);
      i += 1;
    });

    const n = ids.length;
    if (n === 0) {
      opts.onTick?.();
      rafId = requestAnimationFrame(tick);
      return;
    }

    // Force accumulators.
    const fxs = new Float64Array(n);
    const fys = new Float64Array(n);

    // Pre-compute per-node degree for link strength normalisation.
    const degrees = new Int32Array(n);
    const idxOf = new Map<string, number>();
    for (let k = 0; k < n; k++) {
      idxOf.set(ids[k], k);
      degrees[k] = graph.degree(ids[k]);
    }

    // 1. Pairwise repulsion — F = α · S / d², capped beyond `repelMaxDist`.
    //    O(n²); fine for typical KBs (hundreds of nodes). Switch to
    //    Barnes-Hut quadtree if/when graphs grow past ~1k.
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        let dx = xs[a] - xs[b];
        let dy = ys[a] - ys[b];
        let d2 = dx * dx + dy * dy;
        if (d2 > repelMaxDist2) continue;
        if (d2 < 1) {
          // Avoid singularity & extreme spikes when nodes overlap.
          const jx = (Math.random() - 0.5) * 0.5;
          const jy = (Math.random() - 0.5) * 0.5;
          dx += jx; dy += jy;
          d2 = Math.max(1, dx * dx + dy * dy);
        }
        const f = (repelStrength * alpha) / d2;
        const inv = 1 / Math.sqrt(d2);
        const fx = dx * inv * f;
        const fy = dy * inv * f;
        fxs[a] += fx; fys[a] += fy;
        fxs[b] -= fx; fys[b] -= fy;
      }
    }

    // 2. Spring (link) attraction — strength normalised by min-degree so
    //    high-degree hubs don't get yanked around by every neighbour.
    graph.forEachEdge((_eid, _attrs, source, target) => {
      const sa = idxOf.get(source);
      const ta = idxOf.get(target);
      if (sa === undefined || ta === undefined) return;
      const dx = xs[ta] - xs[sa];
      const dy = ys[ta] - ys[sa];
      const dist = Math.hypot(dx, dy) || 0.01;
      const bias = 1 / Math.max(1, Math.min(degrees[sa], degrees[ta]));
      const force = (dist - linkDistance) * linkStrength * bias * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      fxs[sa] += fx; fys[sa] += fy;
      fxs[ta] -= fx; fys[ta] -= fy;
    });

    // 3. Centroid framing — apply only a tiny fraction of the centroid
    //    offset each frame instead of snapping the centroid to (0,0).
    //    Snapping made every drag look like "all nodes drift back to
    //    center"; a 1.5%/frame nudge keeps the cluster on-screen without
    //    visibly tugging on the user's placement.
    let cx = 0, cy = 0;
    for (let k = 0; k < n; k++) { cx += xs[k]; cy += ys[k]; }
    cx /= n; cy /= n;
    for (let k = 0; k < n; k++) {
      xs[k] -= cx * centroidStrength;
      ys[k] -= cy * centroidStrength;
      if (centerStrength > 0) {
        fxs[k] -= xs[k] * centerStrength * alpha;
        fys[k] -= ys[k] * centerStrength * alpha;
      }
    }

    // 4. Integrate velocities + positions, clamp step, freeze the
    //    actively-dragged node so the cursor owns its position.
    for (let k = 0; k < n; k++) {
      const id = ids[k];
      const state = states.get(id)!;
      if (id === draggedId) {
        state.vx = 0; state.vy = 0;
        // Still write back the centroid-nudged position so the dragged
        // node travels with the cluster instead of drifting away from it.
        graph.setNodeAttribute(id, 'x', xs[k]);
        graph.setNodeAttribute(id, 'y', ys[k]);
        continue;
      }
      let vx = (state.vx + fxs[k]) * velocityKeep;
      let vy = (state.vy + fys[k]) * velocityKeep;

      // Clamp huge jumps.
      if (vx > maxStep) vx = maxStep;
      else if (vx < -maxStep) vx = -maxStep;
      if (vy > maxStep) vy = maxStep;
      else if (vy < -maxStep) vy = -maxStep;

      state.vx = vx;
      state.vy = vy;
      graph.setNodeAttribute(id, 'x', xs[k] + vx);
      graph.setNodeAttribute(id, 'y', ys[k] + vy);
    }

    // 5. Decay any transient α boost back toward the perpetual baseline.
    if (alpha > alphaTarget) {
      alpha = Math.max(alphaTarget, alpha - alphaDecay);
    } else if (alpha < alphaTarget) {
      alpha = alphaTarget;
    }

    opts.onTick?.();
    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return {
    pause(): void { paused = true; },
    resume(): void { paused = false; },
    stop(): void {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      states.clear();
    },
    isRunning(): boolean { return rafId !== null && !paused; },
    reheat(strength = 1): void { reheatImpl(strength); },
    setDragged(id: string | null): void {
      draggedId = id;
      // Intentionally NO reheat on drag start/end — the user wants nodes
      // to stay where they're dropped, not to settle back via fresh energy.
    },
  };
}
