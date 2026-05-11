/**
 * Static layout helpers for the Continuum knowledge graph.
 *
 * Layouts:
 *   - `runForceLayout`: ForceAtlas2 (good general-purpose).
 *   - `runCircularLayout`: graphology-layout `circular`. Useful for an
 *     "exploded" overview where overlap matters less than legibility.
 *   - `runOrganicSeed`: Obsidian-style spread for live-physics warm-up.
 *   - `runClusteredLayout`: deterministic kind-grouped overview.
 *   - `runNoverlap`: post-pass that resolves any remaining node overlaps.
 *   - `highlightNeighbors`: 1-hop neighbourhood selection helper.
 */
import type Graph from 'graphology';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { circular } from 'graphology-layout';
import noverlap from 'graphology-layout-noverlap';
import { hashString, sanitizePositions } from './sizing.js';

export function runForceLayout(graph: Graph, iterations = 200): void {
  if (graph.order < 2) return;
  forceAtlas2.assign(graph, {
    iterations,
    settings: {
      gravity: 1,
      scalingRatio: 10,
      slowDown: 1,
      barnesHutOptimize: graph.order > 200,
      strongGravityMode: false,
      linLogMode: false,
    },
  });
  sanitizePositions(graph);
}

export function runCircularLayout(graph: Graph): void {
  if (graph.order < 2) return;
  circular.assign(graph, { scale: Math.max(80, graph.order * 6) });
  sanitizePositions(graph);
}

/**
 * Obsidian-style organic seed: spread nodes across a wide disc with
 * deterministic jitter. We do NOT pre-cluster by kind \u2014 clusters must
 * EMERGE from the live force simulation (link spring + repulsion),
 * exactly like Obsidian's graph view. High-degree hubs get a slight
 * pull toward the center so they stabilise faster.
 */
export function runOrganicSeed(graph: Graph): void {
  if (graph.order < 2) return;
  const n = graph.order;
  const radius = Math.max(220, Math.sqrt(n) * 60);
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  let i = 0;
  graph.forEachNode((id) => {
    const deg = graph.degree(id);
    // Deterministic per-id jitter so positions reproduce across reloads.
    const jitter = ((hashString(id) % 1000) / 1000 - 0.5) * 40;
    // Hubs (high degree) seeded slightly closer to centre so the spring
    // network resolves around them \u2014 pure d3-force behaviour.
    const hubBias = 1 / (1 + Math.log1p(deg) * 0.18);
    const r = radius * Math.sqrt((i + 0.5) / n) * hubBias + jitter;
    const a = i * goldenAngle;
    graph.setNodeAttribute(id, 'x', Math.cos(a) * r);
    graph.setNodeAttribute(id, 'y', Math.sin(a) * r);
    i += 1;
  });
  sanitizePositions(graph);
}

/**
 * Deterministic overview layout for dense knowledge graphs.
 *
 * Nodes are grouped by `kind`, each kind gets its own orbit around the
 * centre, and high-degree nodes sit near the centre of their local cluster.
 * This gives the 2D view an immediate semantic structure before live physics
 * adds small refinements.
 */
export function runClusteredLayout(graph: Graph): void {
  if (graph.order < 2) return;

  const groups = new Map<string, string[]>();
  graph.forEachNode((id, attrs) => {
    const kind = String((attrs as { kind?: unknown }).kind ?? 'custom');
    const bucket = groups.get(kind) ?? [];
    bucket.push(id);
    groups.set(kind, bucket);
  });

  const sortedGroups = [...groups.entries()]
    .map(([kind, ids]) => ({
      kind,
      ids: ids.sort((a, b) => graph.degree(b) - graph.degree(a) || a.localeCompare(b)),
    }))
    .sort((a, b) => b.ids.length - a.ids.length || a.kind.localeCompare(b.kind));

  const groupCount = sortedGroups.length;
  // Generous spacing: clusters need to stand visually apart even with
  // hundreds of cross-cluster edges. Scale aggressively with node count.
  const graphRadius = Math.max(
    320,
    Math.sqrt(graph.order) * 78,
    groupCount * 130,
  );
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  sortedGroups.forEach((group, groupIndex) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * groupIndex) / Math.max(1, groupCount);
    const centerRadius = groupCount <= 1 ? 0 : graphRadius;
    const cx = Math.cos(angle) * centerRadius;
    const cy = Math.sin(angle) * centerRadius;
    // Cluster footprint scales with sqrt(size) so dense kinds open up
    // instead of stacking on themselves.
    const clusterRadius = Math.max(110, Math.sqrt(group.ids.length) * 52);

    group.ids.forEach((id, index) => {
      const localAngle = angle + index * goldenAngle;
      const localRadius = clusterRadius * Math.sqrt((index + 0.35) / Math.max(1, group.ids.length));
      graph.setNodeAttribute(id, 'x', cx + Math.cos(localAngle) * localRadius);
      graph.setNodeAttribute(id, 'y', cy + Math.sin(localAngle) * localRadius);
    });
  });

  runNoverlap(graph, { margin: 14, ratio: 1.25, maxIterations: 120 });
  sanitizePositions(graph);
}

/**
 * Post-pass that nudges nodes apart so circles never overlap. Cheap on small
 * graphs; capped at 50 iterations so it stays interactive on large ones.
 */
export function runNoverlap(
  graph: Graph,
  opts: { margin?: number; ratio?: number; maxIterations?: number } = {},
): void {
  if (graph.order < 2) return;
  noverlap.assign(graph, {
    maxIterations: opts.maxIterations ?? 50,
    settings: {
      margin: opts.margin ?? 4,
      ratio: opts.ratio ?? 1.05,
      speed: 3,
    },
  });
  sanitizePositions(graph);
}

/** 1-hop neighbourhood (incl. node) and connecting edge ids. */
export function highlightNeighbors(
  graph: Graph,
  nodeId: string,
): { nodes: Set<string>; edges: Set<string> } {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  if (!graph.hasNode(nodeId)) return { nodes, edges };
  nodes.add(nodeId);
  graph.forEachNeighbor(nodeId, (n) => nodes.add(n));
  graph.forEachEdge(nodeId, (eid, _a, source, target) => {
    edges.add(eid);
    nodes.add(source);
    nodes.add(target);
  });
  return { nodes, edges };
}
