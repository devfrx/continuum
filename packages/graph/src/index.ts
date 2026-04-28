import Graph from 'graphology';
import type { GraphEdge, GraphNode } from '@continuum/shared';
import {
  applyDegreeSizing,
  runForceLayout,
  runNoverlap,
  seededPosition,
} from './state.js';
import {
  edgeStyleFor,
  NODE_BASE_SIZE,
} from './render.js';

/**
 * Legacy color map. The web app now reads colors from the `useKinds`
 * composable; this remains a safe fallback for embedders without one.
 */
const KIND_COLORS: Record<string, string> = {
  note: '#8C7B6A',
  character: '#C96E4A',
  race: '#7A9E7E',
  class: '#D4A24C',
  location: '#5B7B95',
  item: '#A87CA0',
  faction: '#B5563E',
  event: '#6B8E8E',
  lore: '#A89580',
  custom: '#9A9286',
};

export function colorForKind(kind: string): string {
  return KIND_COLORS[kind] ?? KIND_COLORS.custom;
}

export interface BuildGraphOptions {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** When true (default) runs ForceAtlas2 + a noverlap pass on the result. */
  runLayout?: boolean;
  /** Optional resolver overriding the default kind→color map. */
  colorResolver?: (kind: string) => string;
}

export function buildGraph({
  nodes,
  edges,
  runLayout = true,
  colorResolver,
}: BuildGraphOptions): Graph {  const g = new Graph({ multi: false, type: 'directed', allowSelfLoops: false });
  const resolveColor = colorResolver ?? colorForKind;

  for (const n of nodes) {
    if (g.hasNode(n.id)) continue;
    const { x, y } = seededPosition(n.id);
    g.addNode(n.id, {
      label: n.label || '(untitled)',
      kind: n.kind,
      size: NODE_BASE_SIZE,
      baseSize: NODE_BASE_SIZE,
      color: resolveColor(n.kind),
      x,
      y,
      // Persistent visual highlight set by the user via the context menu.
      // Purely cosmetic — physics ignores this flag.
      userHighlight: false,
    });
  }

  for (const e of edges) {
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
    if (g.hasEdge(e.source, e.target)) continue;
    const style = edgeStyleFor(e.type);
    g.addEdgeWithKey(e.id, e.source, e.target, {
      type: 'arrow',
      linkType: e.type,
      size: style.size,
      baseSize: style.size,
      color: style.color,
      baseColor: style.color,
    });
  }

  applyDegreeSizing(g);

  if (runLayout && g.order > 1) {
    runForceLayout(g, 200);
    runNoverlap(g);
  }

  return g;
}

export {
  applyDegreeSizing,
  highlightNeighbors,
  runCircularLayout,
  runForceLayout,
  runNoverlap,
  seededPosition,
  startLiveSimulation,
  type LiveSimulationHandle,
  type LiveSimulationOptions,
} from './state.js';

export {
  buildSigmaProgramSettings,
  edgeStyleFor,
  ACCENT_EDGE_COLOR,
  DIM_EDGE_COLOR,
  HIDDEN_EDGE_COLOR,
  DIM_NODE_COLOR,
  HIDDEN_NODE_COLOR,
  NODE_BASE_SIZE,
  nodeSizeForDegree,
} from './render.js';

export { Graph };
export { default as Sigma } from 'sigma';
