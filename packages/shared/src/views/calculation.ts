// ===== Footer calculations for Database Views =====
//
// Per-column aggregation function ("calc") rendered at the bottom of each
// table column. Mirrors Notion's calculation menu and is shaped as a
// discriminated union by the property kind the calc applies to. The
// "common" set is allowed for every property type; numeric/date/checkbox
// add their own specialised functions.

import { z } from 'zod';

// ───────── Function alphabets ─────────

/** Calcs that apply to any property type. */
export const COMMON_CALCS = [
  'none',
  'count_all',
  'count_values',
  'count_unique',
  'count_empty',
  'count_not_empty',
  'percent_empty',
  'percent_not_empty',
] as const;
export type CommonCalc = (typeof COMMON_CALCS)[number];

/** Calcs only valid for numeric properties (`number`, `progress`). */
export const NUMERIC_CALCS = ['sum', 'avg', 'median', 'min', 'max', 'range'] as const;
export type NumericCalc = (typeof NUMERIC_CALCS)[number];

/** Calcs only valid for date-bearing properties. */
export const DATE_CALCS = ['earliest', 'latest', 'date_range'] as const;
export type DateCalc = (typeof DATE_CALCS)[number];

/** Calcs only valid for checkbox properties. */
export const CHECKBOX_CALCS = [
  'percent_checked',
  'percent_unchecked',
  'checked',
  'unchecked',
] as const;
export type CheckboxCalc = (typeof CHECKBOX_CALCS)[number];

// ───────── Discriminated union ─────────

export interface CalcCommon {
  kind: 'common';
  fn: CommonCalc;
}
export interface CalcNumeric {
  kind: 'numeric';
  fn: CommonCalc | NumericCalc;
}
export interface CalcDate {
  kind: 'date';
  fn: CommonCalc | DateCalc;
}
export interface CalcCheckbox {
  kind: 'checkbox';
  fn: CommonCalc | CheckboxCalc;
}

/**
 * The footer-calc function selected for a column. The `kind` discriminator
 * mirrors the column's property kind and constrains which `fn` values are
 * legal — the schema validates this combination.
 */
export type CalcFn = CalcCommon | CalcNumeric | CalcDate | CalcCheckbox;

/**
 * Resolved value of a calc, computed server-side and returned in the query
 * response. `null` means "nothing to aggregate" (e.g. empty result set or
 * `fn === 'none'`).
 */
export type CalcFnResult = number | string | null;

// ───────── Schemas ─────────

export const calcFnSchema: z.ZodType<CalcFn> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('common'), fn: z.enum(COMMON_CALCS) }),
  z.object({
    kind: z.literal('numeric'),
    fn: z.union([z.enum(COMMON_CALCS), z.enum(NUMERIC_CALCS)]),
  }),
  z.object({
    kind: z.literal('date'),
    fn: z.union([z.enum(COMMON_CALCS), z.enum(DATE_CALCS)]),
  }),
  z.object({
    kind: z.literal('checkbox'),
    fn: z.union([z.enum(COMMON_CALCS), z.enum(CHECKBOX_CALCS)]),
  }),
]);

/** Map of property-key → selected calc function. Missing keys = no calc. */
export const calcMapSchema = z.record(z.string(), calcFnSchema);

/** Convenience constant: the "no calculation" common calc. */
export const NONE_CALC: CalcFn = { kind: 'common', fn: 'none' };
