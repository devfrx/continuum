/**
 * Builds the per-frame `RtNode` / `RtLink` runtime arrays from a raw
 * `{ nodes, edges }` payload, preserving prior positions where possible
 * so a hover- or filter-driven re-render does not snap nodes back to
 * the simulation's centre.
 *
 * Pure module — invoked from `Graph3DCanvas.vue` whenever the payload
 * watcher fires (or after data reload).
 */
import type { GraphEdge, GraphNode } from '@continuum/shared';
import type { RtLink, RtNode } from './types';
import { finitePositionOf, setNodePosition } from './threeUtils';

export interface RuntimeBuildResult {
  nodes: RtNode[];
  links: RtLink[];
}

/** Mutates `nodesById` in place to mirror the freshly-built graph. */
export function rebuildRuntimeGraph(
  nodesById: Map<string, RtNode>,
  payload: { nodes: GraphNode[]; edges: GraphEdge[] } | null,
): RuntimeBuildResult {
  const previousPositions = new Map<string, { x: number; y: number; z: number }>();
  for (const node of nodesById.values()) {
    const position = finitePositionOf(node);
    if (position) previousPositions.set(node.id, position);
  }

  nodesById.clear();
  if (!payload) return { nodes: [], links: [] };

  const nodes: RtNode[] = payload.nodes.map((n) => {
    const rt: RtNode = {
      ...n,
      neighbors: new Set<string>(),
      inDegree: 0,
      outDegree: 0,
      wikilinkCount: 0,
      relatedCount: 0,
    };
    const previous = previousPositions.get(n.id);
    if (previous) setNodePosition(rt, previous, false);
    nodesById.set(n.id, rt);
    return rt;
  });

  const links: RtLink[] = [];
  for (const e of payload.edges) {
    const s = nodesById.get(e.source);
    const t = nodesById.get(e.target);
    if (!s || !t) continue;
    links.push({
      source: e.source,
      target: e.target,
      type: e.type,
      sourceKind: e.sourceKind ?? 'link',
      propertyId: e.propertyId ?? null,
    });
    s.neighbors.add(t.id);
    t.neighbors.add(s.id);
    s.outDegree++;
    t.inDegree++;
    if (e.type === 'wikilink') { s.wikilinkCount++; t.wikilinkCount++; }
    else { s.relatedCount++; t.relatedCount++; }
  }
  return { nodes, links };
}
