/**
 * Per-node Three.js object factory + visibility / colour reducers for
 * the 3D knowledge-graph canvas.
 *
 * Each node is rendered as a small THREE.Group containing:
 *   - a MeshStandardMaterial sphere (the "neuron"),
 *   - a soft additive halo on focus or selection,
 *   - a torus accent ring on user-highlight or selection,
 *   - an `ElevationGuide` child when the node is the current
 *     interaction target (hover / selection / drag),
 *   - a label sprite painted by `useLabelSpritePainter` whenever the
 *     node should display its name (focus, neighbour-of-focus, search
 *     match, persistent highlight).
 *
 * Reducers honour the same dimming semantics as the 2D Sigma view: a
 * non-empty search query OR a focused node fades everything else to
 * the palette's `nodeDim` colour (and links to `edgeDim`).
 *
 * Per-instance composable. No module-level state.
 */
import * as THREE from 'three';
import type { Ref } from 'vue';
import type { GraphPalette } from '@/composables/useGraphPalette';
import { graphDisplayLabel } from '@/utils/graphLabels';
import { cssToThreeColor, cssWithAlpha } from '@/components/graph/colorBridge';
import {
  NODE_BASE_R,
  NODE_DEGREE_SCALE,
  type GraphObject3D,
  type RtLink,
  type RtNode,
} from './types';
import { linkIdOf } from './threeUtils';
import type { ElevationGuideApi } from './useElevationGuide';
import type { LabelSpritePainterApi } from './useLabelSpritePainter';
import type { LodTier } from '@/components/graph/lodConfig';

export interface NodeFactoryProps {
  hiddenKinds: Set<string>;
  highlightedIds: Set<string>;
  searchQuery: string;
  selectedId: string | null;
  colorOf: (kind: string) => string;
  /** Current LOD tier; controls label-sprite + halo creation up-front. */
  lodTier: LodTier;
}

export interface NodeFactoryOptions {
  palette: Ref<GraphPalette>;
  hoveredId: Ref<string | null>;
  nodesById: Map<string, RtNode>;
  draggedId: () => string | null;
  elevationGuide: ElevationGuideApi;
  labelPainter: LabelSpritePainterApi;
  /** Snapshot reader: returns a fresh view of relevant props each call. */
  props: () => NodeFactoryProps;
}

export interface NodeFactoryApi {
  nodeVisible(node: RtNode): boolean;
  linkVisible(link: RtLink): boolean;
  nodeColorFor(node: RtNode): string;
  linkColorReducer(link: RtLink): string;
  linkWidthReducer(link: RtLink): number;
  particlesFor(link: RtLink): number;
  makeNodeObject(node: RtNode): THREE.Object3D;
}

export function useNodeFactory(opts: NodeFactoryOptions): NodeFactoryApi {
  const p = (): GraphPalette => opts.palette.value;
  const highlightColor = (): THREE.Color => cssToThreeColor(p().accent || '#e8dcc8');

  function radiusFor(node: RtNode): number {
    return Math.sqrt(Math.max(0, node.inDegree + node.outDegree)) * NODE_DEGREE_SCALE
      + NODE_BASE_R;
  }

  function linkColorFor(link: RtLink): string {
    if (link.sourceKind === 'relationProperty') return p().edge;
    // Direct links are primary — use the accent/focus colour so they stand out.
    return p().accent || (link.type === 'wikilink' ? p().edgeFocus : p().edge);
  }

  function focusedId(): string | null {
    return opts.hoveredId.value ?? opts.props().selectedId;
  }

  function nodeVisible(node: RtNode): boolean {
    return !opts.props().hiddenKinds.has(node.kind);
  }

  function linkVisible(link: RtLink): boolean {
    const s = opts.nodesById.get(linkIdOf(link.source));
    const t = opts.nodesById.get(linkIdOf(link.target));
    if (!s || !t) return false;
    if (!nodeVisible(s) || !nodeVisible(t)) return false;
    // LOD `far` — hide every background link; the focus subgraph still
    // survives because the focused node id matches the source/target
    // here only when a focus exists, in which case the surviving links
    // are filtered by `force-graph` itself via `linkVisibility`.
    if (opts.props().lodTier === 'far') {
      const f = focusedId();
      if (!f) return false;
      return linkIdOf(link.source) === f || linkIdOf(link.target) === f;
    }
    return true;
  }

  function isFocused(id: string): boolean {
    return focusedId() === id;
  }

  function isNeighborOfFocus(id: string): boolean {
    const f = focusedId();
    if (!f) return false;
    const focus = opts.nodesById.get(f);
    return !!focus && focus.neighbors.has(id);
  }

  function isSearchMatch(node: RtNode): boolean {
    const q = opts.props().searchQuery.trim().toLowerCase();
    if (!q) return false;
    return node.label.toLowerCase().includes(q)
      || graphDisplayLabel(node.label).toLowerCase().includes(q);
  }

  function isInteractionTarget(node: RtNode): boolean {
    return opts.hoveredId.value === node.id
      || opts.props().selectedId === node.id
      || opts.draggedId() === node.id;
  }

  function shouldShowNodeLabel(node: RtNode): boolean {
    const props = opts.props();
    const hasQuery = props.searchQuery.trim().length > 0;
    const tier = props.lodTier;
    const isTarget = isInteractionTarget(node);
    // LOD `far` — only the actively hovered / selected / dragged node
    // keeps its label sprite (avoids per-frame allocation churn at
    // dense scales).
    if (tier === 'far') return isTarget;
    // LOD `mid` — drop neighbour-of-focus labels; keep target,
    // persistent highlight, and search matches.
    if (tier === 'mid') {
      return isTarget
        || props.highlightedIds.has(node.id)
        || (hasQuery && isSearchMatch(node));
    }
    return isTarget
      || props.highlightedIds.has(node.id)
      || (focusedId() !== null && isNeighborOfFocus(node.id))
      || (hasQuery && isSearchMatch(node));
  }

  function nodeColorFor(node: RtNode): string {
    const props = opts.props();
    const hasQuery = props.searchQuery.trim().length > 0;
    if (hasQuery && !isSearchMatch(node)) return p().nodeDim;
    if (focusedId() && !(isFocused(node.id) || isNeighborOfFocus(node.id))
      && !props.highlightedIds.has(node.id)) {
      return p().nodeDim;
    }
    return props.colorOf(node.kind);
  }

  /**
   * Whether the node should render at full intensity (saturated
   * colour, normal halo + label). Anything else is "dimmed" — used to
   * drive both sphere material and label opacity.
   */
  function isNodePrimary(node: RtNode): boolean {
    const props = opts.props();
    const hasQuery = props.searchQuery.trim().length > 0;
    if (hasQuery && !isSearchMatch(node)) return false;
    const f = focusedId();
    if (f && !(isFocused(node.id) || isNeighborOfFocus(node.id))
      && !props.highlightedIds.has(node.id)) return false;
    return true;
  }

  function linkColorReducer(link: RtLink): string {
    const sId = linkIdOf(link.source);
    const tId = linkIdOf(link.target);
    const f = focusedId();
    const relationLink = link.sourceKind === 'relationProperty';
    if (f) {
      if (sId === f || tId === f) return relationLink ? p().edgeFocus : (p().accent || p().edgeFocus);
      return p().edgeDim;
    }
    return cssWithAlpha(linkColorFor(link), relationLink ? 0.14 : 0.32);
  }

  function linkWidthReducer(link: RtLink): number {
    const sId = linkIdOf(link.source);
    const tId = linkIdOf(link.target);
    const f = focusedId();
    const relationLink = link.sourceKind === 'relationProperty';
    if (f && (sId === f || tId === f)) return relationLink ? 1.0 : 1.55;
    return relationLink ? 0.18 : 0.38;
  }

  function particlesFor(link: RtLink): number {
    const f = focusedId();
    if (!f) return 0;
    const sId = linkIdOf(link.source);
    const tId = linkIdOf(link.target);
    if (sId !== f && tId !== f) return 0;
    return link.sourceKind === 'relationProperty' ? 2 : 4;
  }

  function makeNodeObject(node: RtNode): THREE.Object3D {
    const props = opts.props();
    const group = new THREE.Group() as GraphObject3D;
    group.__graphObjType = 'node';
    group.__data = node;
    const r = radiusFor(node);
    // Sphere colour respects search + focus dimming so the node
    // visually fades alongside its links when off-target.
    const color = new THREE.Color(nodeColorFor(node));
    const isHighlighted = props.highlightedIds.has(node.id);
    const focus = focusedId();
    const isFocus = focus === node.id;
    const isSelectedMarker = props.selectedId === node.id && !isFocus;
    const isFocusNeighbor = isNeighborOfFocus(node.id);
    const isPrimary = isNodePrimary(node);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(r, 24, 16),
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity: isFocus
          ? 0.42
          : isSelectedMarker ? 0.28
            : isFocusNeighbor ? 0.2
              : isHighlighted ? 0.24 : 0.08,
        metalness: 0.08,
        roughness: 0.48,
      }),
    );
    if (isFocus) sphere.scale.setScalar(1.2);
    else if (isSelectedMarker) sphere.scale.setScalar(1.1);
    group.add(sphere);

    // Soft additive halo: strong for real focus, quieter for plain selection.
    if (isFocus || isSelectedMarker) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(r * (isFocus ? 1.55 : 1.42), 24, 18),
        new THREE.MeshBasicMaterial({
          color: highlightColor(),
          transparent: true,
          opacity: isFocus ? 0.16 : 0.1,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      group.add(halo);
    }

    // Persistent user-highlight ring (cream accent torus).
    if (isHighlighted || isSelectedMarker) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r * 1.4, 0.4, 12, 48),
        new THREE.MeshBasicMaterial({ color: highlightColor() }),
      );
      ring.rotation.x = Math.PI / 2;
      group.add(ring);
    }

    if (isInteractionTarget(node)) {
      group.add(opts.elevationGuide.create(
        r,
        isFocus || isSelectedMarker || opts.draggedId() === node.id,
      ));
    }

    if (shouldShowNodeLabel(node)) {
      const sprite = opts.labelPainter.paintNodeLabel(node.label || '(untitled)', {
        bold: isFocus || isSelectedMarker,
        dim: !isPrimary && !isFocus && !isSelectedMarker,
        accent: isFocus || isSelectedMarker || isHighlighted
          ? p().edgeFocus
          : props.colorOf(node.kind),
      });
      if (sprite) {
        sprite.position.set(0, r + 3.1, 0);
        sprite.renderOrder = 10;
        group.add(sprite);
      }
    }

    return group;
  }

  return {
    nodeVisible,
    linkVisible,
    nodeColorFor,
    linkColorReducer,
    linkWidthReducer,
    particlesFor,
    makeNodeObject,
  };
}
