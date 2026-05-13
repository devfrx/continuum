/**
 * Graph projections — pure helpers for the in-memory pass that runs after
 * we have the SQL-filtered note set and the assembled edge list.
 *
 * Two responsibilities:
 *
 *  – `computeGraphMetrics` walks the edge set once and tallies degree /
 *    inDegree / outDegree per node. We always compute all three together
 *    because they share the same scan; making them individually opt-in
 *    would just complicate callers.
 *  – `applyMetricPostFilters` turns the planner's residual metric
 *    conditions into a per-id predicate. The root combinator decides
 *    whether the residuals are AND-ed or OR-ed together — this is what
 *    lets a top-level `OR` group carry pure-metric children without the
 *    planner's documented degradation kicking in.
 */
import type {
  FilterCondition,
  FilterValue,
  GraphMetricId,
  GraphNodeMetrics,
} from '@continuum/shared';

/** Edge shape consumed for metric computation — only ids matter here. */
export interface MetricEdgeRef {
  source: string;
  target: string;
}

/**
 * Tally degree, in-degree and out-degree for every node id in one pass
 * over the edge set. Nodes referenced by an edge but absent from
 * `nodeIds` are ignored so callers can pass a pre-filtered universe
 * without leaking metrics for pruned-out nodes.
 */
export function computeGraphMetrics(
  nodeIds: string[],
  edges: MetricEdgeRef[],
): Map<string, GraphNodeMetrics> {
  const out = new Map<string, GraphNodeMetrics>();
  for (const id of nodeIds) out.set(id, { degree: 0, inDegree: 0, outDegree: 0 });
  for (const e of edges) {
    const src = out.get(e.source);
    const tgt = out.get(e.target);
    if (src) {
      src.outDegree += 1;
      src.degree += 1;
    }
    if (tgt) {
      tgt.inDegree += 1;
      tgt.degree += 1;
    }
  }
  return out;
}

/**
 * Build a predicate that, given a node id, evaluates the residual metric
 * conditions left over by the SQL planner against that node's metrics.
 *
 * – When `postFilters` is empty the predicate accepts everything
 *   (no metric constraint to apply).
 * – Otherwise each condition is evaluated against the node's metrics and
 *   combined with the supplied root combinator (`and` / `or`).
 *
 * Conditions whose field isn't a graph metric are silently treated as
 * `true` so a malformed input never prunes the whole graph.
 */
export function applyMetricPostFilters(
  metrics: Map<string, GraphNodeMetrics>,
  postFilters: FilterCondition[],
  rootCombinator: 'and' | 'or',
): (id: string) => boolean {
  if (postFilters.length === 0) return () => true;
  return (id: string): boolean => {
    const m = metrics.get(id) ?? { degree: 0, inDegree: 0, outDegree: 0 };
    const evals = postFilters.map((c) => evaluateMetricCondition(m, c));
    return rootCombinator === 'or' ? evals.some(Boolean) : evals.every(Boolean);
  };
}

function evaluateMetricCondition(m: GraphNodeMetrics, c: FilterCondition): boolean {
  if (c.field.kind !== 'graphMetric') return true;
  const value = metricValue(m, c.field.id);
  return compareNumber(value, c.operator, c.value);
}

function metricValue(m: GraphNodeMetrics, id: GraphMetricId): number {
  switch (id) {
    case 'degree':
      return m.degree;
    case 'inDegree':
      return m.inDegree;
    case 'outDegree':
      return m.outDegree;
  }
}

function compareNumber(
  actual: number,
  operator: FilterCondition['operator'],
  value: FilterValue,
): boolean {
  switch (operator) {
    case 'eq': {
      const expected = numberFromValue(value);
      return expected !== null && actual === expected;
    }
    case 'neq': {
      const expected = numberFromValue(value);
      return expected === null || actual !== expected;
    }
    case 'gt': {
      const expected = numberFromValue(value);
      return expected !== null && actual > expected;
    }
    case 'gte': {
      const expected = numberFromValue(value);
      return expected !== null && actual >= expected;
    }
    case 'lt': {
      const expected = numberFromValue(value);
      return expected !== null && actual < expected;
    }
    case 'lte': {
      const expected = numberFromValue(value);
      return expected !== null && actual <= expected;
    }
    case 'between':
      return value.kind === 'numberRange' && actual >= value.from && actual <= value.to;
    case 'isEmpty':
      // Metrics are always defined; never empty.
      return false;
    case 'isNotEmpty':
      return true;
    default:
      return true;
  }
}

function numberFromValue(value: FilterValue): number | null {
  if (value.kind === 'number' && Number.isFinite(value.value)) return value.value;
  if (value.kind !== 'string') return null;
  const parsed = Number(value.value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}
