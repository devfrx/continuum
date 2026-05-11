/**
 * Wires the per-instance reducers and event callbacks onto a fresh
 * `ForceGraph3DInstance`. Extracted from `Graph3DCanvas.vue` purely to
 * keep the orchestrator shell thin — every callback closes over state
 * supplied via the `bindings` argument so this module stays free of
 * Vue-specific imports.
 */
import type { ForceGraph3DInstance } from '3d-force-graph';
import type { RtLink, RtNode } from './types';
import type { NodeFactoryApi } from './useNodeFactory';

export interface ForceGraphBindings {
  factory: NodeFactoryApi;
  particleColor: () => string;
  onBackgroundClick: () => void;
  onNodeDrag: (node: RtNode) => void;
  onNodeDragEnd: (node: RtNode) => void;
  onNodeHover: (node: RtNode | null) => void;
  onNodeClick: (node: RtNode) => void;
  onNodeRightClick: (node: RtNode, event: MouseEvent) => void;
}

export function wireForceGraphCallbacks(
  instance: ForceGraph3DInstance,
  b: ForceGraphBindings,
): void {
  instance
    .nodeThreeObject((n) => b.factory.makeNodeObject(n as RtNode))
    .nodeThreeObjectExtend(false)
    .nodeVisibility((n) => b.factory.nodeVisible(n as RtNode))
    .nodeColor((n) => b.factory.nodeColorFor(n as RtNode))
    .nodeLabel(() => '') // we draw our own label sprites
    .linkVisibility((l) => b.factory.linkVisible(l as RtLink))
    .linkColor((l) => b.factory.linkColorReducer(l as RtLink))
    .linkOpacity(0.48)
    .linkWidth((l) => b.factory.linkWidthReducer(l as RtLink))
    .linkDirectionalParticles((l) => b.factory.particlesFor(l as RtLink))
    .linkDirectionalParticleWidth(0.9)
    .linkDirectionalParticleSpeed(0.006)
    .linkDirectionalParticleColor(() => b.particleColor())
    .linkDirectionalArrowLength(1.4)
    .linkDirectionalArrowRelPos(0.94)
    .linkDirectionalArrowColor((l) => b.factory.linkColorReducer(l as RtLink))
    .onBackgroundClick(() => b.onBackgroundClick())
    // NOTE: no `onBackgroundRightClick` handler — right-click on empty
    // stage is reserved for OrbitControls pan. The capture-phase
    // `contextmenu` listener still blocks the native browser menu so
    // the right-drag isn't interrupted by an OS popup.
    .onNodeDrag((n) => b.onNodeDrag(n as RtNode))
    .onNodeDragEnd((n) => b.onNodeDragEnd(n as RtNode))
    .onNodeHover((n) => b.onNodeHover((n as RtNode | null) ?? null))
    .onNodeClick((n) => b.onNodeClick(n as RtNode))
    .onNodeRightClick((n, evt) => {
      const me = evt as MouseEvent;
      me.preventDefault?.();
      b.onNodeRightClick(n as RtNode, me);
    });
}

/** Subset of bindings used by the live "refresh after props change" path. */
export function refreshForceGraphReducers(
  instance: ForceGraph3DInstance,
  factory: NodeFactoryApi,
): void {
  instance
    .nodeColor((n) => factory.nodeColorFor(n as RtNode))
    .nodeThreeObject((n) => factory.makeNodeObject(n as RtNode))
    .linkColor((l) => factory.linkColorReducer(l as RtLink))
    .linkWidth((l) => factory.linkWidthReducer(l as RtLink))
    .linkDirectionalParticles((l) => factory.particlesFor(l as RtLink))
    .linkDirectionalArrowColor((l) => factory.linkColorReducer(l as RtLink));
}
