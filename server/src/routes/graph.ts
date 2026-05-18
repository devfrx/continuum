/**
 * Graph-query route.
 *
 *   POST /api/graph/query   →   { nodes, edges }
 *
 * The recursive `FilterNode` is validated at the boundary with a zod
 * schema composed in this file (instead of in `@continuum/shared`)
 * because zod is a server-only dependency and we don't want to bloat the
 * shared package with it. The schema mirrors the shared types one-for-one
 * and is the single place where untrusted input meets the planner.
 */
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type {
  FilterCondition,
  FilterGroup,
  FilterNode,
  GraphQueryRequest,
} from '@continuum/shared';
import { executeGraphQuery } from '../services/graph/graph-query.js';

// ───────────────────────── filter schemas ─────────────────────────────

const filterValueSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('string'), value: z.string() }),
  z.object({ kind: z.literal('number'), value: z.number() }),
  z.object({ kind: z.literal('numberRange'), from: z.number(), to: z.number() }),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }),
  z.object({ kind: z.literal('date'), value: z.string() }),
  z.object({ kind: z.literal('dateRange'), from: z.string(), to: z.string() }),
  z.object({ kind: z.literal('duration'), days: z.number().int().nonnegative() }),
  z.object({ kind: z.literal('stringList'), values: z.array(z.string()) }),
]);

const fieldRefSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('system'),
    id: z.enum([
      'note.title',
      'note.kind',
      'note.folderId',
      'note.locked',
      'note.createdAt',
      'note.updatedAt',
      'note.tags',
    ]),
  }),
  z.object({ kind: z.literal('property'), key: z.string().min(1) }),
  z.object({
    kind: z.literal('graphMetric'),
    id: z.enum(['degree', 'inDegree', 'outDegree']),
  }),
]);

const operatorSchema = z.enum([
  'isEmpty',
  'isNotEmpty',
  'eq',
  'neq',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'isTrue',
  'isFalse',
  'inAny',
  'inAll',
  'notIn',
  'before',
  'after',
  'onOrBefore',
  'onOrAfter',
  'inRange',
  'today',
  'thisWeek',
  'thisMonth',
  'thisYear',
  'lastNDays',
  'nextNDays',
]);

const filterConditionSchema: z.ZodType<FilterCondition> = z.object({
  type: z.literal('condition'),
  id: z.string(),
  field: fieldRefSchema,
  operator: operatorSchema,
  value: filterValueSchema,
});

const filterGroupSchema: z.ZodType<FilterGroup> = z.lazy(() =>
  z.object({
    type: z.literal('group'),
    id: z.string(),
    combinator: z.enum(['and', 'or']),
    children: z.array(filterNodeSchema),
  }),
);

const filterNodeSchema: z.ZodType<FilterNode> = z.lazy(() =>
  z.union([filterConditionSchema, filterGroupSchema]),
);

const edgeSourcesSchema = z.object({
  includeLinks: z.boolean(),
  allRelationProperties: z.boolean(),
  relationPropertyKeys: z.array(z.string().min(1)),
});

const graphQueryRequestSchema: z.ZodType<GraphQueryRequest> = z.object({
  filter: filterNodeSchema,
  edgeSources: edgeSourcesSchema,
  includeProperties: z.array(z.string().min(1)),
  includeMetrics: z.boolean(),
});

// ─────────────────────────── plugin ───────────────────────────────────

export const graphRoutes: FastifyPluginAsync = async (app) => {
  app.post('/graph/query', async (req) => {
    const body = graphQueryRequestSchema.parse(req.body);
    return executeGraphQuery(body);
  });
};
