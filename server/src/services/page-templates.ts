/**
 * Page Templates service — CRUD + (de)serialization helpers.
 *
 * Templates are first-class entities. They bundle:
 *   – Editor body (markdown + optional TipTap JSON snapshot).
 *   – Property schema with optional pre-filled values.
 *   – Soft metadata (`targetKind`, `tags`) consumed by pickers.
 *
 * Persisted across two tables (`page_templates`, `template_properties`)
 * and read back as a single `PageTemplate` DTO for the wire.
 */
import { asc, eq } from 'drizzle-orm';
import type {
  PageTemplate,
  PropertyConfig,
  PropertyDefinition,
  PropertyType,
  PropertyValue,
  TemplatePropertyDefinition,
} from '@continuum/shared';
import { db } from '../db/client.js';
import {
  pageTemplates,
  templateProperties,
  type PageTemplateRow,
  type TemplatePropertyRow,
} from '../db/schema.js';
import {
  configSchemaFor,
  valueSchemaFor,
} from './properties.js';

/** Map a `page_templates` row + its property rows to the public DTO. */
export function pageTemplateRowToDto(
  row: PageTemplateRow,
  propertyRows: TemplatePropertyRow[],
): PageTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    targetKind: row.targetKind,
    content: row.content,
    contentJson: row.contentJson ?? null,
    tags: row.tags,
    version: row.version,
    properties: propertyRows
      .slice()
      .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
      .map(templatePropertyRowToDto),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Map a `template_properties` row to the public DTO. */
export function templatePropertyRowToDto(
  row: TemplatePropertyRow,
): TemplatePropertyDefinition {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type as PropertyType,
    icon: row.icon,
    description: row.description,
    config: row.config as PropertyConfig,
    defaultValue: (row.defaultValue ?? null) as PropertyValue | null,
    position: row.position,
  };
}

/** Load one template (with its properties) by id. Returns `null` when missing. */
export async function loadTemplate(id: string): Promise<PageTemplate | null> {
  const [row] = await db
    .select()
    .from(pageTemplates)
    .where(eq(pageTemplates.id, id))
    .limit(1);
  if (!row) return null;
  const props = await db
    .select()
    .from(templateProperties)
    .where(eq(templateProperties.templateId, id))
    .orderBy(asc(templateProperties.position));
  return pageTemplateRowToDto(row, props);
}

/** List every template (no property bodies). Used by the picker. */
export async function listTemplates(): Promise<PageTemplate[]> {
  const rows = await db.select().from(pageTemplates).orderBy(asc(pageTemplates.name));
  if (rows.length === 0) return [];
  const allProps = await db.select().from(templateProperties);
  const byTemplate = new Map<string, TemplatePropertyRow[]>();
  for (const p of allProps) {
    const list = byTemplate.get(p.templateId) ?? [];
    list.push(p);
    byTemplate.set(p.templateId, list);
  }
  return rows.map((r) => pageTemplateRowToDto(r, byTemplate.get(r.id) ?? []));
}

/**
 * Bump a template's `version` and refresh `updatedAt`. Called from the
 * routes layer after every meaningful mutation (body or properties).
 */
export async function bumpTemplateVersion(id: string): Promise<void> {
  await db
    .update(pageTemplates)
    .set({
      version: (await currentVersion(id)) + 1,
      updatedAt: new Date(),
    })
    .where(eq(pageTemplates.id, id));
}

async function currentVersion(id: string): Promise<number> {
  const [row] = await db
    .select({ v: pageTemplates.version })
    .from(pageTemplates)
    .where(eq(pageTemplates.id, id))
    .limit(1);
  return row ? row.v : 0;
}

/**
 * Validate a `defaultValue` JSON against the property's type+config.
 * Returns the parsed value (or `null` when no default is supplied).
 * Throws when the value is set but invalid for the supplied definition.
 *
 * Pass a synthetic `PropertyDefinition`-shaped object: the validator
 * only consults `type` and `config`, so the other fields can be stubs.
 */
export function parseDefaultValue(
  type: PropertyType,
  config: PropertyConfig,
  raw: unknown,
): PropertyValue | null {
  if (raw === null || raw === undefined) return null;
  const stub: PropertyDefinition = {
    id: '00000000-0000-0000-0000-000000000000',
    scope: 'note',
    kindId: null,
    noteId: null,
    databaseId: null,
    key: '_',
    label: '_',
    type,
    icon: null,
    description: null,
    config,
    position: 'a0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const parser = valueSchemaFor(stub);
  return parser.parse(raw) as PropertyValue;
}

/** Convenience: validate a config payload for the given property type. */
export function parseConfig(type: PropertyType, raw: unknown): PropertyConfig {
  const parser = configSchemaFor(type);
  return parser.parse(raw ?? { type }) as PropertyConfig;
}
