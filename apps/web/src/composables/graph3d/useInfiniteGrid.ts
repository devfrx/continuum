/**
 * Infinite ground grid + reference frame (axis rails, axis arrows).
 *
 * The "reference frame" is a single THREE.Group that bundles:
 *   - the radial-fade infinite ground grid (vertex-coloured `LineSegments`)
 *   - thin X / Z floor rails along the cardinal directions
 *   - X / Y / Z arrow helpers anchored at the world origin
 *
 * The composable owns the currently-mounted group, knows how to rebuild
 * it when the palette flips or after data reload (axis length scales
 * with the cluster bounding box), and tears it down on dispose.
 *
 * Per-instance: each canvas owns one frame. No shared state.
 */
import * as THREE from 'three';
import type { Ref } from 'vue';
import type { GraphPalette } from '@/composables/useGraphPalette';
import { cssToThreeColor } from '@/components/graph/colorBridge';
import {
  REFERENCE_AXIS_MAX_LENGTH,
  REFERENCE_AXIS_MIN_LENGTH,
  REFERENCE_FRAME_DIVISIONS,
  REFERENCE_FRAME_SIZE,
  REFERENCE_PLANE_Y,
  type RtNode,
} from './types';
import { disposeObject, finitePositionOf } from './threeUtils';

export interface InfiniteGridApi {
  /** Rebuild the reference frame, swapping it into the supplied scene. */
  refresh(scene: THREE.Scene): void;
  /** Remove the current frame from its scene and dispose all GPU resources. */
  dispose(): void;
}

export interface InfiniteGridOptions {
  palette: Ref<GraphPalette>;
  /** Live view of the runtime nodes — used to scale the axis rails. */
  nodes: () => Iterable<RtNode>;
  nodeCount: () => number;
}

function makeInfiniteGrid(
  size: number,
  divisions: number,
  color: THREE.Color,
): THREE.LineSegments {
  const half = size / 2;
  const step = size / divisions;
  const SUB = 24;
  const subStep = size / SUB;
  const positions: number[] = [];
  const colors: number[] = [];
  const fade = (d: number): number => {
    const t = Math.max(0, Math.min(1, d / half));
    return Math.pow(1 - t, 1.7);
  };
  const push = (x: number, z: number): void => {
    positions.push(x, 0, z);
    const a = fade(Math.hypot(x, z));
    colors.push(color.r * a, color.g * a, color.b * a);
  };
  for (let i = 0; i <= divisions; i++) {
    const v = -half + i * step;
    for (let s = 0; s < SUB; s++) {
      const x0 = -half + s * subStep;
      const x1 = x0 + subStep;
      push(x0, v);
      push(x1, v);
    }
    for (let s = 0; s < SUB; s++) {
      const z0 = -half + s * subStep;
      const z1 = z0 + subStep;
      push(v, z0);
      push(v, z1);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const mat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  });
  return new THREE.LineSegments(geom, mat);
}

function makeAxisRail(
  axis: 'x' | 'z',
  length: number,
  color: THREE.Color,
): THREE.Line {
  const positions = axis === 'x'
    ? new Float32Array([-length, REFERENCE_PLANE_Y + 0.4, 0, length, REFERENCE_PLANE_Y + 0.4, 0])
    : new Float32Array([0, REFERENCE_PLANE_Y + 0.4, -length, 0, REFERENCE_PLANE_Y + 0.4, length]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.055,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.renderOrder = 55;
  line.frustumCulled = false;
  return line;
}

export function useInfiniteGrid(opts: InfiniteGridOptions): InfiniteGridApi {
  let scene: THREE.Scene | null = null;
  let frame: THREE.Group | null = null;

  const p = (): GraphPalette => opts.palette.value;

  function referenceAxisLength(): number {
    let farthest = 0;
    let count = 0;
    for (const node of opts.nodes()) {
      count++;
      const position = finitePositionOf(node);
      if (!position) continue;
      farthest = Math.max(
        farthest,
        Math.abs(position.x),
        Math.abs(position.y - REFERENCE_PLANE_Y),
        Math.abs(position.z),
      );
    }
    const total = opts.nodeCount() || count;
    const countBased = Math.sqrt(Math.max(1, total)) * 54;
    return Math.max(
      REFERENCE_AXIS_MIN_LENGTH,
      Math.min(REFERENCE_AXIS_MAX_LENGTH, Math.max(farthest + 96, countBased)),
    );
  }

  function makeReferenceFrame(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'continuum-reference-frame';
    const axisLength = referenceAxisLength();
    const xColor = cssToThreeColor('#c16f5f');
    const yColor = cssToThreeColor('#b9b2a5');
    const zColor = cssToThreeColor('#6f91b8');
    const grid = makeInfiniteGrid(
      REFERENCE_FRAME_SIZE,
      REFERENCE_FRAME_DIVISIONS,
      cssToThreeColor(p().grid || p().edgeDim),
    );
    grid.position.y = REFERENCE_PLANE_Y;
    grid.renderOrder = -10;
    group.add(grid);
    group.add(makeAxisRail('x', axisLength, xColor));
    group.add(makeAxisRail('z', axisLength, zColor));

    const origin = new THREE.Vector3(0, REFERENCE_PLANE_Y + 0.6, 0);
    const axis = (
      _name: string,
      dir: THREE.Vector3,
      color: THREE.Color,
      length = axisLength,
      opacity = 0.16,
    ): void => {
      const arrow = new THREE.ArrowHelper(dir, origin, length, color, 6, 3.2);
      arrow.renderOrder = 65;
      const lineMat = arrow.line.material as THREE.LineBasicMaterial;
      lineMat.transparent = true;
      lineMat.opacity = opacity;
      lineMat.depthTest = false;
      lineMat.depthWrite = false;
      const coneMat = arrow.cone.material as THREE.MeshBasicMaterial;
      coneMat.transparent = true;
      coneMat.opacity = Math.min(0.28, opacity + 0.08);
      coneMat.depthTest = false;
      coneMat.depthWrite = false;
      arrow.line.renderOrder = 66;
      arrow.cone.renderOrder = 67;
      group.add(arrow);
    };
    axis('X', new THREE.Vector3(1, 0, 0), xColor);
    axis('Y', new THREE.Vector3(0, 1, 0), yColor, Math.min(180, axisLength * 0.38), 0.13);
    axis('Z', new THREE.Vector3(0, 0, 1), zColor);
    return group;
  }

  function refresh(nextScene: THREE.Scene): void {
    if (scene && frame) {
      scene.remove(frame);
      disposeObject(frame);
      frame = null;
    }
    scene = nextScene;
    frame = makeReferenceFrame();
    scene.add(frame);
  }

  function dispose(): void {
    if (scene && frame) {
      scene.remove(frame);
      disposeObject(frame);
    }
    scene = null;
    frame = null;
  }

  return { refresh, dispose };
}
