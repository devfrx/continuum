/**
 * Shared types and tunable constants for the 3D knowledge-graph canvas.
 *
 * Extracted from `Graph3DCanvas.vue` so the per-concern composables under
 * `@/composables/graph3d/*` can share runtime models without re-importing
 * the shell.
 */
import type * as THREE from 'three';
import type { GraphEdge, GraphNode } from '@continuum/shared';

export type AxisKey = 'x' | 'y' | 'z';
export type CoordinateSnapshot = Partial<Record<AxisKey, number>>;
export type PositionSnapshot = Record<AxisKey, number>;

export interface FixedPositionSnapshot {
  fx: number | undefined;
  fy: number | undefined;
  fz: number | undefined;
}

export interface RtNode extends GraphNode {
  /** Pre-computed neighbour set so reducers stay O(1) per frame. */
  neighbors: Set<string>;
  inDegree: number;
  outDegree: number;
  wikilinkCount: number;
  relatedCount: number;
  // Force-graph mutates these at runtime:
  x?: number; y?: number; z?: number;
  fx?: number; fy?: number; fz?: number;
  __initialPos?: CoordinateSnapshot;
  __initialFixedPos?: FixedPositionSnapshot;
}

export interface RtLink {
  source: string | RtNode;
  target: string | RtNode;
  type: string;
  sourceKind?: GraphEdge['sourceKind'];
  propertyKey?: string | null;
}

export interface GraphObject3D extends THREE.Object3D {
  __graphObjType?: 'node' | 'link';
  __data?: RtNode | RtLink;
}

export interface CascadeDragNodeSnapshot {
  position: PositionSnapshot;
  fixed: FixedPositionSnapshot;
  depth: number;
  parentId: string | null;
  tetherLength: number;
}

export interface CascadeDragTraversal {
  depth: number;
  parentId: string | null;
  tetherLength: number;
}

export interface CascadeDragSession {
  draggedId: string;
  origin: THREE.Vector3;
  nodes: Map<string, CascadeDragNodeSnapshot>;
}

// ---------- d3-force-3d minimal interfaces (kept from original) ----------

export interface ManyBodyForce3D {
  strength(value: number): ManyBodyForce3D;
  distanceMin(value: number): ManyBodyForce3D;
  distanceMax(value: number): ManyBodyForce3D;
  theta(value: number): ManyBodyForce3D;
}

export interface LinkForce3D {
  distance(value: number): LinkForce3D;
  strength(value: number): LinkForce3D;
  iterations(value: number): LinkForce3D;
}

export interface CenterForce3D {
  strength(value: number): CenterForce3D;
}

// ---------- Scene tunables ----------

export const REFERENCE_FRAME_SIZE = 4000;
export const REFERENCE_FRAME_DIVISIONS = 200;
export const REFERENCE_PLANE_Y = 0;
export const REFERENCE_AXIS_MIN_LENGTH = 160;
export const REFERENCE_AXIS_MAX_LENGTH = 900;

export const INITIAL_LAYOUT_COOLDOWN_MS = 2800;
export const INITIAL_LAYOUT_TICKS = 220;
export const INITIAL_LAYOUT_WARMUP_TICKS = 80;
export const RUNTIME_RENDER_TICKS = 1;
export const RUNTIME_RENDER_MS = 260;

export const CHARGE_STRENGTH = -68;
export const CHARGE_DISTANCE_MIN = 7;
export const CHARGE_DISTANCE_MAX = 180;
export const LINK_DISTANCE = 44;

export const CASCADE_TETHER_SLACK = 18;
export const CASCADE_TETHER_DEPTH_SLACK = 5;

export const DRAG_GUIDE_AXIS_LENGTH = 48;
export const DRAG_GUIDE_ACTIVE_THRESHOLD = 2.5;

export const AXIS_LOCK_KEYS: Record<string, AxisKey> = {
  x: 'x',
  y: 'y',
  z: 'z',
};

export const NODE_BASE_R = 2.4;
export const NODE_DEGREE_SCALE = 0.82;
