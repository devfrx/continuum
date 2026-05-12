/**
 * Shared read-only display logic for property values.
 *
 * Pure helper extracted to keep `CellRenderer.vue` lean while still
 * matching the visual taxonomy of `PropertyRow.vue` (chip / link /
 * checkbox / relation / plain text). Returning a tagged union lets the
 * template render each variant with the correct element and styling
 * without sprinkling type-checks across the markup.
 */
import type {
  PropertyDefinition,
  PropertyOption,
  PropertyValue,
  StatusOption,
} from '@continuum/shared';

/** One pill rendered by the `chips` variant. */
export interface ReadonlyChip {
  label: string;
  color?: string;
  id?: string;
}

/** Discriminated union of every read-only display variant. */
export type ReadonlyDisplay =
  | { kind: 'empty'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'checkbox'; text: string; checked: boolean }
  | { kind: 'chips'; chips: ReadonlyChip[] }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'relation'; ids: string[] };

function formatDate(value: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

function optionsFor(definition: PropertyDefinition): PropertyOption[] {
  const config = definition.config;
  if (config.type === 'select' || config.type === 'multiSelect') return config.options;
  if (config.type === 'status') return config.options as StatusOption[];
  return [];
}

function optionChip(definition: PropertyDefinition, id: string): ReadonlyChip {
  const option = optionsFor(definition).find((item) => item.id === id);
  return option ? { label: option.label, color: option.color } : { label: id };
}

function urlHref(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
}

/**
 * Convert a `PropertyValue` (or `null`) into a renderable display
 * descriptor. Unknown / unset values collapse to the `empty` variant so
 * the table never shows a stray hyphen.
 */
export function readonlyValue(
  definition: PropertyDefinition,
  value: PropertyValue | null,
): ReadonlyDisplay {
  if (!value) return { kind: 'empty', text: 'Empty' };

  switch (value.type) {
    case 'text':
    case 'longText': {
      const text = value.value.trim();
      return text ? { kind: 'text', text } : { kind: 'empty', text: 'Empty' };
    }
    case 'number': {
      const config = definition.config;
      const precision = config.type === 'number' ? config.precision : undefined;
      const unit = config.type === 'number' && config.unit ? ` ${config.unit}` : '';
      const text =
        typeof precision === 'number' ? value.value.toFixed(precision) : String(value.value);
      return { kind: 'text', text: `${text}${unit}` };
    }
    case 'date': {
      const text = formatDate(value.value);
      return text ? { kind: 'text', text } : { kind: 'empty', text: 'Empty' };
    }
    case 'dateRange': {
      const from = formatDate(value.value.from);
      const to = formatDate(value.value.to);
      if (!from && !to) return { kind: 'empty', text: 'Empty' };
      return { kind: 'text', text: [from, to].filter(Boolean).join(' → ') };
    }
    case 'checkbox':
      return { kind: 'checkbox', checked: value.value, text: value.value ? 'Yes' : 'No' };
    case 'select':
      return value.value
        ? { kind: 'chips', chips: [optionChip(definition, value.value)] }
        : { kind: 'empty', text: 'Empty' };
    case 'multiSelect':
      return value.value.length
        ? { kind: 'chips', chips: value.value.map((id) => optionChip(definition, id)) }
        : { kind: 'empty', text: 'Empty' };
    case 'url': {
      const text = value.value.trim();
      return text
        ? { kind: 'link', text, href: urlHref(text) }
        : { kind: 'empty', text: 'Empty' };
    }
    case 'email': {
      const text = value.value.trim();
      return text
        ? { kind: 'link', text, href: `mailto:${text}` }
        : { kind: 'empty', text: 'Empty' };
    }
    case 'phone': {
      const text = value.value.trim();
      return text
        ? { kind: 'link', text, href: `tel:${text.replace(/\s+/g, '')}` }
        : { kind: 'empty', text: 'Empty' };
    }
    case 'relation':
      return value.value.length
        ? { kind: 'relation', ids: value.value }
        : { kind: 'empty', text: 'Empty' };
    case 'status':
      return value.value
        ? { kind: 'chips', chips: [optionChip(definition, value.value)] }
        : { kind: 'empty', text: 'Empty' };
    case 'progress':
      return { kind: 'text', text: `${value.value}` };
    case 'verification':
      return value.state === 'verified'
        ? { kind: 'text', text: '✓ Verified' }
        : value.state === 'expired'
          ? { kind: 'text', text: '⚠ Expired' }
          : { kind: 'empty', text: 'Not verified' };
    case 'files':
      return value.value.length
        ? { kind: 'chips', chips: value.value.map((f) => ({ label: f.name })) }
        : { kind: 'empty', text: 'Empty' };
    case 'uniqueId':
      return value.value ? { kind: 'text', text: value.value } : { kind: 'empty', text: '—' };
    case 'createdTime':
    case 'lastEditedTime': {
      const text = value.value ? formatDate(value.value) : '';
      return text ? { kind: 'text', text } : { kind: 'empty', text: '—' };
    }
    case 'createdBy':
    case 'lastEditedBy':
      return value.value ? { kind: 'text', text: value.value } : { kind: 'empty', text: '—' };
    case 'formula':
    case 'rollup':
      return value.value === null || value.value === undefined
        ? { kind: 'empty', text: '—' }
        : { kind: 'text', text: String(value.value) };
    case 'button':
      return { kind: 'empty', text: '—' };
  }
}
