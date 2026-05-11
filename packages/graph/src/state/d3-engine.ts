/**
 * Internal d3-force-faithful tick engine for the live graph simulation.
 *
 * This module owns the per-tick numerical work — many-body (charge),
 * link spring, gravity, velocity decay, position update and optional
 * `forceCenter` recentre — exactly mirroring d3-force's tick algorithm
 * (https://d3js.org/d3-force/simulation#simulation_tick).
 *
 * It is deliberately NOT exported from the package's public barrel:
 * consumers should drive the engine through {@link startLiveSimulation}
 * in `live-simulation.ts`. Splitting the loop owner from the integrator
 * keeps the public surface small while letting both modules stay under
 * the project's per-file size budget.
 */
import type Graph from 'graphology';
import { seededPosition } from './sizing.js';

/**
 * Resolved, mutable simulation parameters. Fields mirror d3-force's API
 * one-to-one (with `chargeDistanceMin/Max` pre-squared for the inner
 * loop). `LiveSimulationHandle.setOptions` mutates an instance of this
 * in place — the same pattern d3 uses when you call
 * `force.distance(x).strength(y)` and then `simulation.alpha(1).restart()`.
 */
export interface ForceConfig {
  linkDistance: number;
  linkStrengthOverride: number | null;
  chargeStrength: number;
  /** Pre-squared `distanceMin` for the O(n²) charge inner loop. */
  chargeDistanceMin2: number;
  /** Pre-squared `distanceMax`; `Infinity` disables the cutoff. */
  chargeDistanceMax2: number;
  gravity: number;
  recenter: boolean;
  velocityDecay: number;
  /** Cached `(1 - velocityDecay)` so the inner loop does one fewer subtract. */
  velocityKeep: number;
  alphaTarget: number;
  alphaMin: number;
  alphaDecay: number;
}

/** Per-node integrator state — the d3 `node.vx` / `node.vy` pair. */
export interface NodeState {
  vx: number;
  vy: number;
}

/** Mutable per-simulation state shared across ticks. */
export interface EngineState {
  /** Current alpha (energy). Mutated by `runTick`. */
  alpha: number;
  /** True once alpha has crossed `alphaMin` and `onEnd` has fired. */
  ended: boolean;
  /** Per-node velocity store. Keys are node ids. */
  states: Map<string, NodeState>;
  /** Node id currently held by the user (skipped by integration), or `null`. */
  draggedId: string | null;
}

/**
 * Tiny deterministic jiggle used to break overlap singularities,
 * mirroring d3-force's internal `jiggle()` helper.
 */
export function jiggle(): number {
  return (Math.random() - 0.5) * 1e-6;
}

/**
 * Ensures every node has a finite position and a velocity entry.
 * Call once before the first `runTick` and any time new nodes appear.
 */
export function seedSimulation(graph: Graph, state: EngineState): void {
  graph.forEachNode((id, attrs) => {
    if (!Number.isFinite(attrs.x) || !Number.isFinite(attrs.y)) {
      const fb = seededPosition(id);
      graph.setNodeAttribute(id, 'x', fb.x);
      graph.setNodeAttribute(id, 'y', fb.y);
    }
    if (!state.states.has(id)) {
      state.states.set(id, { vx: 0, vy: 0 });
    }
  });
}

/**
 * Run a single d3-force tick over `graph`, mutating node positions in
 * place. Returns the new alpha value.
 *
 * d3 tick order
 *   1. alpha += (alphaTarget - alpha) * alphaDecay
 *   2. For each registered force, mutate node.vx/vy directly.
 *      - manyBody (charge):   F = strength * alpha / dist²
 *      - link spring:         F = (dist - linkDistance) * strength * alpha,
 *                             with bias = src.count / (src.count + tgt.count)
 *      - gravity (pos pull):  node.vx -= node.x * gravity * alpha
 *   3. After all forces: vx *= (1 - velocityDecay); vy *= (1 - velocityDecay)
 *   4. Position update:    x += vx; y += vy
 *   5. Optional `forceCenter`: translate every position so the mean is (0,0).
 *      Does *not* touch velocity → no oscillation, no drift.
 */
export function runTick(graph: Graph, cfg: ForceConfig, state: EngineState): number {
  // Snapshot positions once per tick — cheaper than reading attrs in the
  // O(n²) inner loop.
  const ids: string[] = [];
  const xs = new Float64Array(graph.order);
  const ys = new Float64Array(graph.order);
  let i = 0;
  graph.forEachNode((id, attrs) => {
    ids.push(id);
    xs[i] = Number(attrs.x) || 0;
    ys[i] = Number(attrs.y) || 0;
    if (!state.states.has(id)) state.states.set(id, { vx: 0, vy: 0 });
    i += 1;
  });
  const n = ids.length;
  if (n === 0) return state.alpha;

  // Velocity arrays — mutated in place per d3 semantics.
  const vxs = new Float64Array(n);
  const vys = new Float64Array(n);
  const idxOf = new Map<string, number>();
  for (let k = 0; k < n; k++) {
    idxOf.set(ids[k], k);
    const st = state.states.get(ids[k])!;
    vxs[k] = st.vx;
    vys[k] = st.vy;
  }

  // Pre-compute per-node link counts (d3 `count(node)` = #links touching it).
  const counts = new Int32Array(n);
  graph.forEachEdge((_eid, _a, source, target) => {
    const sa = idxOf.get(source);
    const ta = idxOf.get(target);
    if (sa === undefined || ta === undefined) return;
    counts[sa] += 1;
    counts[ta] += 1;
  });

  // ── d3 tick step 1: advance alpha ────────────────────────────────────
  state.alpha += (cfg.alphaTarget - state.alpha) * cfg.alphaDecay;
  const alpha = state.alpha;

  // ── d3 tick step 2: apply each force (mutates vxs/vys directly) ──────

  // (a) Many-body (charge) force — d3 `forceManyBody`.
  //     F = strength * alpha / dist²   (Coulomb-like).
  //     For repulsion (strength < 0), `node.vx += dx * F` pushes node
  //     AWAY from `other` because dx = other.x - node.x and F < 0.
  //     Naive O(n²) pair scan; fast enough for ≤ ~1500 nodes at 60fps.
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      let dx = xs[b] - xs[a];
      let dy = ys[b] - ys[a];
      let l = dx * dx + dy * dy;
      if (l > cfg.chargeDistanceMax2) continue;
      if (l < cfg.chargeDistanceMin2) {
        if (l === 0) { dx = jiggle(); dy = jiggle(); }
        l = cfg.chargeDistanceMin2;
      }
      // d3 source: w = strength * alpha / l   (l = squared distance).
      const w = (cfg.chargeStrength * alpha) / l;
      vxs[a] += dx * w;
      vys[a] += dy * w;
    }
  }

  // (b) Link force — d3 `forceLink`.
  //     dx = (target.x + target.vx) - (source.x + source.vx)   // peek-ahead
  //     l  = (length(d) - linkDistance) / length(d) * alpha * strength
  //     bias = source.count / (source.count + target.count)
  graph.forEachEdge((_eid, _attrs, source, target) => {
    const sa = idxOf.get(source);
    const ta = idxOf.get(target);
    if (sa === undefined || ta === undefined) return;
    let dx = xs[ta] + vxs[ta] - xs[sa] - vxs[sa];
    let dy = ys[ta] + vys[ta] - ys[sa] - vys[sa];
    let len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) {
      dx = jiggle(); dy = jiggle();
      len = Math.sqrt(dx * dx + dy * dy);
    }
    const stiffness =
      cfg.linkStrengthOverride ?? 1 / Math.min(counts[sa] || 1, counts[ta] || 1);
    const l = ((len - cfg.linkDistance) / len) * alpha * stiffness;
    const bias = (counts[sa] || 1) / ((counts[sa] || 1) + (counts[ta] || 1));
    dx *= l;
    dy *= l;
    vxs[ta] -= dx * bias;
    vys[ta] -= dy * bias;
    vxs[sa] += dx * (1 - bias);
    vys[sa] += dy * (1 - bias);
  });

  // (c) Gravity — Obsidian-style position pull toward origin via velocity.
  //     This is *not* d3 `forceCenter` (that one mutates positions, not
  //     velocity, applied separately in step 5). It IS the velocity-pull
  //     pattern used in d3 `forceX`/`forceY`:
  //         node.vx -= node.x * gravity * alpha
  if (cfg.gravity > 0) {
    const k = cfg.gravity * alpha;
    for (let p = 0; p < n; p++) {
      vxs[p] -= xs[p] * k;
      vys[p] -= ys[p] * k;
    }
  }

  // ── d3 tick step 3+4: damp velocity, then advance position. ──────────
  for (let p = 0; p < n; p++) {
    const id = ids[p];
    const st = state.states.get(id)!;
    if (id === state.draggedId) {
      // Dragged node behaves like d3's pinned `fx`/`fy`: zero velocity,
      // position is owned by the caller (mouse).
      st.vx = 0;
      st.vy = 0;
      continue;
    }
    const vx = vxs[p] * cfg.velocityKeep;
    const vy = vys[p] * cfg.velocityKeep;
    st.vx = vx;
    st.vy = vy;
    graph.setNodeAttribute(id, 'x', xs[p] + vx);
    graph.setNodeAttribute(id, 'y', ys[p] + vy);
  }

  // ── d3 tick step 5: forceCenter — translate to keep the centroid
  //     at the origin without injecting energy.
  if (cfg.recenter && n > 0) {
    let sx = 0, sy = 0;
    graph.forEachNode((_id, a) => {
      sx += Number(a.x) || 0;
      sy += Number(a.y) || 0;
    });
    sx /= n;
    sy /= n;
    if (Math.abs(sx) > 1e-6 || Math.abs(sy) > 1e-6) {
      graph.forEachNode((id) => {
        if (id === state.draggedId) return; // don't yank what the user is holding
        graph.setNodeAttribute(id, 'x', (Number(graph.getNodeAttribute(id, 'x')) || 0) - sx);
        graph.setNodeAttribute(id, 'y', (Number(graph.getNodeAttribute(id, 'y')) || 0) - sy);
      });
    }
  }

  return state.alpha;
}
