import { api } from '@/api';
import { publishDatabaseSchemaChanged } from '@/lib/realtime';
import {
    EMPTY_DATABASE_VIEW_CONFIG,
    type Database,
    type DatabaseView,
    type DatabaseViewConfig,
    type DatabaseViewType,
    type PropertyDefinition,
} from '@continuum/shared';
import { viewEntryFor } from './views/registry';
import type { LayoutPropertyRequirement } from './views/types';
import {
    buildViewLayoutContext,
    createPayloadForRequirement,
    layoutPatchFromResolutions,
    type LayoutRequirementResolution,
    missingPropertyRequirements,
    resolveLayoutRequirements,
    type RequiredPropertyCreateInput,
} from './views/layoutRequirements';

export interface DatabaseViewCreationIntent {
    type: DatabaseViewType;
    name?: string;
    config?: Partial<DatabaseViewConfig> | null;
}

export interface PreparedDatabaseViewCreation {
    type: DatabaseViewType;
    name: string;
    config?: Partial<DatabaseViewConfig>;
    schema: PropertyDefinition[];
    createdPropertyCount: number;
}

export interface CreatedLayoutRequirementProperties {
    schema: PropertyDefinition[];
    layoutPatch: Record<string, unknown>;
    createdPropertyCount: number;
}

export type MissingLayoutRequirementResolver = (
    viewLabel: string,
    requirements: readonly LayoutPropertyRequirement[],
) => Promise<RequiredPropertyCreateInput[] | null>;

export function defaultViewName(type: DatabaseViewType): string {
    return viewEntryFor(type).label;
}

export function defaultMissingLayoutInputs(
    requirements: readonly LayoutPropertyRequirement[],
): RequiredPropertyCreateInput[] {
    return requirements.map((requirement) => ({
        requirementKey: requirement.key,
        label: requirement.defaultLabel,
        type: requirement.defaultType,
    }));
}

export async function createMissingLayoutRequirementProperties(options: {
    databaseId: string;
    schema: PropertyDefinition[];
    missing: readonly LayoutRequirementResolution[];
    inputs: readonly RequiredPropertyCreateInput[];
}): Promise<CreatedLayoutRequirementProperties> {
    const byKey = new Map(options.inputs.map((input) => [input.requirementKey, input] as const));
    const created: PropertyDefinition[] = [];
    const layoutPatch: Record<string, unknown> = {};
    for (const resolution of options.missing) {
        const input = byKey.get(resolution.requirement.key);
        if (!input) continue;
        const property = await api.databases.properties.create(
            options.databaseId,
            createPayloadForRequirement(resolution.requirement, input),
        );
        created.push(property);
        layoutPatch[resolution.requirement.layoutKey] = property.id;
    }
    if (created.length > 0) publishDatabaseSchemaChanged(options.databaseId);
    return {
        schema: [...options.schema, ...created],
        layoutPatch,
        createdPropertyCount: created.length,
    };
}

export async function prepareDatabaseViewCreation(options: {
    blockId: string;
    database: Database;
    schema: PropertyDefinition[];
    existingViewCount: number;
    intent: DatabaseViewCreationIntent;
    resolveMissingRequirements: MissingLayoutRequirementResolver;
}): Promise<PreparedDatabaseViewCreation | null> {
    const entry = viewEntryFor(options.intent.type);
    const requestedLayout = objectLayout(options.intent.config?.layout);
    const syntheticView = syntheticDatabaseView({
        blockId: options.blockId,
        database: options.database,
        existingViewCount: options.existingViewCount,
        intent: options.intent,
        layout: requestedLayout,
    });
    const ctx = buildViewLayoutContext(
        { database: options.database, schema: options.schema, activeView: syntheticView },
        options.intent.type,
        requestedLayout,
    );
    const resolutions = resolveLayoutRequirements(entry.layoutRequirements ?? [], ctx);
    const missing = missingPropertyRequirements(resolutions);
    let schema = options.schema;
    let createdPropertyCount = 0;
    let layoutPatch = { ...requestedLayout, ...layoutPatchFromResolutions(resolutions) };

    if (missing.length > 0) {
        const requirements = missing.map((resolution) => resolution.requirement);
        const inputs = await options.resolveMissingRequirements(entry.label, requirements);
        if (!inputs) return null;
        const created = await createMissingLayoutRequirementProperties({
            databaseId: options.database.id,
            schema,
            missing,
            inputs,
        });
        schema = created.schema;
        createdPropertyCount = created.createdPropertyCount;
        layoutPatch = { ...layoutPatch, ...created.layoutPatch };
    }

    return {
        type: options.intent.type,
        name: options.intent.name?.trim() || defaultViewName(options.intent.type),
        config: configWithLayout(options.intent.config ?? null, layoutPatch),
        schema,
        createdPropertyCount,
    };
}

function syntheticDatabaseView(options: {
    blockId: string;
    database: Database;
    existingViewCount: number;
    intent: DatabaseViewCreationIntent;
    layout: Record<string, unknown>;
}): DatabaseView {
    return {
        id: '__new__',
        blockId: options.blockId,
        dataSourceDatabaseId: options.database.id,
        type: options.intent.type,
        name: options.intent.name ?? '',
        position: String(options.existingViewCount),
        config: {
            ...EMPTY_DATABASE_VIEW_CONFIG,
            ...(options.intent.config ?? {}),
            layout: options.layout,
        },
        createdAt: '',
        updatedAt: '',
    };
}

function objectLayout(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? { ...(value as Record<string, unknown>) }
        : {};
}

function configWithLayout(
    config: Partial<DatabaseViewConfig> | null,
    layout: Record<string, unknown>,
): Partial<DatabaseViewConfig> | undefined {
    const out: Partial<DatabaseViewConfig> = { ...(config ?? {}) };
    if (Object.keys(layout).length > 0) out.layout = layout;
    else delete out.layout;
    return Object.keys(out).length > 0 ? out : undefined;
}