/**
 * Template application service.
 *
 * Given a target note + a `PageTemplate`, produce either a preview
 * (`previewTemplateApplication`) or a fully-applied merge
 * (`applyTemplate`). Both code paths share the same resolution logic so
 * the UI can show the same warnings on preview and after-apply.
 *
 * Merge contract — **non-destructive by default**:
 *   – Property keys already present on the note are SKIPPED and surfaced
 *     as a `property-key-exists` conflict. Existing values are NEVER
 *     overwritten.
 *   – Default values are applied only to newly-created note-scoped
 *     definitions, only when `applyDefaults !== false`, and only when
 *     they validate against the type/config.
 *   – Computed/button properties never receive a default (silently
 *     skipped with a `computed-default-skipped` conflict if one is set).
 *   – Body merge follows `contentPlacement`. `replace-empty-only` keeps
 *     the existing body when non-empty and emits a `content-not-empty`
 *     warning.
 *   – Locked notes are NEVER mutated; the caller must reject the apply
 *     with a 423 before reaching this service.
 */
import { and, asc, eq } from 'drizzle-orm';
import type {
  NoteRow,
  PropertyDefinitionRow,
} from '../db/schema.js';
import type {
  PageTemplate,
  PropertyType,
  TemplateApplicationConflict,
  TemplateApplicationOptions,
  TemplateApplicationPreview,
  TemplateApplicationResult,
  TemplateContentPlacement,
  TemplatePropertyDefinition,
} from '@continuum/shared';
import { isComputedPropertyType } from '@continuum/shared';
import { db } from '../db/client.js';
import {
  notes,
  pageTemplateApplications,
  propertyDefinitions,
  propertyValues,
} from '../db/schema.js';
import {
  valueDtoToRow,
  valueSchemaFor,
  definitionRowToDto,
} from './properties.js';

interface ResolvedPlan {
  propertyKeysToCreate: string[];
  propertyKeysToSkip: string[];
  contentChange: 'append' | 'prepend' | 'replace' | 'none';
  tagsToAdd: string[];
  conflicts: TemplateApplicationConflict[];
  /** Properties that will materialise; index aligned with `propertyKeysToCreate`. */
  materialise: Array<{
    property: TemplatePropertyDefinition;
    /** Validated default to write, or `null` to skip the value write. */
    defaultToApply: ReturnType<typeof valueDtoToRow> | null;
  }>;
  /** Body text computed after merge — only set when contentChange !== 'none'. */
  nextContent?: string;
  /** TipTap JSON computed after merge — only set when contentChange !== 'none'. */
  nextContentJson?: unknown;
}

/** Default merge options used when the caller doesn't override them. */
function withDefaults(opts: TemplateApplicationOptions = {}): Required<TemplateApplicationOptions> {
  return {
    contentPlacement: opts.contentPlacement ?? 'append',
    mergeTags: opts.mergeTags ?? true,
    applyDefaults: opts.applyDefaults ?? true,
  };
}

/**
 * Compute the merge plan without mutating anything. Returns the same
 * conflicts the apply path would surface so the UI can render an
 * accurate preview dialog.
 */
export async function previewTemplateApplication(
  note: NoteRow,
  template: PageTemplate,
  options: TemplateApplicationOptions = {},
): Promise<TemplateApplicationPreview> {
  const plan = await resolvePlan(note, template, withDefaults(options));
  return {
    templateId: template.id,
    templateVersion: template.version,
    propertyKeysToCreate: plan.propertyKeysToCreate,
    propertyKeysToSkip: plan.propertyKeysToSkip,
    contentChange: plan.contentChange,
    tagsToAdd: plan.tagsToAdd,
    conflicts: plan.conflicts,
  };
}

/**
 * Apply the template to the note inside a single transaction. The
 * note's `locked` flag must be checked by the caller — this service
 * assumes the caller already returned 423 for locked notes.
 */
export async function applyTemplate(
  note: NoteRow,
  template: PageTemplate,
  options: TemplateApplicationOptions = {},
): Promise<TemplateApplicationResult> {
  const opts = withDefaults(options);
  const plan = await resolvePlan(note, template, opts);

  await db.transaction(async (tx) => {
    // 1. Body merge.
    const bodyPatch: { content?: string; contentJson?: unknown; tags?: string[]; updatedAt: Date } = {
      updatedAt: new Date(),
    };
    if (plan.contentChange !== 'none') {
      bodyPatch.content = plan.nextContent ?? note.content;
      bodyPatch.contentJson = plan.nextContentJson ?? null;
    }
    if (opts.mergeTags && plan.tagsToAdd.length > 0) {
      bodyPatch.tags = Array.from(new Set([...note.tags, ...plan.tagsToAdd]));
    }
    if (Object.keys(bodyPatch).length > 1) {
      await tx.update(notes).set(bodyPatch).where(eq(notes.id, note.id));
    }

    // 2. Materialise new note-scoped property definitions + defaults.
    for (const { property, defaultToApply } of plan.materialise) {
      const [createdDef] = await tx
        .insert(propertyDefinitions)
        .values({
          scope: 'note',
          kindId: null,
          noteId: note.id,
          key: property.key,
          label: property.label,
          type: property.type,
          icon: property.icon,
          description: property.description,
          config: property.config,
          position: property.position,
        })
        .returning();
      if (defaultToApply && createdDef) {
        await tx.insert(propertyValues).values({
          noteId: note.id,
          propertyId: createdDef.id,
          ...defaultToApply,
        });
      }
    }

    // 3. Provenance record.
    await tx.insert(pageTemplateApplications).values({
      noteId: note.id,
      templateId: template.id,
      templateVersion: template.version,
      appliedContent: plan.contentChange,
      appliedPropertyKeys: plan.propertyKeysToCreate,
      conflicts: plan.conflicts,
    });
  });

  return {
    noteId: note.id,
    templateId: template.id,
    templateVersion: template.version,
    appliedPropertyKeys: plan.propertyKeysToCreate,
    conflicts: plan.conflicts,
  };
}

// ─────────────────────────────── Internals ──────────────────────────────

async function resolvePlan(
  note: NoteRow,
  template: PageTemplate,
  opts: Required<TemplateApplicationOptions>,
): Promise<ResolvedPlan> {
  // Pull the note's existing note-scoped property keys so we can detect
  // collisions in O(1). We don't care about kind/global scope here:
  // templates only ever create note-scoped definitions, so the only
  // collision domain is the note's own schema.
  const existingDefs = await db
    .select()
    .from(propertyDefinitions)
    .where(
      and(
        eq(propertyDefinitions.noteId, note.id),
        eq(propertyDefinitions.scope, 'note'),
      ),
    )
    .orderBy(asc(propertyDefinitions.position));
  const existingKeys = new Set(existingDefs.map((d) => d.key));
  const lastPosition = lastPositionOf(existingDefs);

  const conflicts: TemplateApplicationConflict[] = [];
  const propertyKeysToCreate: string[] = [];
  const propertyKeysToSkip: string[] = [];
  const materialise: ResolvedPlan['materialise'] = [];

  // Walk template properties in their declared order and assign fresh
  // positions appended after the note's existing definitions.
  let cursor = lastPosition;
  for (const prop of template.properties) {
    if (existingKeys.has(prop.key)) {
      propertyKeysToSkip.push(prop.key);
      conflicts.push({
        propertyKey: prop.key,
        reason: 'property-key-exists',
        message: `Property "${prop.label}" already exists on this note and was left untouched.`,
      });
      continue;
    }
    propertyKeysToCreate.push(prop.key);
    cursor = `${cursor}m`;

    let defaultToApply: ReturnType<typeof valueDtoToRow> | null = null;
    if (opts.applyDefaults && prop.defaultValue !== null) {
      if (
        prop.type === 'button' ||
        isComputedPropertyType(prop.type as PropertyType)
      ) {
        conflicts.push({
          propertyKey: prop.key,
          reason: 'computed-default-skipped',
          message: `Default value for "${prop.label}" was skipped (computed property).`,
        });
      } else {
        try {
          const def = definitionRowToDto({
            id: '00000000-0000-0000-0000-000000000000',
            scope: 'note',
            kindId: null,
            noteId: note.id,
            key: prop.key,
            label: prop.label,
            type: prop.type,
            icon: prop.icon,
            description: prop.description,
            config: prop.config,
            position: cursor,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as PropertyDefinitionRow);
          const parser = valueSchemaFor(def);
          const parsed = parser.parse(prop.defaultValue);
          defaultToApply = valueDtoToRow(parsed);
        } catch (err) {
          const message = err instanceof Error ? err.message : 'invalid default value';
          conflicts.push({
            propertyKey: prop.key,
            reason: 'invalid-default',
            message: `Default value for "${prop.label}" was skipped: ${message}`,
          });
        }
      }
    }

    materialise.push({
      property: { ...prop, position: cursor },
      defaultToApply,
    });
  }

  // ── Body merge planning ────────────────────────────────────────────
  const contentResult = planContentMerge(
    note.content,
    note.contentJson,
    template.content,
    template.contentJson,
    opts.contentPlacement,
  );
  if (contentResult.warning) conflicts.push(contentResult.warning);

  // ── Tag merge planning ─────────────────────────────────────────────
  const tagsToAdd = opts.mergeTags
    ? template.tags.filter((t) => !note.tags.includes(t))
    : [];

  return {
    propertyKeysToCreate,
    propertyKeysToSkip,
    contentChange: contentResult.contentChange,
    tagsToAdd,
    conflicts,
    materialise,
    nextContent: contentResult.nextContent,
    nextContentJson: contentResult.nextContentJson,
  };
}

interface ContentPlan {
  contentChange: 'append' | 'prepend' | 'replace' | 'none';
  nextContent?: string;
  nextContentJson?: unknown;
  warning?: TemplateApplicationConflict;
}

function planContentMerge(
  noteContent: string,
  noteContentJson: unknown,
  tplContent: string,
  tplContentJson: unknown,
  placement: TemplateContentPlacement,
): ContentPlan {
  // Nothing to do when the template body is empty.
  if (!tplContent && !tplContentJson) {
    return { contentChange: 'none' };
  }

  if (placement === 'replace-empty-only') {
    const noteIsEmpty = noteContent.trim().length === 0;
    if (!noteIsEmpty) {
      return {
        contentChange: 'none',
        warning: {
          propertyKey: '',
          reason: 'content-not-empty',
          message:
            'Note body was not replaced because it is not empty. Choose "Append" or "Prepend" to add the template body anyway.',
        },
      };
    }
    return {
      contentChange: 'replace',
      nextContent: tplContent,
      nextContentJson: tplContentJson ?? null,
    };
  }

  if (placement === 'prepend') {
    const nextContent = tplContent && noteContent
      ? `${tplContent}\n\n${noteContent}`
      : tplContent || noteContent;
    return {
      contentChange: 'prepend',
      nextContent,
      nextContentJson: mergeTipTap(tplContentJson, noteContentJson),
    };
  }

  // Default: append.
  const nextContent = tplContent && noteContent
    ? `${noteContent}\n\n${tplContent}`
    : noteContent || tplContent;
  return {
    contentChange: 'append',
    nextContent,
    nextContentJson: mergeTipTap(noteContentJson, tplContentJson),
  };
}

/**
 * Concatenate the `content` arrays of two TipTap documents in order.
 * Returns `null` when neither side carries a doc; falls back to the
 * non-null side when only one does. When one side is shaped unexpectedly
 * we keep the other side intact instead of throwing.
 */
function mergeTipTap(first: unknown, second: unknown): unknown {
  const firstDoc = asTipTapDoc(first);
  const secondDoc = asTipTapDoc(second);
  if (!firstDoc && !secondDoc) return null;
  if (!firstDoc) return secondDoc;
  if (!secondDoc) return firstDoc;
  return {
    ...firstDoc,
    content: [...firstDoc.content, ...secondDoc.content],
  };
}

interface TipTapDoc {
  type: string;
  content: unknown[];
  [k: string]: unknown;
}

function asTipTapDoc(value: unknown): TipTapDoc | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.type !== 'string') return null;
  if (!Array.isArray(v.content)) return null;
  return v as TipTapDoc;
}

function lastPositionOf(rows: { position: string }[]): string {
  if (rows.length === 0) return 'a0';
  return rows.reduce((acc, row) => (row.position > acc ? row.position : acc), 'a0');
}
