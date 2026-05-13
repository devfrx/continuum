/**
 * Vue `InjectionKey`s used to share the singleton `useGraphQuery` /
 * `useGraphPropertyEncodings` instances created at the `GraphView` level
 * with every nested query / encoding panel without prop-drilling.
 *
 * Lives under `components/query/` (not `composables/query/`) because the
 * sibling owns the composables and we cannot create new files inside their
 * folder. The keys themselves are tiny — keeping them here keeps the
 * provide/inject contract co-located with the consumers (the panels).
 */
import type { InjectionKey } from 'vue';
import type {
  UseGraphPropertyEncodingsReturn,
  UseGraphQueryReturn,
} from '@/composables/query';

/** Provided by `GraphView` — the live `useGraphQuery()` instance. */
export const GRAPH_QUERY_KEY: InjectionKey<UseGraphQueryReturn> = Symbol(
  'continuum.graphQuery',
);

/** Provided by `GraphView` — the live `useGraphPropertyEncodings()` instance. */
export const GRAPH_PROPERTY_ENCODINGS_KEY: InjectionKey<UseGraphPropertyEncodingsReturn> =
  Symbol('continuum.graphPropertyEncodings');
