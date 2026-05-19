/**
 * layoutRequirements.ts — declarative prerequisites for database views.
 *
 * Renderers stay focused on rendering. This module describes which
 * database-scoped properties a layout needs before it can behave well,
 * then exposes tiny resolvers used by DatabaseBody to auto-bind existing
 * properties or prompt for missing ones at the edge of user intent
 * (layout switch / add-row).
 */
import {
    defaultConfigFor,
    type DatabaseView,
    type DatabaseViewType,
    type PropertyConfig,
    type PropertyDefinition,
    type PropertyType,
} from '@continuum/shared';
import { isBoardGroupable } from './boardGrouping';
import type {
    AddRowSeed,
    LayoutPropertyRequirement,
    ViewLayoutContext,
} from './types';

const DATE_TYPES = ['date', 'dateRange'] as const satisfies readonly PropertyType[];
const TIMELINE_TYPES = [
    'date',
    'dateRange',
    'createdTime',
    'lastEditedTime',
] as const satisfies readonly PropertyType[];
const OPTION_TYPES = ['select', 'multiSelect', 'status'] as const satisfies readonly PropertyType[];

export interface LayoutRequirementResolution {
    requirement: LayoutPropertyRequirement;
    configuredId: string | null;
    candidates: PropertyDefinition[];
    selected: PropertyDefinition | null;
}

export interface RequiredPropertyCreateInput {
    requirementKey: string;
    label: string;
    type: PropertyType;
}

export interface RequiredPropertyCreatePayload {
    label: string;
    type: PropertyType;
    config: PropertyConfig;
}

export function isRequirementActive(
    requirement: LayoutPropertyRequirement,
    ctx: ViewLayoutContext,
): boolean {
    return requirement.requiredWhen ? requirement.requiredWhen(ctx) : true;
}

export function resolveLayoutRequirement(
    requirement: LayoutPropertyRequirement,
    ctx: ViewLayoutContext,
): LayoutRequirementResolution {
    const layout = readLayout(ctx.activeView);
    const configuredId = typeof layout[requirement.layoutKey] === 'string'
        ? (layout[requirement.layoutKey] as string)
        : null;
    const candidates = ctx.schema.filter((property) =>
        requirement.propertyTypes.includes(property.type),
    );
    const configured = configuredId
        ? candidates.find((property) => property.id === configuredId) ?? null
        : null;
    const picked = configured
        ?? requirement.pickProperty?.(candidates, ctx)
        ?? candidates[0]
        ?? null;
    return { requirement, configuredId, candidates, selected: picked };
}

export function resolveLayoutRequirements(
    requirements: readonly LayoutPropertyRequirement[] | undefined,
    ctx: ViewLayoutContext,
): LayoutRequirementResolution[] {
    return (requirements ?? [])
        .filter((requirement) => isRequirementActive(requirement, ctx))
        .map((requirement) => resolveLayoutRequirement(requirement, ctx));
}

export function layoutPatchFromResolutions(
    resolutions: readonly LayoutRequirementResolution[],
): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const resolution of resolutions) {
        const selected = resolution.selected;
        if (!selected || resolution.configuredId === selected.id) continue;
        patch[resolution.requirement.layoutKey] = selected.id;
    }
    return patch;
}

export function missingPropertyRequirements(
    resolutions: readonly LayoutRequirementResolution[],
): LayoutRequirementResolution[] {
    return resolutions.filter((resolution) => resolution.selected === null);
}

export function createPayloadForRequirement(
    requirement: LayoutPropertyRequirement,
    input: RequiredPropertyCreateInput,
): RequiredPropertyCreatePayload {
    const config = requirement.defaultConfig
        ? requirement.defaultConfig(input.type)
        : defaultConfigFor(input.type);
    return {
        label: input.label.trim() || requirement.defaultLabel,
        type: input.type,
        config,
    };
}

export function buildViewLayoutContext(
    base: ViewLayoutContext,
    nextType: DatabaseViewType,
    layoutPatch: Record<string, unknown> = {},
): ViewLayoutContext {
    return {
        ...base,
        activeView: viewWithTypeAndLayout(base.activeView, nextType, layoutPatch),
    };
}

export function viewWithTypeAndLayout(
    view: DatabaseView,
    type: DatabaseViewType,
    layoutPatch: Record<string, unknown> = {},
): DatabaseView {
    return {
        ...view,
        type,
        config: {
            ...view.config,
            layout: {
                ...(view.config.layout ?? {}),
                ...layoutPatch,
            },
        },
    };
}

export function seedTodayForDateLayout(ctx: ViewLayoutContext): AddRowSeed[] {
    const layout = readLayout(ctx.activeView);
    const propertyId = typeof layout.datePropertyId === 'string'
        ? layout.datePropertyId
        : null;
    const property = propertyId
        ? ctx.schema.find((definition) => definition.id === propertyId) ?? null
        : null;
    if (!property || (property.type !== 'date' && property.type !== 'dateRange')) return [];

    const today = new Date();
    const iso = new Date(
        Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()),
    ).toISOString();
    if (property.type === 'dateRange') {
        return [{
            propertyId: property.id,
            value: { type: 'dateRange', value: { from: iso, to: iso } },
        }];
    }
    return [{ propertyId: property.id, value: { type: 'date', value: iso } }];
}

function readLayout(view: DatabaseView): Record<string, unknown> {
    return (view.config.layout ?? {}) as Record<string, unknown>;
}

export const boardGroupRequirement: LayoutPropertyRequirement = {
    key: 'board.groupByPropertyId',
    layoutKey: 'groupByPropertyId',
    label: 'Group by',
    description: 'Board columns need a Select, Multi-select or Status property.',
    propertyTypes: OPTION_TYPES,
    defaultLabel: 'Status',
    defaultType: 'status',
    createTypes: OPTION_TYPES,
    pickProperty: (schema) => schema.find(isBoardGroupable) ?? null,
};

export const chartGroupRequirement: LayoutPropertyRequirement = {
    ...boardGroupRequirement,
    key: 'chart.groupByPropertyId',
    description: 'Charts need an option-based property to group rows into buckets.',
};

export const chartValueRequirement: LayoutPropertyRequirement = {
    key: 'chart.valuePropertyId',
    layoutKey: 'valuePropertyId',
    label: 'Value property',
    description: 'Sum and average charts need a Number property to aggregate.',
    propertyTypes: ['number'],
    defaultLabel: 'Value',
    defaultType: 'number',
    requiredWhen: (ctx) => {
        const aggregation = readLayout(ctx.activeView).aggregation;
        return aggregation === 'sum' || aggregation === 'avg';
    },
};

export const dateLayoutRequirement: LayoutPropertyRequirement = {
    key: 'date.datePropertyId',
    layoutKey: 'datePropertyId',
    label: 'Schedule by',
    description: 'Calendar needs a Date or Date range property to place rows.',
    propertyTypes: DATE_TYPES,
    defaultLabel: 'Date',
    defaultType: 'date',
    createTypes: DATE_TYPES,
};

export const timelineLayoutRequirement: LayoutPropertyRequirement = {
    key: 'timeline.datePropertyId',
    layoutKey: 'datePropertyId',
    label: 'Schedule by',
    description: 'Timeline needs a date-like property to position rows.',
    propertyTypes: TIMELINE_TYPES,
    defaultLabel: 'Date',
    defaultType: 'date',
    createTypes: DATE_TYPES,
    pickProperty: (schema) => (
        schema.find((property) => property.type === 'dateRange')
        ?? schema.find((property) => property.type === 'date')
        ?? schema.find((property) => property.type === 'createdTime')
        ?? schema.find((property) => property.type === 'lastEditedTime')
        ?? null
    ),
};
