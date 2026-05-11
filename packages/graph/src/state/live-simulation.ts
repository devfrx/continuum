/**
 * Live, d3-force-faithful continuous force-directed simulation.
 *
 * Wraps the {@link runTick} integrator in a `requestAnimationFrame`
 * loop and exposes a small handle ({@link LiveSimulationHandle}) that
 * mirrors d3-force's runtime API:
 *
 *   - `pause()` / `resume()` — soft stop without freeing resources.
 *   - `stop()` — `cancelAnimationFrame` + clear state.
 *   - `reheat(strength?)` — d3 `simulation.alpha(1).restart()`.
 *   - `setDragged(id)` — d3 `node.fx`/`node.fy` pinning.
 *   - `setOptions(partial)` — mutate force parameters live, exactly the
 *     d3 pattern of `force.strength(x)` followed by an alpha bump.
 */
import type Graph from 'graphology';
import {
  type EngineState,
  type ForceConfig,
  runTick,
  seedSimulation,
} from './d3-engine.js';

export interface LiveSimulationHandle {
  /** Pause the simulation (e.g. while user is dragging a different surface). */
  pause(): void;
  /** Resume after a pause. */
  resume(): void;
  /** Hard stop — frees the rAF handle. */
  stop(): void;
  /** True while the rAF loop is active and not paused. */
  isRunning(): boolean;
  /** Re-warms the simulation: resets alpha to 1 (d3 `restart()` semantics). */
  reheat(strength?: number): void;
  /** Mark a node as actively dragged (skipped by integration). */
  setDragged(id: string | null): void;
  /**
   * Update force parameters live without restarting the rAF loop. Mirrors
   * d3-force's pattern of mutating `force.strength`, `force.distance`,
   * etc., then calling `simulation.alpha(1).restart()`. Any field omitted
   * is left unchanged.
   */
  setOptions(partial: Partial<LiveSimulationOptions>): void;
}

/**
 * Parameters mirror d3-force's API one-to-one. See:
 *   https://d3js.org/d3-force/simulation
 *   https://d3js.org/d3-force/many-body
 *   https://d3js.org/d3-force/link
 *   https://d3js.org/d3-force/center
 *
 * Defaults are d3's defaults except where the visual scale of the graph
 * (≈ pixel-space coordinates rather than the unit-circle d3 examples)
 * dictates a larger constant — `linkDistance`, `chargeStrength`.
 */
export interface LiveSimulationOptions {
  /**
   * Resting length of every link spring — d3 `link.distance`. Default 120.
   * Obsidian's "Link distance" slider maps to this.
   */
  linkDistance?: number;
  /**
   * Optional override of the link-spring stiffness — d3 `link.strength`.
   * If `undefined`, the d3 default is used:
   *   `1 / Math.min(count(source), count(target))`
   * which keeps hubs stable. Setting a number forces a uniform stiffness.
   * Obsidian's "Link force" slider maps to this.
   */
  linkStrength?: number | null;
  /**
   * Many-body charge — d3 `manyBody.strength`. Negative = repulsion,
   * positive = attraction. Default −400 (Obsidian-like; d3's default is
   * −30 which is appropriate for unit-radius examples only).
   * Obsidian's "Repel force" slider maps to this (with sign flipped).
   */
  chargeStrength?: number;
  /** Many-body `distanceMin`. Default 1, exactly like d3. */
  chargeDistanceMin?: number;
  /** Many-body `distanceMax`. Default Infinity, like d3. */
  chargeDistanceMax?: number;
  /**
   * Per-node centering pull — Obsidian's "Gravity" slider. Applied as a
   * velocity force toward the origin every tick:
   *   `node.vx -= node.x * gravity * alpha`. Default 0.05.
   * This is *not* d3's `forceCenter` (which translates positions to keep
   * the centroid at the origin); it is the same velocity-pull behaviour
   * Obsidian uses so users can dial gravity without distorting layouts.
   */
  gravity?: number;
  /**
   * Recentre the centroid after each tick (d3 `forceCenter` behaviour).
   * Translates positions only — does not affect velocities, so it does
   * not perturb the simulation. Default `true`.
   */
  recenter?: boolean;
  /**
   * Velocity decay (atmospheric friction). After every tick, each
   * velocity is multiplied by `(1 - velocityDecay)`. d3 default 0.4.
   */
  velocityDecay?: number;
  /** Initial alpha (energy). d3 default 1. */
  alpha?: number;
  /** Target alpha (cools toward this value). d3 default 0. */
  alphaTarget?: number;
  /** Stop when alpha falls below this. d3 default 0.001. */
  alphaMin?: number;
  /**
   * Exponential alpha decay rate per tick — d3 default 0.0228, which gives
   * ~300 ticks before reaching alphaMin = 0.001. Obsidian feels exactly
   * like this: ~5 seconds of motion then a stable layout.
   */
  alphaDecay?: number;
  /** Callback after every tick — usually `sigma.refresh({ skipIndexation: true })`. */
  onTick?: () => void;
  /** Callback when the simulation cools below `alphaMin`. */
  onEnd?: () => void;
}

/**
 * Start a live force-directed simulation on `graph`.
 *
 * The returned handle can be paused, reheated, reconfigured or stopped.
 * Pinned / dragged nodes have their velocities zeroed and positions held
 * by the caller — exactly the d3 `node.fx` / `node.fy` convention.
 */
export function startLiveSimulation(
  graph: Graph,
  opts: LiveSimulationOptions = {},
): LiveSimulationHandle {
  // d3-force defaults, adjusted for our pixel-scale coordinate system.
  // All tunables live on `cfg` so `setOptions()` can mutate them at runtime
  // (d3 pattern: mutate force config, then `alpha(1).restart()`).
  const cfg: ForceConfig = {
    linkDistance: opts.linkDistance ?? 120,
    linkStrengthOverride: opts.linkStrength ?? null,
    chargeStrength: opts.chargeStrength ?? -400,
    chargeDistanceMin2: (opts.chargeDistanceMin ?? 1) ** 2,
    chargeDistanceMax2:
      opts.chargeDistanceMax === undefined
        ? Infinity
        : opts.chargeDistanceMax * opts.chargeDistanceMax,
    gravity: opts.gravity ?? 0.05,
    recenter: opts.recenter ?? true,
    velocityDecay: opts.velocityDecay ?? 0.4,
    velocityKeep: 1 - (opts.velocityDecay ?? 0.4),
    alphaTarget: opts.alphaTarget ?? 0,
    alphaMin: opts.alphaMin ?? 0.001,
    alphaDecay: opts.alphaDecay ?? 0.0228,
  };

  const state: EngineState = {
    alpha: opts.alpha ?? 1,
    ended: false,
    states: new Map(),
    draggedId: null,
  };

  let rafId: number | null = null;
  let paused = false;

  seedSimulation(graph, state);

  const tick = (): void => {
    if (paused) {
      rafId = requestAnimationFrame(tick);
      return;
    }

    if (graph.order === 0) {
      opts.onTick?.();
      rafId = requestAnimationFrame(tick);
      return;
    }

    runTick(graph, cfg, state);
    opts.onTick?.();

    // d3 tick step 6: stop when cooled. The user can reheat to restart.
    if (state.alpha < cfg.alphaMin && !state.ended) {
      state.ended = true;
      opts.onEnd?.();
    }

    rafId = requestAnimationFrame(tick);
  };

  rafId = requestAnimationFrame(tick);

  return {
    pause(): void { paused = true; },
    resume(): void { paused = false; },
    stop(): void {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = null;
      state.states.clear();
    },
    isRunning(): boolean { return rafId !== null && !paused; },
    reheat(strength = 1): void {
      // d3 `restart()` semantics: clamp into [alphaMin..1] and resume.
      state.alpha = Math.max(state.alpha, Math.min(1, strength));
      state.ended = false;
    },
    setDragged(id: string | null): void {
      state.draggedId = id;
      // d3-force canonical drag pattern: hold a small `alphaTarget` while
      // a node is being dragged so neighbours respond smoothly to the
      // moving pin, then drop back to 0 on release so the layout cools.
      // Spiking `state.alpha` directly (the previous behaviour) injected a
      // sudden energy burst at click-time that made every node visibly
      // jitter for one frame.
      cfg.alphaTarget = id ? 0.3 : 0;
      if (id) state.ended = false;
    },
    setOptions(partial: Partial<LiveSimulationOptions>): void {
      if (partial.linkDistance !== undefined) cfg.linkDistance = partial.linkDistance;
      if (partial.linkStrength !== undefined) cfg.linkStrengthOverride = partial.linkStrength;
      if (partial.chargeStrength !== undefined) cfg.chargeStrength = partial.chargeStrength;
      if (partial.chargeDistanceMin !== undefined) {
        cfg.chargeDistanceMin2 = partial.chargeDistanceMin ** 2;
      }
      if (partial.chargeDistanceMax !== undefined) {
        cfg.chargeDistanceMax2 = partial.chargeDistanceMax * partial.chargeDistanceMax;
      }
      if (partial.gravity !== undefined) cfg.gravity = partial.gravity;
      if (partial.recenter !== undefined) cfg.recenter = partial.recenter;
      if (partial.velocityDecay !== undefined) {
        cfg.velocityDecay = partial.velocityDecay;
        cfg.velocityKeep = 1 - partial.velocityDecay;
      }
    },
  };
}
