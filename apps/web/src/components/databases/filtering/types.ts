/**
 * databases/filtering/types.ts — public surface for the database-view
 * filter & sort engine.
 *
 * We re-export the canonical filter/sort tree shapes from
 * `@continuum/shared` so every database surface (the panel UI, the
 * row-pipeline composable, the per-property operator catalogue) talks
 * the same language as the rest of the app. Keeping the imports here
 * means downstream files (operators, evaluate, panels) only ever depend
 * on this one local module.
 *
 * The engine is intentionally self-contained: it does NOT use the
 * server-driven `FieldCatalog` consumed by the graph filter UI, since
 * a database view already owns its own `PropertyDefinition[]` schema
 * locally and synchronous evaluation must work offline.
 */
import type {
    FilterCondition,
    FilterGroup,
    FilterNode,
    FilterOperatorId,
    FilterValue,
    PropertyDefinition,
    PropertyType,
    SortDirection,
    SortRule,
} from '@continuum/shared';

export type {
    FilterCondition,
    FilterGroup,
    FilterNode,
    FilterOperatorId,
    FilterValue,
    PropertyDefinition,
    PropertyType,
    SortDirection,
    SortRule,
};

/**
 * Stable identifier for the "row.title" pseudo-field. Database rows
 * always carry the underlying note's title even when the schema has no
 * `title` property, so sort/filter rules over the title work for every
 * datasource without special-casing the catalogue.
 */
export const TITLE_FIELD_ID = 'row.title' as const;

/** Discriminator covering both real property ids and the title pseudo-field. */
export type DatabaseFieldId = string;

/**
 * Compact descriptor surfaced to the filter & sort UIs. The shape
 * intentionally mirrors what those panels render — label + icon + a
 * small set of operator metadata — so panel code never has to peek
 * into a raw `PropertyDefinition`.
 */
export interface DatabaseFieldDescriptor {
    /** Either a property `id` or `TITLE_FIELD_ID`. */
    id: DatabaseFieldId;
    /** Human-readable label shown in field pickers. */
    label: string;
    /** Property type driving the operator menu (or 'text' for the title). */
    type: PropertyType;
    /** Pre-filtered operator list for this property type. */
    operators: readonly FilterOperatorId[];
    /** Underlying definition; `null` for the title pseudo-field. */
    definition: PropertyDefinition | null;
}
