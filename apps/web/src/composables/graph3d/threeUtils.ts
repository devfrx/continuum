/**
 * Tiny THREE.js helpers shared by the 3D graph composables.
 *
 * Pure functions, no module-level state. Extracted from the original
 * `Graph3DCanvas.vue` so each composable can dispose its own resources
 * the same way without duplicating the traversal logic.
 */
import * as THREE from 'three';
import type {
  AxisKey,
  FixedPositionSnapshot,
  PositionSnapshot,
  RtNode,
} from './types';

/** Coerce a possibly-undefined / non-finite numeric to 0. */
export function numberOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function vectorOf(node: RtNode): THREE.Vector3 {
  return new THREE.Vector3(numberOrZero(node.x), numberOrZero(node.y), numberOrZero(node.z));
}

export function dragOriginFor(node: RtNode): THREE.Vector3 {
  const initial = node.__initialPos;
  return new THREE.Vector3(
    numberOrZero(initial?.x ?? node.x),
    numberOrZero(initial?.y ?? node.y),
    numberOrZero(initial?.z ?? node.z),
  );
}

export function positionSnapshot(node: RtNode): PositionSnapshot {
  return {
    x: numberOrZero(node.x),
    y: numberOrZero(node.y),
    z: numberOrZero(node.z),
  };
}

export function dragOriginSnapshot(node: RtNode): PositionSnapshot {
  const initial = node.__initialPos;
  return {
    x: numberOrZero(initial?.x ?? node.x),
    y: numberOrZero(initial?.y ?? node.y),
    z: numberOrZero(initial?.z ?? node.z),
  };
}

export function fixedPositionSnapshot(node: RtNode): FixedPositionSnapshot {
  return { fx: node.fx, fy: node.fy, fz: node.fz };
}

export function dragFixedPositionSnapshot(node: RtNode): FixedPositionSnapshot {
  return node.__initialFixedPos
    ? { ...node.__initialFixedPos }
    : fixedPositionSnapshot(node);
}

export function restoreFixedPosition(node: RtNode, snapshot: FixedPositionSnapshot): void {
  if (snapshot.fx === undefined) delete node.fx;
  else node.fx = snapshot.fx;
  if (snapshot.fy === undefined) delete node.fy;
  else node.fy = snapshot.fy;
  if (snapshot.fz === undefined) delete node.fz;
  else node.fz = snapshot.fz;
}

export function setNodePosition(node: RtNode, position: PositionSnapshot, fixed: boolean): void {
  node.x = position.x;
  node.y = position.y;
  node.z = position.z;
  if (!fixed) return;
  node.fx = position.x;
  node.fy = position.y;
  node.fz = position.z;
}

export function finitePositionOf(node: Pick<RtNode, 'x' | 'y' | 'z'>): PositionSnapshot | null {
  if (
    typeof node.x !== 'number' || !Number.isFinite(node.x)
    || typeof node.y !== 'number' || !Number.isFinite(node.y)
    || typeof node.z !== 'number' || !Number.isFinite(node.z)
  ) return null;
  return { x: node.x, y: node.y, z: node.z };
}

export function constrainPositionToAxis(
  position: PositionSnapshot,
  origin: THREE.Vector3,
  axis: AxisKey,
): PositionSnapshot {
  return {
    x: axis === 'x' ? position.x : origin.x,
    y: axis === 'y' ? position.y : origin.y,
    z: axis === 'z' ? position.z : origin.z,
  };
}

export function linkIdOf(end: string | RtNode): string {
  return typeof end === 'string' ? end : end.id;
}

export function disposeMaterial(material: THREE.Material | THREE.Material[] | undefined): void {
  if (!material) return;
  const materials = Array.isArray(material) ? material : [material];
  for (const item of materials) {
    const texture = (item as THREE.SpriteMaterial).map;
    texture?.dispose?.();
    item.dispose();
  }
}

export function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const renderable = child as THREE.Object3D & {
      geometry?: { dispose?: () => void };
      material?: THREE.Material | THREE.Material[];
    };
    renderable.geometry?.dispose?.();
    disposeMaterial(renderable.material);
  });
}


