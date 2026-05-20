import type {
    Database,
    DatabaseView,
    PropertyDefinition,
} from '@continuum/shared';
import { resolveLayoutRequirements } from './layoutRequirements';
import type { LayoutPropertyRequirement } from './types';

export interface TableCompanionContext {
    database: Database;
    schema: PropertyDefinition[];
    activeView: DatabaseView;
    layoutRequirements: readonly LayoutPropertyRequirement[] | undefined;
}

export function activeLayoutRequirements(
    ctx: TableCompanionContext,
): readonly LayoutPropertyRequirement[] {
    return resolveLayoutRequirements(ctx.layoutRequirements, ctx)
        .map((resolution) => resolution.requirement);
}

export function viewNeedsTableCompanion(ctx: TableCompanionContext): boolean {
    return ctx.activeView.type !== 'table' && activeLayoutRequirements(ctx).length > 0;
}

export function findSourceTableView(
    views: readonly DatabaseView[],
    sourceId: string,
): DatabaseView | null {
    return views.find((view) =>
        view.type === 'table' && view.dataSourceDatabaseId === sourceId,
    ) ?? null;
}