/**
 * Operator registry — server-side metadata + value-shape validation.
 *
 * The shared package owns the canonical operator table (`FILTER_OPERATORS`)
 * because the web app needs it to render the operator menu. The server
 * needs the same table plus two extras the UI never looks at:
 *
 *  – `expectsValueKind(op)` — what `FilterValue.kind` the predicate
 *    builders should expect when they unpack the value. Returns `'none'`
 *    for unary operators so the caller can short-circuit.
 *  – `validateOperatorValue(op, value)` — runtime check at the boundary
 *    between zod-validated request and SQL-builder. Throws on mismatch
 *    instead of silently producing a malformed predicate.
 *
 * Keeping these helpers thin and re-exporting `FILTER_OPERATORS` directly
 * (no copy) means a new operator added in the shared package automatically
 * appears here without a coordinated edit.
 */
import { FILTER_OPERATORS, type FilterOperatorId, type FilterValue } from '@continuum/shared';

export { FILTER_OPERATORS };

/**
 * The `FilterValue.kind` a builder should expect for the supplied
 * operator. For unary operators (`isEmpty`, `today`…) returns `'none'` so
 * callers can skip value handling entirely. For polymorphic operators
 * (`eq`, `neq`) returns the first listed kind — the property-aware SQL
 * builder narrows further from the column's actual type.
 */
export function expectsValueKind(op: FilterOperatorId): FilterValue['kind'] | 'none' {
  const kinds = FILTER_OPERATORS[op].valueKinds;
  if (kinds.length === 0 || (kinds.length === 1 && kinds[0] === 'none')) return 'none';
  // First non-'none' kind. Polymorphic ops (eq/neq) list multiple kinds; the
  // builder picks the right one once it knows the column type.
  for (const k of kinds) if (k !== 'none') return k;
  return 'none';
}

/**
 * Throws when `value.kind` doesn't appear in the operator's accepted
 * `valueKinds`. The error message names both ends so the request log shows
 * exactly which condition the client mis-built.
 */
export function validateOperatorValue(op: FilterOperatorId, value: FilterValue): void {
  const desc = FILTER_OPERATORS[op];
  if (!desc.valueKinds.includes(value.kind)) {
    throw new Error(
      `Operator '${op}' does not accept value kind '${value.kind}' ` +
        `(expected one of: ${desc.valueKinds.join(', ')})`,
    );
  }
}
