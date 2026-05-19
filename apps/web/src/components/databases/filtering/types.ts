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

/**
 * Stable identifier for the synthetic "view conditional color" field —
 * the colour token a row currently matches under the active view's
 * conditional-color rules. Surfaced by `describeFields` only when the
 * caller opts in (the Filter and Sort panels do; the conditional-color
 * editor itself does not, to avoid circular rule references).
 */
export const CONDITIONAL_COLOR_FIELD_ID = 'view.conditionalColor' as const;

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
    /**
     * Optional inline option catalogue used by synthetic fields that
     * don't have a real `PropertyDefinition` (e.g. the conditional-color
     * field surfaces the active rules' colour tokens here). The value
     * editor reads this list before falling back to
     * `definition.config.options`.
     */
    options?: ReadonlyArray<{ id: string; label: string }>;
}
