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
  'text',
  'longText',
  'number',
  'date',
  'dateRange',
  'checkbox',
  'select',
  'multiSelect',
  'url',
  'email',
  'relation',
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

/** Where a property definition is mounted. */
export type PropertyScope = 'kind' | 'global';

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
  | RelationConfig;

/** A property definition as exposed by the REST API. */
export interface PropertyDefinition {
  id: UUID;
  scope: PropertyScope;
  /** Owning kind id when `scope='kind'`; `null` for `scope='global'`. */
  kindId: EntityKind | null;
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
  | RelationValue;

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
  }
}

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
