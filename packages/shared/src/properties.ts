// ===== Custom Properties =====
//
// Type system for note custom properties (Notion-style). Lives at the shared
// boundary between server and web so both sides agree on:
//   – the catalogue of supported property types,
//   – the per-type configuration shape (`PropertyConfig`),
//   – the per-type value shape (`PropertyValue`),
//   – the wire shape of definitions and values returned by the REST API.
//
// Storage is split across typed columns server-side; see
// `server/src/db/schema.ts` (`propertyValues`) for the row shape and
// `server/src/services/properties.ts` for the encoder/decoder.

import type { UUID, EntityKind } from './index.js';

/** All supported property types. Keep in sync with editor registry. */
export const PROPERTY_TYPES = [
  // Basics — user-typed values.
  'text',
  'longText',
  'number',
  'checkbox',
  'url',
  'email',
  'phone',
  'date',
  'dateRange',
  'files',
  // Choice — option-based.
  'select',
  'multiSelect',
  'status',
  // Links across notes.
  'relation',
  'rollup',
  // Computation / actions.
  'formula',
  'button',
  // Auto-managed system properties.
  'createdTime',
  'createdBy',
  'lastEditedTime',
  'lastEditedBy',
  'uniqueId',
  // Tracking helpers.
  'verification',
  'progress',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

/**
 * Property types whose value is fully managed by the server (or computed at
 * request time) and may not be set or cleared from the client. Writes to
 * these property ids are rejected by the routes layer.
 */
export const COMPUTED_PROPERTY_TYPES = [
  'createdTime',
  'createdBy',
  'lastEditedTime',
  'lastEditedBy',
  'uniqueId',
  'formula',
  'rollup',
] as const satisfies readonly PropertyType[];

export type ComputedPropertyType = (typeof COMPUTED_PROPERTY_TYPES)[number];

/**
 * @returns `true` when the value of a property of this type is auto-managed
 *   by the server. The UI hides editors for these properties and renders a
 *   read-only badge instead.
 */
export function isComputedPropertyType(type: PropertyType): type is ComputedPropertyType {
  return (COMPUTED_PROPERTY_TYPES as readonly PropertyType[]).includes(type);
}

/**
 * High-level UI grouping shown in the "Add property" picker. Mirrors the
 * Notion taxonomy so the catalogue stays scannable as it grows.
 */
export interface PropertyTypeGroup {
  id: 'basics' | 'choice' | 'links' | 'compute' | 'auto' | 'tracking';
  label: string;
  types: PropertyType[];
}

export const PROPERTY_TYPE_GROUPS: PropertyTypeGroup[] = [
  {
    id: 'basics',
    label: 'Basics',
    types: [
      'text',
      'longText',
      'number',
      'checkbox',
      'url',
      'email',
      'phone',
      'date',
      'dateRange',
      'files',
    ],
  },
  {
    id: 'choice',
    label: 'Choice',
    types: ['select', 'multiSelect', 'status'],
  },
  { id: 'links', label: 'Links & rollups', types: ['relation', 'rollup'] },
  { id: 'compute', label: 'Compute & actions', types: ['formula', 'button'] },
  {
    id: 'auto',
    label: 'Auto-managed',
    types: ['createdTime', 'createdBy', 'lastEditedTime', 'lastEditedBy', 'uniqueId'],
  },
  { id: 'tracking', label: 'Tracking', types: ['verification', 'progress'] },
];

/**
 * Where a property definition is mounted.
 *
 * - `'note'`   — owned by a single note (each note has its own schema).
 * - `'kind'`   — reserved for the future Templates feature: a definition
 *                shared across notes of a kind. Not auto-applied.
 * - `'global'` — reserved for properties shared across every note.
 */
export type PropertyScope = 'kind' | 'global' | 'note';

/** A coloured option for select / multiSelect properties. */
export interface PropertyOption {
  /** Stable id (slug). Immutable once created. */
  id: string;
  /** Human label. */
  label: string;
  /** Hex colour `#RRGGBB`. */
  color: string;
}

// ───────── Per-type configuration (discriminated union by `type`) ─────────

export interface TextConfig {
  type: 'text';
  /** Optional max character length. */
  maxLength?: number;
  /** Optional placeholder shown in the editor. */
  placeholder?: string;
}

export interface LongTextConfig {
  type: 'longText';
  placeholder?: string;
}

export interface NumberConfig {
  type: 'number';
  /** Optional unit suffix (e.g. "kg", "%"). */
  unit?: string;
  /** Optional decimals count for display. */
  precision?: number;
  min?: number;
  max?: number;
}

export interface DateConfig {
  type: 'date';
  /** Display only date part vs full datetime. Default: 'date'. */
  granularity?: 'date' | 'datetime';
}

export interface DateRangeConfig {
  type: 'dateRange';
  granularity?: 'date' | 'datetime';
}

export interface CheckboxConfig {
  type: 'checkbox';
}

export interface SelectConfig {
  type: 'select';
  options: PropertyOption[];
}

export interface MultiSelectConfig {
  type: 'multiSelect';
  options: PropertyOption[];
}

export interface UrlConfig {
  type: 'url';
}

export interface EmailConfig {
  type: 'email';
}

export interface RelationConfig {
  type: 'relation';
  /** Optional kind constraint — when set, only notes of these kinds are
   *  selectable. Empty / undefined = any note. */
  targetKinds?: EntityKind[];
  /** Allow multiple target notes? Default: true. */
  multiple?: boolean;
}

export interface PhoneConfig {
  type: 'phone';
  /** Optional ITU-T region hint shown as a placeholder (e.g. 'IT', 'US'). */
  region?: string;
}

/** A single uploaded file reference returned by the upload endpoint. */
export interface FileRef {
  /** Server-assigned id (UUID). Stable for the file's lifetime. */
  id: string;
  /** Original filename, sanitised for display only. */
  name: string;
  /** MIME type detected at upload. */
  mime: string;
  /** Size in bytes. */
  size: number;
  /** Public URL relative to the server origin (e.g. `/uploads/<id>/<name>`). */
  url: string;
  /** Upload timestamp (ISO 8601). */
  uploadedAt: string;
}

export interface FilesConfig {
  type: 'files';
  /** Maximum number of files allowed. Defaults to unlimited. */
  max?: number;
  /** Optional MIME prefix whitelist (e.g. `['image/', 'application/pdf']`). */
  accept?: string[];
}

/**
 * A status option behaves like a select option but additionally belongs to a
 * pipeline `group` (`todo` / `inProgress` / `done`) so cards can be grouped
 * and progress visualised consistently across views.
 */
export type StatusGroupId = 'todo' | 'inProgress' | 'done';

export interface StatusOption extends PropertyOption {
  group: StatusGroupId;
}

export interface StatusConfig {
  type: 'status';
  options: StatusOption[];
  /** Id of the option assigned to brand-new notes. */
  defaultOptionId?: string;
}

export interface RollupConfig {
  type: 'rollup';
  /** Key of the relation property on the same kind to walk through. */
  relationKey: string;
  /**
   * Key of the property on the related notes whose values are aggregated.
   * Optional for `count` aggregations.
   */
  targetKey?: string;
  /** Aggregation function. */
  aggregation: 'count' | 'countNotEmpty' | 'sum' | 'avg' | 'min' | 'max' | 'showOriginal';
}

export interface FormulaConfig {
  type: 'formula';
  /**
   * Tiny safe expression evaluated server-side. Supported syntax:
   *   – numeric literals, strings, booleans (`true` / `false`).
   *   – `prop("key")` / `prop('key')` to read another property's value.
   *   – binary `+ - * / %` and unary `-`.
   *   – comparison `== != < <= > >=`.
   *   – logical `&& ||` and ternary `cond ? a : b`.
   *   – calls: `abs`, `round`, `floor`, `ceil`, `min`, `max`, `length`,
   *     `concat`, `if`, `lower`, `upper`, `coalesce`.
   */
  expression: string;
  /** Output type hint for display. */
  output?: 'number' | 'string' | 'boolean';
  /** Optional decimals when `output='number'`. */
  precision?: number;
}

export interface ButtonAction {
  /** What the button does when clicked. */
  type: 'open-url' | 'set-property' | 'increment-property';
  /** For `open-url`. */
  url?: string;
  /** For `set-property` and `increment-property` — target property key. */
  targetKey?: string;
  /** Value to assign for `set-property`; `null` / omitted clears the target. */
  value?: unknown;
  /** Increment delta for `increment-property`. Default `1`. */
  delta?: number;
}

export interface ButtonConfig {
  type: 'button';
  /** Caption shown on the button (defaults to property label when blank). */
  label?: string;
  /** Visual variant. */
  variant?: 'primary' | 'ghost';
  /** Action descriptor executed by the client. */
  action: ButtonAction;
}

export interface CreatedTimeConfig {
  type: 'createdTime';
  granularity?: 'date' | 'datetime';
}

export interface CreatedByConfig {
  type: 'createdBy';
}

export interface LastEditedTimeConfig {
  type: 'lastEditedTime';
  granularity?: 'date' | 'datetime';
}

export interface LastEditedByConfig {
  type: 'lastEditedBy';
}

export interface UniqueIdConfig {
  type: 'uniqueId';
  /** Optional prefix shown before the sequence number, e.g. `TASK`. */
  prefix?: string;
}

export type VerificationState = 'unverified' | 'verified' | 'expired';

/**
 * Time units accepted by `VerificationConfig.ttl`. Stored as a discrete
 * unit + amount pair (rather than only seconds) so the UI can render the
 * original choice back to the user without losing precision — e.g. a
 * 1-month TTL stays "1 month" rather than reverse-engineered from days.
 */
export type DurationUnit =
  | 'seconds'
  | 'minutes'
  | 'hours'
  | 'days'
  | 'weeks'
  | 'months'
  | 'years';

/** Convert a (amount, unit) pair into milliseconds for date arithmetic. */
export const DURATION_UNIT_MS: Record<DurationUnit, number> = {
  seconds: 1_000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
  // Approximations: months and years use the Gregorian average so server
  // and client agree without any timezone/leap quirks. Good enough for
  // verification expiry windows; do not use for calendar arithmetic.
  months: 2_629_746_000,
  years: 31_556_952_000,
};

export const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
  seconds: 'Seconds',
  minutes: 'Minutes',
  hours: 'Hours',
  days: 'Days',
  weeks: 'Weeks',
  months: 'Months',
  years: 'Years',
};

export interface VerificationConfig {
  type: 'verification';
  /**
   * Optional verification lifetime expressed as `{ amount, unit }`. When
   * set, the UI flips the value to `expired` once
   * `now > verifiedAt + amount * DURATION_UNIT_MS[unit]`.
   *
   * `ttlDays` is the legacy v1 field — still accepted on read for
   * backwards compatibility but new writes should set `ttl`.
   */
  ttl?: { amount: number; unit: DurationUnit };
  /** @deprecated use `ttl`. Kept for backwards-compat reads. */
  ttlDays?: number;
}

export interface ProgressConfig {
  type: 'progress';
  /** Lower bound (inclusive). Default 0. */
  min?: number;
  /** Upper bound (inclusive). Default 100. */
  max?: number;
  /** Whether to render the value as a percentage suffix. Default true. */
  showPercent?: boolean;
}

export type PropertyConfig =
  | TextConfig
  | LongTextConfig
  | NumberConfig
  | DateConfig
  | DateRangeConfig
  | CheckboxConfig
  | SelectConfig
  | MultiSelectConfig
  | UrlConfig
  | EmailConfig
  | RelationConfig
  | PhoneConfig
  | FilesConfig
  | StatusConfig
  | RollupConfig
  | FormulaConfig
  | ButtonConfig
  | CreatedTimeConfig
  | CreatedByConfig
  | LastEditedTimeConfig
  | LastEditedByConfig
  | UniqueIdConfig
  | VerificationConfig
  | ProgressConfig;

/** A property definition as exposed by the REST API. */
export interface PropertyDefinition {
  id: UUID;
  scope: PropertyScope;
  /** Owning kind id when `scope='kind'`; `null` otherwise. */
  kindId: EntityKind | null;
  /** Owning note id when `scope='note'`; `null` otherwise. */
  noteId: UUID | null;
  /** Stable identifier (slug). Immutable once created. */
  key: string;
  /** Display label. Rename-safe. */
  label: string;
  type: PropertyType;
  /** Optional icon name (UI hint). */
  icon: string | null;
  /** Optional human description. */
  description: string | null;
  /** Type-specific configuration. */
  config: PropertyConfig;
  /** LexoRank string for stable ordering inside a kind. */
  position: string;
  createdAt: string;
  updatedAt: string;
}

// ───────── Per-type values (discriminated union by `type`) ─────────

export interface TextValue {
  type: 'text';
  value: string;
}
export interface LongTextValue {
  type: 'longText';
  value: string;
}
export interface NumberValue {
  type: 'number';
  value: number;
}
export interface DateValue {
  type: 'date';
  /** ISO 8601 string. */
  value: string;
}
export interface DateRangeValue {
  type: 'dateRange';
  /** ISO 8601. `to` may equal `from` for a single-day range. */
  value: { from: string; to: string };
}
export interface CheckboxValue {
  type: 'checkbox';
  value: boolean;
}
/** A select stores the option `id`, not its label. */
export interface SelectValue {
  type: 'select';
  value: string;
}
export interface MultiSelectValue {
  type: 'multiSelect';
  value: string[];
}
export interface UrlValue {
  type: 'url';
  value: string;
}
export interface EmailValue {
  type: 'email';
  value: string;
}
/** Relation stores target note ids. */
export interface RelationValue {
  type: 'relation';
  value: UUID[];
}

export interface PhoneValue {
  type: 'phone';
  value: string;
}

export interface FilesValue {
  type: 'files';
  value: FileRef[];
}

/** Status stores the option `id`, just like select. */
export interface StatusValue {
  type: 'status';
  value: string;
}

/**
 * Rollup is computed server-side. The wire shape carries the resolved
 * value so the UI doesn't have to recompute. `null` for `value` means
 * "nothing to aggregate".
 */
export interface RollupValue {
  type: 'rollup';
  value: number | string | null;
  /** How many related notes contributed to the aggregation. */
  count: number;
}

export interface FormulaValue {
  type: 'formula';
  value: number | string | boolean | null;
  /** Surface evaluation errors to the UI without breaking the request. */
  error?: string;
}

/** Button properties have no stored value — the UI fires the action. */
export interface ButtonValue {
  type: 'button';
}

export interface CreatedTimeValue {
  type: 'createdTime';
  value: string;
}

export interface CreatedByValue {
  type: 'createdBy';
  value: string;
}

export interface LastEditedTimeValue {
  type: 'lastEditedTime';
  value: string;
}

export interface LastEditedByValue {
  type: 'lastEditedBy';
  value: string;
}

export interface UniqueIdValue {
  type: 'uniqueId';
  /** Sequence number assigned to the note for this property. */
  sequence: number;
  /** Pre-rendered display string (`prefix-sequence` or just `sequence`). */
  value: string;
}

export interface VerificationValue {
  type: 'verification';
  state: VerificationState;
  /** ISO 8601 timestamp of the verification action. */
  verifiedAt: string | null;
}

export interface ProgressValue {
  type: 'progress';
  value: number;
}

export type PropertyValue =
  | TextValue
  | LongTextValue
  | NumberValue
  | DateValue
  | DateRangeValue
  | CheckboxValue
  | SelectValue
  | MultiSelectValue
  | UrlValue
  | EmailValue
  | RelationValue
  | PhoneValue
  | FilesValue
  | StatusValue
  | RollupValue
  | FormulaValue
  | ButtonValue
  | CreatedTimeValue
  | CreatedByValue
  | LastEditedTimeValue
  | LastEditedByValue
  | UniqueIdValue
  | VerificationValue
  | ProgressValue;

/** A property + its current value for a given note. Returned by GET /notes/:id/properties. */
export interface NoteProperty {
  definition: PropertyDefinition;
  /** Null when the user has not set a value for this property yet. */
  value: PropertyValue | null;
}

/** Per-type defaults used by the UI when a value is cleared / unset. */
export function emptyValueFor(type: PropertyType): PropertyValue {
  switch (type) {
    case 'text':
      return { type: 'text', value: '' };
    case 'longText':
      return { type: 'longText', value: '' };
    case 'number':
      return { type: 'number', value: 0 };
    case 'date':
      return { type: 'date', value: '' };
    case 'dateRange':
      return { type: 'dateRange', value: { from: '', to: '' } };
    case 'checkbox':
      return { type: 'checkbox', value: false };
    case 'select':
      return { type: 'select', value: '' };
    case 'multiSelect':
      return { type: 'multiSelect', value: [] };
    case 'url':
      return { type: 'url', value: '' };
    case 'email':
      return { type: 'email', value: '' };
    case 'relation':
      return { type: 'relation', value: [] };
    case 'phone':
      return { type: 'phone', value: '' };
    case 'files':
      return { type: 'files', value: [] };
    case 'status':
      return { type: 'status', value: '' };
    case 'rollup':
      return { type: 'rollup', value: null, count: 0 };
    case 'formula':
      return { type: 'formula', value: null };
    case 'button':
      return { type: 'button' };
    case 'createdTime':
      return { type: 'createdTime', value: '' };
    case 'createdBy':
      return { type: 'createdBy', value: '' };
    case 'lastEditedTime':
      return { type: 'lastEditedTime', value: '' };
    case 'lastEditedBy':
      return { type: 'lastEditedBy', value: '' };
    case 'uniqueId':
      return { type: 'uniqueId', sequence: 0, value: '' };
    case 'verification':
      return { type: 'verification', state: 'unverified', verifiedAt: null };
    case 'progress':
      return { type: 'progress', value: 0 };
  }
}

/** Default configuration for a freshly-created property of the given type. */
export function defaultConfigFor(type: PropertyType): PropertyConfig {
  switch (type) {
    case 'text':
      return { type: 'text' };
    case 'longText':
      return { type: 'longText' };
    case 'number':
      return { type: 'number' };
    case 'date':
      return { type: 'date', granularity: 'date' };
    case 'dateRange':
      return { type: 'dateRange', granularity: 'date' };
    case 'checkbox':
      return { type: 'checkbox' };
    case 'select':
      return { type: 'select', options: [] };
    case 'multiSelect':
      return { type: 'multiSelect', options: [] };
    case 'url':
      return { type: 'url' };
    case 'email':
      return { type: 'email' };
    case 'relation':
      return { type: 'relation', multiple: true };
    case 'phone':
      return { type: 'phone' };
    case 'files':
      return { type: 'files' };
    case 'status':
      return { type: 'status', options: defaultStatusOptions() };
    case 'rollup':
      return { type: 'rollup', relationKey: '', aggregation: 'count' };
    case 'formula':
      return { type: 'formula', expression: '', output: 'number' };
    case 'button':
      return {
        type: 'button',
        variant: 'ghost',
        action: { type: 'open-url', url: '' },
      };
    case 'createdTime':
      return { type: 'createdTime', granularity: 'datetime' };
    case 'createdBy':
      return { type: 'createdBy' };
    case 'lastEditedTime':
      return { type: 'lastEditedTime', granularity: 'datetime' };
    case 'lastEditedBy':
      return { type: 'lastEditedBy' };
    case 'uniqueId':
      return { type: 'uniqueId' };
    case 'verification':
      return { type: 'verification' };
    case 'progress':
      return { type: 'progress', min: 0, max: 100, showPercent: true };
  }
}

/**
 * Built-in status pipeline used as the default seed for a new status
 * property. Mirrors the Notion preset so users have a familiar starting
 * point that they can rename or extend in place.
 */
export function defaultStatusOptions(): StatusOption[] {
  return [
    { id: 'not-started', label: 'Not started', color: '#9A9286', group: 'todo' },
    { id: 'in-progress', label: 'In progress', color: '#D4A24C', group: 'inProgress' },
    { id: 'done', label: 'Done', color: '#7A9E7E', group: 'done' },
  ];
}

/** Human-readable labels for the three status pipeline groups. */
export const STATUS_GROUP_LABELS: Record<StatusGroupId, string> = {
  todo: 'To-do',
  inProgress: 'In progress',
  done: 'Complete',
};

/** Human-readable label for a property type. UI metadata. */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  text: 'Text',
  longText: 'Long text',
  number: 'Number',
  date: 'Date',
  dateRange: 'Date range',
  checkbox: 'Checkbox',
  select: 'Select',
  multiSelect: 'Multi-select',
  url: 'URL',
  email: 'Email',
  relation: 'Relation',
  phone: 'Phone',
  files: 'Files & media',
  status: 'Status',
  rollup: 'Rollup',
  formula: 'Formula',
  button: 'Button',
  createdTime: 'Created time',
  createdBy: 'Created by',
  lastEditedTime: 'Last edited time',
  lastEditedBy: 'Last edited by',
  uniqueId: 'Unique ID',
  verification: 'Verification',
  progress: 'Progress',
};

/** Icon name (Continuum icon registry) suggested per property type. */
export const PROPERTY_TYPE_ICONS: Record<PropertyType, string> = {
  text: 'prop-text',
  longText: 'prop-long-text',
  number: 'prop-number',
  date: 'prop-date',
  dateRange: 'prop-date-range',
  checkbox: 'prop-checkbox',
  select: 'prop-select',
  multiSelect: 'prop-multi-select',
  url: 'prop-url',
  email: 'prop-email',
  relation: 'prop-relation',
  phone: 'prop-phone',
  files: 'prop-files',
  status: 'prop-status',
  rollup: 'prop-rollup',
  formula: 'prop-formula',
  button: 'prop-button',
  createdTime: 'prop-created-time',
  createdBy: 'prop-created-by',
  lastEditedTime: 'prop-edited-time',
  lastEditedBy: 'prop-edited-by',
  uniqueId: 'prop-unique-id',
  verification: 'prop-verification',
  progress: 'prop-progress',
};

/**
 * Placeholder text shown by editors when the property has no value yet.
 * Designed to communicate the *shape* of the expected input at a glance,
 * Notion-style.
 */
export const PROPERTY_TYPE_PLACEHOLDERS: Record<PropertyType, string> = {
  text: 'Empty',
  longText: 'Add a description…',
  number: '0',
  date: 'Pick a date',
  dateRange: 'Pick a range',
  checkbox: '',
  select: 'Select an option',
  multiSelect: 'Select options',
  url: 'https://example.com',
  email: 'name@example.com',
  relation: 'Link a note',
  phone: '+1 555 0100',
  files: 'Drop files or click to upload',
  status: 'Set status',
  rollup: 'Computed from related notes',
  formula: 'Computed from expression',
  button: 'Click to run',
  createdTime: 'Auto-managed',
  createdBy: 'Auto-managed',
  lastEditedTime: 'Auto-managed',
  lastEditedBy: 'Auto-managed',
  uniqueId: 'Auto-assigned',
  verification: 'Mark as verified',
  progress: '0%',
};

/** Default colour palette used for new select / multiSelect options. */
export const PROPERTY_OPTION_COLORS: string[] = [
  '#8C7B6A',
  '#C96E4A',
  '#7A9E7E',
  '#D4A24C',
  '#5B7B95',
  '#A87CA0',
  '#B5563E',
  '#6B8E8E',
  '#A89580',
  '#9A9286',
];
