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
    /** `ready` = dedicated panel ships; `planned` = generic placeholder. */
    readonly status: 'ready' | 'planned';
}

export const SECTIONS: readonly SectionEntry[] = [
    { id: 'layout', label: 'Layout', icon: 'layout', status: 'ready' },
    { id: 'properties', label: 'Properties', icon: 'eye', status: 'planned' },
    { id: 'filter', label: 'Filter', icon: 'filter', status: 'planned' },
    { id: 'sort', label: 'Sort', icon: 'settings', status: 'planned' },
    { id: 'group', label: 'Group', icon: 'sidebar', status: 'planned' },
    { id: 'conditionalColor', label: 'Conditional color', icon: 'palette', status: 'planned' },
    { id: 'automations', label: 'Automations', icon: 'ai', status: 'planned' },
    { id: 'dataSource', label: 'Data source', icon: 'database', status: 'ready' },
] as const;

export function sectionById(id: SectionId): SectionEntry {
    return SECTIONS.find((s) => s.id === id) ?? SECTIONS[0];
}
