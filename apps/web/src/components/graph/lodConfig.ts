/**
 * Level-of-detail (LOD) thresholds for the Knowledge Graph view.
 *
 * The renderer collapses the visual scene into three tiers based on a
 * single monotonic "density" signal:
 *
 *   - `near` — full detail (labels, halos, edges, prominent ring).
 *   - `mid`  — hide non-focus / non-search labels; edges still drawn.
 *   - `far`  — labels off (except hovered/selected), background edges
 *              hidden, prominent halos suppressed; nodes only.
 *
 * Tunable in one place so designers can iterate without grepping the
 * reducers.
 *
 * 2D signal:
 *   `density = nodeCount * max(1, camera.ratio)`
 *   — `camera.ratio` grows as the user zooms out. This way a small
 *   graph viewed from far away can still trip the `far` tier, while
 *   a large graph at native zoom climbs through `mid` → `far` as the
 *   node budget grows.
 *
 * 3D signal:
 *   `density = nodeCount`
 *   — `3d-force-graph` already culls labels at distance via sprite
 *   shrinking; node-count is the dominant FPS pressure on the WebGL
 *   pipeline, so we pin LOD to the dataset size only.
 */

export type LodTier = 'near' | 'mid' | 'far';

/** Below this density the renderer paints every detail. */
export const LOD_MID_THRESHOLD = 220;
/** At or above this density, the renderer drops labels + bg edges. */
export const LOD_FAR_THRESHOLD = 600;

/** How often (ms) the 2D camera-driven LOD recompute is allowed to run. */
export const LOD_RECOMPUTE_THROTTLE_MS = 33; // ~30fps

export function computeLodTier(density: number): LodTier {
  if (!Number.isFinite(density) || density <= 0) return 'near';
  if (density >= LOD_FAR_THRESHOLD) return 'far';
  if (density >= LOD_MID_THRESHOLD) return 'mid';
  return 'near';
}

/** 2D density: nodeCount × zoom-out factor (camera.ratio clamped ≥ 1). */
export function lodDensity2D(nodeCount: number, cameraRatio: number): number {
  const ratio = Number.isFinite(cameraRatio) && cameraRatio > 0 ? cameraRatio : 1;
  return nodeCount * Math.max(1, ratio);
}

/** 3D density: nodeCount only (camera distance varies wildly — see header). */
export function lodDensity3D(nodeCount: number): number {
  return nodeCount;
}
