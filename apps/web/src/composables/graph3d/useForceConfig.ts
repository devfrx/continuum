/**
 * d3-force-3d parameter binding for the running 3D simulation.
 *
 * Two regimes:
 *   - Initial layout: full charge / link / center forces with a
 *     warmup-then-cooldown so the graph settles after `graphData()`.
 *   - Runtime idle: every force zeroed out so user drags do not get
 *     yanked back; the simulation only ticks long enough to render
 *     the next frame.
 *
 * Pure helpers, no Vue lifecycle. Per-instance composable: each canvas
 * gets its own configurator (no shared state).
 */
import type { ForceGraph3DInstance } from '3d-force-graph';
import {
  CHARGE_DISTANCE_MAX,
  CHARGE_DISTANCE_MIN,
  CHARGE_STRENGTH,
  INITIAL_LAYOUT_COOLDOWN_MS,
  INITIAL_LAYOUT_TICKS,
  INITIAL_LAYOUT_WARMUP_TICKS,
  LINK_DISTANCE,
  RUNTIME_RENDER_MS,
  RUNTIME_RENDER_TICKS,
  type CenterForce3D,
  type LinkForce3D,
  type ManyBodyForce3D,
} from './types';

export interface ForceConfigApi {
  /** Apply charge / link / center + warmup so the graph settles. */
  configureInitialLayout(instance: ForceGraph3DInstance): void;
  /** Zero all forces; only tick once per render so drags stay put. */
  configureRuntimeIdle(instance: ForceGraph3DInstance): void;
}

export function useForceConfig(): ForceConfigApi {
  function configureRuntimeIdle(instance: ForceGraph3DInstance): void {
    const charge = instance.d3Force('charge') as unknown as ManyBodyForce3D | undefined;
    charge?.strength(0);

    const link = instance.d3Force('link') as unknown as LinkForce3D | undefined;
    link?.strength(0).iterations(1);

    const center = instance.d3Force('center') as unknown as CenterForce3D | undefined;
    center?.strength(0);

    instance
      .warmupTicks(0)
      .cooldownTicks(RUNTIME_RENDER_TICKS)
      .cooldownTime(RUNTIME_RENDER_MS)
      .d3VelocityDecay(1)
      .d3AlphaDecay(1)
      .d3AlphaMin(0);
  }

  function configureInitialLayout(instance: ForceGraph3DInstance): void {
    const charge = instance.d3Force('charge') as unknown as ManyBodyForce3D | undefined;
    charge
      ?.strength(CHARGE_STRENGTH)
      .distanceMin(CHARGE_DISTANCE_MIN)
      .distanceMax(CHARGE_DISTANCE_MAX)
      .theta(0.9);

    const link = instance.d3Force('link') as unknown as LinkForce3D | undefined;
    link
      ?.distance(LINK_DISTANCE)
      .strength(0.46)
      .iterations(2);

    const center = instance.d3Force('center') as unknown as CenterForce3D | undefined;
    center?.strength(0.08);

    instance
      .numDimensions(3)
      .warmupTicks(INITIAL_LAYOUT_WARMUP_TICKS)
      .cooldownTicks(INITIAL_LAYOUT_TICKS)
      .cooldownTime(INITIAL_LAYOUT_COOLDOWN_MS)
      .d3VelocityDecay(0.62)
      .d3AlphaDecay(0.075)
      .d3AlphaMin(0)
      .onEngineStop(() => configureRuntimeIdle(instance));
  }

  return { configureInitialLayout, configureRuntimeIdle };
}
