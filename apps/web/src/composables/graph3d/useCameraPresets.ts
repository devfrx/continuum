/**
 * Imperative camera helpers exposed by `Graph3DCanvas` to its parent.
 *
 * Provides the five toolbar actions:
 *   - `zoom(direction)` — dolly the camera toward / away from the
 *     OrbitControls target,
 *   - `zoomToFit()` — frame all visible nodes,
 *   - `homeView()` — reset to the default 3-quarter angle,
 *   - `viewAlongAxis(axis)` — orbit so the requested axis points at
 *     the camera (X / Y / Z presets, anchored at the world origin),
 *   - `focusNode(id)` — fly to a specific node, preserving the
 *     current viewing direction when possible.
 *
 * Per-instance composable. Reads node positions through a callback so
 * the caller can keep `nodesById` private to the shell.
 */
import * as THREE from 'three';
import type { ShallowRef } from 'vue';
import type { ForceGraph3DInstance } from '3d-force-graph';
import { REFERENCE_PLANE_Y, type AxisKey, type RtNode } from './types';
import { vectorOf } from './threeUtils';

export interface CameraPresetsApi {
  zoom(direction: 1 | -1): void;
  zoomToFit(): void;
  homeView(): void;
  viewAlongAxis(axis: AxisKey): void;
  focusNode(id: string): boolean;
}

export interface CameraPresetsOptions {
  graph: ShallowRef<ForceGraph3DInstance | null>;
  nodesById: Map<string, RtNode>;
  /** Block destructive camera moves while a cascade drag is active. */
  isDragging: () => boolean;
}

export function useCameraPresets(opts: CameraPresetsOptions): CameraPresetsApi {
  function graphCenterAndCameraDistance(): { center: THREE.Vector3; distance: number } {
    if (opts.nodesById.size === 0) {
      return { center: new THREE.Vector3(0, 0, 0), distance: 260 };
    }
    const box = new THREE.Box3();
    for (const node of opts.nodesById.values()) box.expandByPoint(vectorOf(node));
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, 80) * 0.5;
    return { center, distance: Math.max(180, Math.min(900, radius * 3.2)) };
  }

  function zoom(direction: 1 | -1): void {
    const g = opts.graph.value;
    if (!g) return;
    const cam = g.camera() as THREE.PerspectiveCamera;
    const factor = direction === 1 ? 0.78 : 1.28; // closer / farther
    const target = (g.controls() as { target?: THREE.Vector3 } | undefined)?.target
      ?? new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector3().subVectors(cam.position, target);
    dir.multiplyScalar(factor);
    const next = new THREE.Vector3().addVectors(target, dir);
    g.cameraPosition({ x: next.x, y: next.y, z: next.z }, target, 350);
  }

  function zoomToFit(): void {
    opts.graph.value?.zoomToFit(600, 80);
  }

  function homeView(): void {
    const g = opts.graph.value;
    if (!g) return;
    if (opts.isDragging()) return;
    (g.camera() as THREE.PerspectiveCamera).up.set(0, 1, 0);
    const count = Math.max(1, opts.nodesById.size);
    const distance = Math.max(210, Math.min(620, Math.sqrt(count) * 52));
    const target = { x: 0, y: 0, z: 0 };
    g.cameraPosition(
      { x: distance * 0.82, y: distance * 0.48, z: distance * 0.9 },
      target,
      650,
    );
  }

  function viewAlongAxis(axis: AxisKey): void {
    const g = opts.graph.value;
    if (!g || opts.isDragging()) return;
    // Anchor to the world/grid origin so the reference plane appears edge-on
    // for X/Z views and perfectly top-down for Y, regardless of where the
    // node cluster currently drifts.
    const { distance } = graphCenterAndCameraDistance();
    const directions: Record<AxisKey, THREE.Vector3> = {
      x: new THREE.Vector3(1, 0, 0),
      y: new THREE.Vector3(0, 1, 0),
      z: new THREE.Vector3(0, 0, 1),
    };
    const upVectors: Record<AxisKey, THREE.Vector3> = {
      x: new THREE.Vector3(0, 1, 0),
      y: new THREE.Vector3(0, 0, -1),
      z: new THREE.Vector3(0, 1, 0),
    };
    const cam = g.camera() as THREE.PerspectiveCamera;
    cam.up.copy(upVectors[axis]);
    const origin = new THREE.Vector3(0, REFERENCE_PLANE_Y, 0);
    const next = origin.clone().add(directions[axis].clone().multiplyScalar(distance));
    const target = { x: origin.x, y: origin.y, z: origin.z };
    g.cameraPosition({ x: next.x, y: next.y, z: next.z }, target, 650);
  }

  function focusNode(id: string): boolean {
    const g = opts.graph.value;
    const node = opts.nodesById.get(id);
    if (!g || !node || opts.isDragging()) return false;
    const targetVector = vectorOf(node);
    const target = { x: targetVector.x, y: targetVector.y, z: targetVector.z };
    const cam = g.camera() as THREE.PerspectiveCamera;
    const currentDirection = new THREE.Vector3().subVectors(cam.position, targetVector);
    const direction = currentDirection.lengthSq() > 1
      ? currentDirection.normalize()
      : new THREE.Vector3(0.74, 0.42, 0.52).normalize();
    const distance = 96;
    const next = targetVector.clone().add(direction.multiplyScalar(distance));
    g.cameraPosition({ x: next.x, y: next.y, z: next.z }, target, 650);
    return true;
  }

  return { zoom, zoomToFit, homeView, viewAlongAxis, focusNode };
}
