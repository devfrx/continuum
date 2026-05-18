// ===== Page Templates =====
//
// First-class reusable page templates. A template bundles three things:
//
//   1. An editor body (markdown + optional TipTap JSON snapshot) that is
//      pre-populated into a new note's editor.
//   2. A set of property definitions (label / type / config + optional
//      default value) that are materialised as **note-scoped** properties
//      on the target note.
//   3. Optional metadata (target kind hint, tags hint, description) used
//      by the UI to surface the template in pickers.
//
// Templates are NOT scoped by kind: many templates can target the same
// kind and each one carries its own block layout + property set. Applying
// a template to an existing note is **non-destructive by default** — the
// merge layer skips properties whose key is already in use on the target
// note and surfaces the skipped keys as `TemplateApplicationConflict`s.

import type { UUID, EntityKind } from './index.js';
import type {
  PropertyType,
  PropertyConfig,
  PropertyValue,
} from './properties.js';

/**
 * A single property definition carried by a template. Mirrors a subset of
 * {@link import('./properties.js').PropertyDefinition} (the user-editable
 * slice) plus an optional pre-filled `defaultValue` applied when the
 * template materialises the property on a note.
 */
export interface TemplatePropertyDefinition {
  id: UUID;
  /** Stable identifier (slug) — immutable once created. */
  key: string;
  /** Display label. */
  label: string;
  type: PropertyType;
  icon: string | null;
  description: string | null;
  config: PropertyConfig;
  /**
   * Optional value pre-filled when the template is applied. Must match
   * the property's `type`. Never set for computed / button properties.
   */
  defaultValue: PropertyValue | null;
  /** LexoRank-style ordering string. */
  position: string;
}

/** Where to put the template's editor body when applying to an existing note. */
export type TemplateContentPlacement =
  | 'append'
  | 'prepend'
  | 'replace-empty-only';

/**
 * Wire shape of a page template returned by the REST API. The `version`
 * field is bumped server-side on every PATCH that touches body or
 * properties so application records can pin to a specific revision.
 */
export interface PageTemplate {
  id: UUID;
  name: string;
  description: string | null;
  /**
   * Optional kind hint used to pre-select the kind picker when the
   * template is applied or when the user creates a note from it.
   * `null` means "no kind hint" — the user keeps the current note kind.
   */
  targetKind: EntityKind | null;
  /** Markdown editor body. */
  content: string;
  /** TipTap JSON snapshot mirroring `content`. */
  contentJson: unknown | null;
  /** Suggested tags applied to notes created from this template. */
  tags: string[];
  /** Monotonic revision number; bumped on each meaningful update. */
  version: number;
  /** Ordered property definitions carried by this template. */
  properties: TemplatePropertyDefinition[];
  createdAt: string;
  updatedAt: string;
}

/** Payload accepted by `POST /api/templates`. */
export interface TemplateCreateInput {
  name: string;
  description?: string | null;
  targetKind?: EntityKind | null;
  content?: string;
  contentJson?: unknown | null;
  tags?: string[];
}

/** Payload accepted by `PATCH /api/templates/:id`. */
export interface TemplateUpdateInput {
  name?: string;
  description?: string | null;
  targetKind?: EntityKind | null;
  content?: string;
  contentJson?: unknown | null;
  tags?: string[];
}

/**
 * Payload accepted by `POST /api/templates/:id/properties`. The route
 * derives the slug from `label` when `key` is omitted.
 */
export interface TemplatePropertyCreateInput {
  key?: string;
  label: string;
  type: PropertyType;
  icon?: string | null;
  description?: string | null;
  config?: PropertyConfig;
  defaultValue?: PropertyValue | null;
  position?: string;
}

/** Payload accepted by `PATCH /api/templates/:templateId/properties/:propId`. */
export interface TemplatePropertyUpdateInput {
  label?: string;
  icon?: string | null;
  description?: string | null;
  config?: PropertyConfig;
  defaultValue?: PropertyValue | null;
  position?: string;
}

/** Options controlling how a template is applied to an existing note. */
export interface TemplateApplicationOptions {
  /** How to merge the template body into the note body. Default: `append`. */
  contentPlacement?: TemplateContentPlacement;
  /** Merge tags (union, deduplicated). Default: `true`. */
  mergeTags?: boolean;
  /** Apply property `defaultValue`s to newly-created properties. Default: `true`. */
  applyDefaults?: boolean;
}

/** Reason a single property could not be applied during a merge. */
export type TemplateApplicationConflictReason =
  | 'property-key-exists'
  | 'computed-default-skipped'
  | 'invalid-default'
  | 'content-not-empty';

/** A single non-fatal warning surfaced by preview/apply. */
export interface TemplateApplicationConflict {
  /** Property key (when applicable) or empty string for body-level warnings. */
  propertyKey: string;
  reason: TemplateApplicationConflictReason;
  /** Human-readable explanation suitable for inline UI display. */
  message: string;
}

/**
 * Returned by `POST /api/notes/:noteId/template-preview` — describes what
 * applying the template would change, without performing the merge.
 */
export interface TemplateApplicationPreview {
  templateId: UUID;
  templateVersion: number;
  /** Property keys that would be created on the note. */
  propertyKeysToCreate: string[];
  /** Property keys present on both sides; left untouched by the merge. */
  propertyKeysToSkip: string[];
  /** Whether the merge would write to the note body and how. */
  contentChange: 'append' | 'prepend' | 'replace' | 'none';
  /** Tags that would be added (already-present tags excluded). */
  tagsToAdd: string[];
  conflicts: TemplateApplicationConflict[];
}

/**
 * Returned by `POST /api/notes/:noteId/apply-template` after a successful
 * merge. `appliedPropertyKeys` lists the new properties materialised on
 * the note; `conflicts` carries the same non-fatal warnings the preview
 * surfaced so the UI can render them as toasts after the apply.
 */
export interface TemplateApplicationResult {
  noteId: UUID;
  templateId: UUID;
  templateVersion: number;
  appliedPropertyKeys: string[];
  conflicts: TemplateApplicationConflict[];
}
