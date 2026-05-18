/**
 * Custom properties service.
 *
 * Centralises the (de)serialization between the database row layout
 * (typed columns + jsonb fallback in `property_values`) and the typed
 * `PropertyValue` discriminated union exposed to the client.
 *
 * Also validates that an incoming value matches the property type and
 * config (e.g. select options exist, dateRange is a `{from, to}` ISO pair).
 *
 * Keeping this logic in one place ensures the routes layer never has to
 * reach into row internals and the frontend gets the same shape on every
 * round-trip.
 */
import { z } from 'zod';
import type {
  ButtonAction,
  FileRef,
  PropertyConfig,
  PropertyDefinition,
  PropertyOption,
  PropertyType,
  PropertyValue,
  StatusOption,
  VerificationState,
} from '@continuum/shared';
import {
  PROPERTY_TYPES,
  isComputedPropertyType,
} from '@continuum/shared';
import type {
  NewPropertyValue,
  PropertyDefinitionRow,
  PropertyValueRow,
} from '../db/schema.js';

// ────────────────────────────── Definition ──────────────────────────────

/**
 * Map a `property_definitions` row to the public `PropertyDefinition` shape.
 * Converts timestamps to ISO strings and casts the `config` jsonb cell to
 * the discriminated union (the routes layer guarantees the shape matches
 * the row's `type`).
 */
export function definitionRowToDto(row: PropertyDefinitionRow): PropertyDefinition {
  return {
    id: row.id,
    scope: row.scope as PropertyDefinition['scope'],
    kindId: row.kindId,
    noteId: row.noteId,
    databaseId: row.databaseId,
    key: row.key,
    label: row.label,
    type: row.type as PropertyType,
    icon: row.icon,
    description: row.description,
    config: row.config as PropertyConfig,
    position: row.position,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─────────────────────────────── Value ──────────────────────────────────

/**
 * Map a `property_values` row to the typed `PropertyValue` shape using the
 * owning property's `type` to pick the correct column. Returns `null` when
 * the row is fully empty (which should never happen because empty values
 * delete the row).
 */
export function valueRowToDto(
  row: PropertyValueRow,
  type: PropertyType,
): PropertyValue | null {
  switch (type) {
    case 'text':
      return row.valueText === null ? null : { type, value: row.valueText };
    case 'longText':
      return row.valueText === null ? null : { type, value: row.valueText };
    case 'number':
      return row.valueNumber === null ? null : { type, value: row.valueNumber };
    case 'date':
      return row.valueDate === null
        ? null
        : { type, value: row.valueDate.toISOString() };
    case 'dateRange': {
      const j = row.valueJson as { from?: unknown; to?: unknown } | null;
      if (!j || typeof j.from !== 'string' || typeof j.to !== 'string') return null;
      return { type, value: { from: j.from, to: j.to } };
    }
    case 'checkbox':
      return row.valueBool === null ? null : { type, value: row.valueBool };
    case 'select':
      return row.valueText === null ? null : { type, value: row.valueText };
    case 'multiSelect': {
      const j = row.valueJson;
      if (!Array.isArray(j)) return null;
      return { type, value: j.filter((x): x is string => typeof x === 'string') };
    }
    case 'url':
      return row.valueText === null ? null : { type, value: row.valueText };
    case 'email':
      return row.valueText === null ? null : { type, value: row.valueText };
    case 'relation': {
      const j = row.valueJson;
      if (!Array.isArray(j)) return null;
      return { type, value: j.filter((x): x is string => typeof x === 'string') };
    }
    case 'phone':
      return row.valueText === null ? null : { type, value: row.valueText };
    case 'files': {
      const j = row.valueJson;
      if (!Array.isArray(j)) return null;
      const files = (j as unknown[]).filter(isFileRef);
      return files.length === 0 ? null : { type, value: files };
    }
    case 'status':
      return row.valueText === null ? null : { type, value: row.valueText };
    case 'progress':
      return row.valueNumber === null ? null : { type, value: row.valueNumber };
    case 'verification': {
      const j = row.valueJson as { state?: unknown; verifiedAt?: unknown } | null;
      if (!j || typeof j.state !== 'string') return null;
      const state = j.state as VerificationState;
      const verifiedAt = typeof j.verifiedAt === 'string' ? j.verifiedAt : null;
      return { type, state, verifiedAt };
    }
    case 'uniqueId': {
      if (row.valueNumber === null) return null;
      const sequence = row.valueNumber;
      return { type, sequence, value: String(sequence) };
    }
    // Computed / value-less types are never persisted in property_values:
    // their value is materialised by `services/property-computed.ts` at
    // request time. Returning `null` here lets that layer take over.
    case 'rollup':
    case 'formula':
    case 'button':
    case 'createdTime':
    case 'createdBy':
    case 'lastEditedTime':
    case 'lastEditedBy':
      return null;
  }
}

/** Type guard for the wire shape of a `FileRef`. */
function isFileRef(value: unknown): value is FileRef {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.mime === 'string' &&
    typeof v.size === 'number' &&
    typeof v.url === 'string' &&
    typeof v.uploadedAt === 'string'
  );
}

/**
 * Encode a typed `PropertyValue` into the partial row columns to upsert
 * into `property_values`. Returns `null` when the value is logically empty
 * (callers should DELETE the row instead of upserting).
 */
export function valueDtoToRow(
  value: PropertyValue,
): Pick<
  NewPropertyValue,
  'valueText' | 'valueNumber' | 'valueBool' | 'valueDate' | 'valueJson'
> | null {
  const blank = {
    valueText: null,
    valueNumber: null,
    valueBool: null,
    valueDate: null,
    valueJson: null,
  } as const;

  switch (value.type) {
    case 'text':
    case 'longText':
    case 'url':
    case 'email':
    case 'select':
      if (!value.value) return null;
      return { ...blank, valueText: value.value };
    case 'number':
      if (!Number.isFinite(value.value)) return null;
      return { ...blank, valueNumber: value.value };
    case 'date':
      if (!value.value) return null;
      return { ...blank, valueDate: new Date(value.value) };
    case 'dateRange':
      if (!value.value.from && !value.value.to) return null;
      return {
        ...blank,
        valueJson: { from: value.value.from ?? '', to: value.value.to ?? '' },
      };
    case 'checkbox':
      return { ...blank, valueBool: value.value };
    case 'multiSelect':
      if (value.value.length === 0) return null;
      return { ...blank, valueJson: value.value };
    case 'relation':
      if (value.value.length === 0) return null;
      return { ...blank, valueJson: value.value };
    case 'phone':
      if (!value.value) return null;
      return { ...blank, valueText: value.value };
    case 'files':
      if (value.value.length === 0) return null;
      return { ...blank, valueJson: value.value };
    case 'status':
      if (!value.value) return null;
      return { ...blank, valueText: value.value };
    case 'progress':
      if (!Number.isFinite(value.value)) return null;
      return { ...blank, valueNumber: value.value };
    case 'verification':
      if (value.state === 'unverified' && !value.verifiedAt) return null;
      return {
        ...blank,
        valueJson: { state: value.state, verifiedAt: value.verifiedAt ?? null },
      };
    case 'uniqueId':
      // Persisted as the raw sequence number. Allocation lives in the
      // routes layer (atomic per kind+definition).
      if (!Number.isFinite(value.sequence)) return null;
      return { ...blank, valueNumber: value.sequence };
    case 'rollup':
    case 'formula':
    case 'button':
    case 'createdTime':
    case 'createdBy':
    case 'lastEditedTime':
    case 'lastEditedBy':
      // Computed / value-less property types are never persisted directly.
      return null;
  }
}

// ───────────────────────────── Validation ───────────────────────────────

const optionSchema = z.object({
  id: z.string().min(1).max(60),
  label: z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be #RRGGBB'),
});

const statusOptionSchema = optionSchema.extend({
  group: z.enum(['todo', 'inProgress', 'done']),
});

const buttonActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('open-url'), url: z.string().max(2048).optional() }),
  z.object({
    type: z.literal('set-property'),
    targetKey: z.string().min(1).max(60),
    value: z.unknown(),
  }),
  z.object({
    type: z.literal('increment-property'),
    targetKey: z.string().min(1).max(60),
    delta: z.number().optional(),
  }),
]);

/**
 * Build a zod schema that validates a `PropertyConfig` whose `type` matches
 * the supplied property type. Used by the routes layer to validate the
 * `config` payload on create/update.
 */
export function configSchemaFor(type: PropertyType): z.ZodTypeAny {
  switch (type) {
    case 'text':
      return z.object({
        type: z.literal('text'),
        maxLength: z.number().int().positive().optional(),
        placeholder: z.string().max(200).optional(),
      });
    case 'longText':
      return z.object({
        type: z.literal('longText'),
        placeholder: z.string().max(200).optional(),
      });
    case 'number':
      return z.object({
        type: z.literal('number'),
        unit: z.string().max(20).optional(),
        precision: z.number().int().min(0).max(10).optional(),
        min: z.number().optional(),
        max: z.number().optional(),
      });
    case 'date':
      return z.object({
        type: z.literal('date'),
        granularity: z.enum(['date', 'datetime']).optional(),
      });
    case 'dateRange':
      return z.object({
        type: z.literal('dateRange'),
        granularity: z.enum(['date', 'datetime']).optional(),
      });
    case 'checkbox':
      return z.object({ type: z.literal('checkbox') });
    case 'select':
      return z.object({
        type: z.literal('select'),
        options: z.array(optionSchema).default([]),
      });
    case 'multiSelect':
      return z.object({
        type: z.literal('multiSelect'),
        options: z.array(optionSchema).default([]),
      });
    case 'url':
      return z.object({ type: z.literal('url') });
    case 'email':
      return z.object({ type: z.literal('email') });
    case 'relation':
      return z.object({
        type: z.literal('relation'),
        targetKinds: z.array(z.string().min(1)).optional(),
        multiple: z.boolean().optional(),
      });
    case 'phone':
      return z.object({
        type: z.literal('phone'),
        region: z.string().max(8).optional(),
      });
    case 'files':
      return z.object({
        type: z.literal('files'),
        max: z.number().int().positive().max(50).optional(),
        accept: z.array(z.string().min(1).max(64)).optional(),
      });
    case 'status':
      return z.object({
        type: z.literal('status'),
        options: z.array(statusOptionSchema).default([]),
        defaultOptionId: z.string().min(1).optional(),
      });
    case 'rollup':
      return z.object({
        type: z.literal('rollup'),
        relationKey: z.string().min(1).max(60),
        targetKey: z.string().min(1).max(60).optional(),
        aggregation: z.enum([
          'count',
          'countNotEmpty',
          'sum',
          'avg',
          'min',
          'max',
          'showOriginal',
        ]),
      });
    case 'formula':
      return z.object({
        type: z.literal('formula'),
        expression: z.string().max(2000).default(''),
        output: z.enum(['number', 'string', 'boolean']).optional(),
        precision: z.number().int().min(0).max(10).optional(),
      });
    case 'button':
      return z.object({
        type: z.literal('button'),
        label: z.string().max(60).optional(),
        variant: z.enum(['primary', 'ghost']).optional(),
        action: buttonActionSchema,
      });
    case 'createdTime':
      return z.object({
        type: z.literal('createdTime'),
        granularity: z.enum(['date', 'datetime']).optional(),
      });
    case 'createdBy':
      return z.object({ type: z.literal('createdBy') });
    case 'lastEditedTime':
      return z.object({
        type: z.literal('lastEditedTime'),
        granularity: z.enum(['date', 'datetime']).optional(),
      });
    case 'lastEditedBy':
      return z.object({ type: z.literal('lastEditedBy') });
    case 'uniqueId':
      return z.object({
        type: z.literal('uniqueId'),
        prefix: z
          .string()
          .max(16)
          .regex(/^[A-Za-z0-9-]*$/u, 'prefix must be alphanumeric or dashes')
          .optional(),
      });
    case 'verification':
      return z.object({
        type: z.literal('verification'),
        ttl: z
          .object({
            amount: z.number().int().positive().max(10_000),
            unit: z.enum(['seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years']),
          })
          .optional(),
        // Legacy: accepted for back-compat with notes created before the
        // unit-aware schema landed. New writes should use `ttl`.
        ttlDays: z.number().int().positive().max(3650).optional(),
      });
    case 'progress':
      return z.object({
        type: z.literal('progress'),
        min: z.number().optional(),
        max: z.number().optional(),
        showPercent: z.boolean().optional(),
      });
  }
}

const isoDate = z
  .string()
  .min(1)
  .refine((s) => !Number.isNaN(Date.parse(s)), 'must be an ISO 8601 date');

/**
 * Build a zod schema validating a `PropertyValue` against the given
 * definition (type + config). Enforces option membership for select /
 * multiSelect.
 */
export function valueSchemaFor(def: PropertyDefinition): z.ZodTypeAny {
  switch (def.type) {
    case 'text':
      return z.object({
        type: z.literal('text'),
        value: z.string().max((def.config as { maxLength?: number }).maxLength ?? 5000),
      });
    case 'longText':
      return z.object({ type: z.literal('longText'), value: z.string().max(50000) });
    case 'number':
      return z.object({ type: z.literal('number'), value: z.number() });
    case 'date':
      return z.object({ type: z.literal('date'), value: isoDate });
    case 'dateRange':
      return z.object({
        type: z.literal('dateRange'),
        value: z.object({
          from: z.union([z.literal(''), isoDate]),
          to: z.union([z.literal(''), isoDate]),
        }),
      });
    case 'checkbox':
      return z.object({ type: z.literal('checkbox'), value: z.boolean() });
    case 'select': {
      const ids = (def.config as { options: PropertyOption[] }).options.map((o) => o.id);
      return z.object({
        type: z.literal('select'),
        value:
          ids.length === 0
            ? z.string()
            : z
                .string()
                .refine(
                  (v) => v === '' || ids.includes(v),
                  'value must be one of the configured option ids',
                ),
      });
    }
    case 'multiSelect': {
      const ids = (def.config as { options: PropertyOption[] }).options.map((o) => o.id);
      return z.object({
        type: z.literal('multiSelect'),
        value: z
          .array(z.string())
          .refine(
            (arr) => ids.length === 0 || arr.every((v) => ids.includes(v)),
            'every value must be a configured option id',
          ),
      });
    }
    case 'url':
      return z.object({
        type: z.literal('url'),
        value: z.union([z.literal(''), z.string().url()]),
      });
    case 'email':
      return z.object({
        type: z.literal('email'),
        value: z.union([z.literal(''), z.string().email()]),
      });
    case 'relation':
      return z.object({
        type: z.literal('relation'),
        value: z.array(z.string().uuid()),
      });
    case 'phone':
      return z.object({
        type: z.literal('phone'),
        value: z
          .string()
          .max(40)
          .refine(
            (v) => v === '' || /^[+()\d\s.\-]+$/.test(v),
            'must be a phone number',
          ),
      });
    case 'files':
      return z.object({
        type: z.literal('files'),
        value: z.array(
          z.object({
            id: z.string().uuid(),
            name: z.string().min(1).max(255),
            mime: z.string().min(1).max(120),
            size: z.number().int().nonnegative(),
            url: z.string().min(1).max(1024),
            uploadedAt: isoDate,
          }),
        ),
      });
    case 'status': {
      const ids = (def.config as { options: StatusOption[] }).options.map((o) => o.id);
      return z.object({
        type: z.literal('status'),
        value:
          ids.length === 0
            ? z.string()
            : z
                .string()
                .refine(
                  (v) => v === '' || ids.includes(v),
                  'value must be one of the configured status option ids',
                ),
      });
    }
    case 'progress': {
      const cfg = def.config as { min?: number; max?: number };
      const lo = cfg.min ?? 0;
      const hi = cfg.max ?? 100;
      return z.object({
        type: z.literal('progress'),
        value: z
          .number()
          .min(lo, `must be ≥ ${lo}`)
          .max(hi, `must be ≤ ${hi}`),
      });
    }
    case 'verification':
      return z.object({
        type: z.literal('verification'),
        state: z.enum(['unverified', 'verified', 'expired']),
        verifiedAt: z.union([z.literal(''), isoDate]).nullable(),
      });
    case 'uniqueId':
      return z.object({
        type: z.literal('uniqueId'),
        sequence: z.number().int().nonnegative(),
        value: z.string(),
      });
    // Computed / button types are not writable; routes layer rejects PUT.
    case 'rollup':
      return z.object({
        type: z.literal('rollup'),
        value: z.union([z.number(), z.string(), z.null()]),
        count: z.number().int().nonnegative(),
      });
    case 'formula':
      return z.object({
        type: z.literal('formula'),
        value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
        error: z.string().optional(),
      });
    case 'button':
      return z.object({ type: z.literal('button') });
    case 'createdTime':
      return z.object({ type: z.literal('createdTime'), value: z.string() });
    case 'createdBy':
      return z.object({ type: z.literal('createdBy'), value: z.string() });
    case 'lastEditedTime':
      return z.object({ type: z.literal('lastEditedTime'), value: z.string() });
    case 'lastEditedBy':
      return z.object({ type: z.literal('lastEditedBy'), value: z.string() });
  }
}

// ───────────────────────────── Utilities ────────────────────────────────

export const propertyTypeSchema = z.enum(PROPERTY_TYPES);

/** Re-exported for convenience so routes can introspect the type catalogue. */
export { isComputedPropertyType };
export type { ButtonAction };

/** Shape used by the routes layer when listing per-note properties. */
export interface RawNotePropertyJoin {
  definition: PropertyDefinitionRow;
  value: PropertyValueRow | null;
}
