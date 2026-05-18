/**
 * viewSettings/sections.ts — canonical catalogue of view-settings sections.
 *
 * Defines the rows visible in the popover's root menu (and the panel
 * header when drilled in). The popover shell renders this list and
 * dispatches to the right panel component based on the section id.
 *
 * Order here is the order shown to the user — matches the Notion-style
 * "View options" drawer organisation.
 */
import type { AppIconName } from '@/assets/icons';

export type SectionId =
    | 'layout'
    | 'properties'
    | 'filter'
    | 'sort'
    | 'group'
    | 'conditionalColor'
    | 'automations'
    | 'dataSource';

export interface SectionEntry {
    readonly id: SectionId;
    readonly label: string;
    readonly icon: AppIconName;
    /** One-line caption shown beneath the label in the root menu. */
    readonly hint: string;
    /** `ready` = dedicated panel ships; `planned` = generic placeholder. */
    readonly status: 'ready' | 'planned';
}

export const SECTIONS: readonly SectionEntry[] = [
    { id: 'layout', label: 'Layout', icon: 'layout', hint: 'Renderer & layout knobs', status: 'ready' },
    { id: 'properties', label: 'Properties', icon: 'eye', hint: 'Visible columns & order', status: 'planned' },
    { id: 'filter', label: 'Filter', icon: 'filter', hint: 'Narrow rows by conditions', status: 'ready' },
    { id: 'sort', label: 'Sort', icon: 'arrow-down', hint: 'Order rows by any property', status: 'ready' },
    { id: 'group', label: 'Group', icon: 'sidebar', hint: 'Bucket rows by a property', status: 'planned' },
    { id: 'conditionalColor', label: 'Conditional color', icon: 'palette', hint: 'Color rows by rules', status: 'planned' },
    { id: 'automations', label: 'Automations', icon: 'ai', hint: 'Trigger actions on changes', status: 'planned' },
    { id: 'dataSource', label: 'Data source', icon: 'database', hint: 'Swap the datasource', status: 'ready' },
] as const;

export function sectionById(id: SectionId): SectionEntry {
    return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
}
