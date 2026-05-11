/**
 * Cascade drag-to-move with parent/child propagation.
 *
 * When the user drags a node, the BFS-derived neighbour subtree follows
 * along — but each child node stays no further from its parent than its
 * original distance plus a depth-scaled slack budget. This keeps a
 * cluster cohesive instead of letting children stretch to infinity.
 *
 * Responsibilities:
 *   - capture per-node snapshots when the drag starts (origin position
 *     + fixed-position state + traversal depth + tether budget),
 *   - re-pin every snapshotted node each tick using the live dragged
 *     node's position as the cascade root,
 *   - apply axis-lock constraints sourced from `useAxisLockKeyboard`,
 *   - drive the drag-guide gizmo (show / update / clear),
 *   - restore each node's fixed-position state on release,
 *   - reheat the simulation just enough to render the next frame.
 *
 * Per-instance composable. No module-level state.
 */
import * as THREE from 'three';
import type { ShallowRef } from 'vue';
import type { ForceGraph3DInstance } from '3d-force-graph';
import {
  CASCADE_TETHER_DEPTH_SLACK,
  CASCADE_TETHER_SLACK,
  type AxisKey,
  type CascadeDragNodeSnapshot,
  type CascadeDragSession,
  type CascadeDragTraversal,
  type PositionSnapshot,
  type RtNode,
} from './types';
import {
  constrainPositionToAxis,
  dragFixedPositionSnapshot,
  dragOriginFor,
  dragOriginSnapshot,
  fixedPositionSnapshot,
  positionSnapshot,
  restoreFixedPosition,
  setNodePosition,
  vectorOf,
} from './threeUtils';
import type { DragGuideApi } from './useDragGuide';

export interface DragCascadeApi {
  /** Active drag session id, or null when idle. */
  draggedId(): string | null;
  /** Force-graph `onNodeDrag` handler. */
  onDrag(node: RtNode): void;
  /** Force-graph `onNodeDragEnd` handler. */
  onDragEnd(node: RtNode): void;
  /** Release any pending drag (used on data reload or unmount). */
  release(): void;
  /** Re-apply axis-lock + cascade against the current dragged node. */
  refreshActive(): void;
  /** Re-enable navigation controls after the next microtask. */
  restoreNavigationControlsSoon(): void;
}

export interface DragCascadeOptions {
  graph: ShallowRef<ForceGraph3DInstance | null>;
  nodesById: Map<string, RtNode>;
  axisLock: () => AxisKey | null;
  configureRuntimeIdle: (instance: ForceGraph3DInstance) => void;
  dragGuide: DragGuideApi;
}

export function useDragCascade(opts: DragCascadeOptions): DragCascadeApi {
  let session: CascadeDragSession | null = null;

  function requestPositionRender(): void {
    opts.graph.value?.d3ReheatSimulation();
  }

  function restoreNavigationControlsSoon(): void {
    window.setTimeout(() => opts.graph.value?.enableNavigationControls(true), 0);
  }

  function applyActiveAxisLockToDraggedNode(node: RtNode): void {
    if (!session) return;
    const lock = opts.axisLock();
    if (!lock) return;
    const current = positionSnapshot(node);
    const constrained = constrainPositionToAxis(current, session.origin, lock);
    setNodePosition(node, constrained, true);
  }

  function connectedDepthsFrom(root: RtNode): Map<string, CascadeDragTraversal> {
    const depths = new Map<string, CascadeDragTraversal>([[root.id, {
      depth: 0,
      parentId: null,
      tetherLength: 0,
    }]]);
    const queue: RtNode[] = [root];
    for (let index = 0; index < queue.length; index++) {
      const current = queue[index];
      const currentTraversal = depths.get(current.id);
      if (!currentTraversal) continue;
      for (const neighborId of current.neighbors) {
        if (depths.has(neighborId)) continue;
        const neighbor = opts.nodesById.get(neighborId);
        if (!neighbor) continue;
        depths.set(neighborId, {
          depth: currentTraversal.depth + 1,
          parentId: current.id,
          tetherLength: vectorOf(current).distanceTo(vectorOf(neighbor)),
        });
        queue.push(neighbor);
      }
    }
    return depths;
  }

  function beginCascadeDrag(node: RtNode): void {
    releaseInternal();
    if (opts.graph.value) {
      opts.graph.value.enableNavigationControls(false);
      opts.configureRuntimeIdle(opts.graph.value);
    }
    const depths = connectedDepthsFrom(node);
    const snapshots = new Map<string, CascadeDragNodeSnapshot>();

    for (const [id, traversal] of depths) {
      const current = opts.nodesById.get(id);
      if (!current) continue;
      snapshots.set(id, {
        position: id === node.id ? dragOriginSnapshot(node) : positionSnapshot(current),
        fixed: id === node.id ? dragFixedPositionSnapshot(current) : fixedPositionSnapshot(current),
        depth: traversal.depth,
        parentId: traversal.parentId,
        tetherLength: traversal.tetherLength,
      });
    }

    const origin = snapshots.get(node.id)?.position ?? positionSnapshot(node);
    session = {
      draggedId: node.id,
      origin: new THREE.Vector3(origin.x, origin.y, origin.z),
      nodes: snapshots,
    };
  }

  function applyCascadeDrag(node: RtNode): void {
    if (!session) return;
    const nextPositions = new Map<string, PositionSnapshot>();
    nextPositions.set(node.id, positionSnapshot(node));

    const orderedSnapshots = [...session.nodes.entries()].sort((a, b) => a[1].depth - b[1].depth);
    for (const [id, snapshot] of orderedSnapshots) {
      const currentNode = opts.nodesById.get(id);
      if (!currentNode) continue;
      if (id === node.id || !snapshot.parentId) {
        const currentPosition = positionSnapshot(currentNode);
        nextPositions.set(id, currentPosition);
        setNodePosition(currentNode, currentPosition, true);
        continue;
      }

      const parentPosition = nextPositions.get(snapshot.parentId);
      if (!parentPosition) continue;

      const base = new THREE.Vector3(snapshot.position.x, snapshot.position.y, snapshot.position.z);
      const parent = new THREE.Vector3(parentPosition.x, parentPosition.y, parentPosition.z);
      const parentToBase = new THREE.Vector3().subVectors(base, parent);
      const distance = parentToBase.length();
      const slack = CASCADE_TETHER_SLACK + snapshot.depth * CASCADE_TETHER_DEPTH_SLACK;
      const maxDistance = snapshot.tetherLength + slack;

      if (distance <= maxDistance || distance <= 0.001) {
        nextPositions.set(id, snapshot.position);
        setNodePosition(currentNode, snapshot.position, true);
        continue;
      }

      const constrained = parent.clone().add(parentToBase.normalize().multiplyScalar(maxDistance));
      const next: PositionSnapshot = {
        x: constrained.x,
        y: constrained.y,
        z: constrained.z,
      };
      nextPositions.set(id, next);
      setNodePosition(currentNode, next, true);
    }
  }

  function maintainCascadeDrag(node: RtNode): void {
    if (session?.draggedId !== node.id) beginCascadeDrag(node);
    applyActiveAxisLockToDraggedNode(node);
    applyCascadeDrag(node);
  }

  function releaseInternal(draggedNode?: RtNode): void {
    if (!session) return;
    const node = draggedNode ?? opts.nodesById.get(session.draggedId);
    if (node) {
      applyActiveAxisLockToDraggedNode(node);
      applyCascadeDrag(node);
    }
    const finishing = session;
    session = null;

    for (const [id, snapshot] of finishing.nodes) {
      const current = opts.nodesById.get(id);
      if (!current) continue;
      restoreFixedPosition(current, snapshot.fixed);
    }
    requestPositionRender();
  }

  function onDrag(node: RtNode): void {
    maintainCascadeDrag(node);
    const scene = opts.graph.value?.scene();
    if (scene && !opts.dragGuide.isActive()) {
      opts.dragGuide.show(scene, dragOriginFor(node));
    }
    if (opts.dragGuide.isActive()) {
      opts.dragGuide.update(vectorOf(node));
    }
    requestPositionRender();
  }

  function onDragEnd(node: RtNode): void {
    releaseInternal(node);
    restoreNavigationControlsSoon();
    opts.dragGuide.clear();
  }

  function refreshActive(): void {
    if (!session) return;
    const node = opts.nodesById.get(session.draggedId);
    if (!node) return;
    applyActiveAxisLockToDraggedNode(node);
    applyCascadeDrag(node);
    const scene = opts.graph.value?.scene();
    if (scene && !opts.dragGuide.isActive()) {
      opts.dragGuide.show(scene, dragOriginFor(node));
    }
    if (opts.dragGuide.isActive()) opts.dragGuide.update(vectorOf(node));
    requestPositionRender();
  }

  return {
    draggedId: () => session?.draggedId ?? null,
    onDrag,
    onDragEnd,
    release: () => releaseInternal(),
    refreshActive,
    restoreNavigationControlsSoon,
  };
}
