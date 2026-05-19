/** Shared date extraction helpers for Calendar / Timeline database views. */
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
    PropertyValue,
} from '@continuum/shared';

export interface RowDateRange {
    from: number;
    to: number;
}

export function isCalendarDateProperty(def: PropertyDefinition): boolean {
    return def.type === 'date' || def.type === 'dateRange';
}

export function isTimelineDateProperty(def: PropertyDefinition): boolean {
    return def.type === 'date'
        || def.type === 'dateRange'
        || def.type === 'createdTime'
        || def.type === 'lastEditedTime';
}

function parsePropertyDate(value: string): number | null {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [year, month, day] = value.split('-').map(Number);
        return new Date(year, month - 1, day).getTime();
    }
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function valueFor(row: DatabaseRowSnapshot, def: PropertyDefinition): PropertyValue | null {
    const stored = row.properties.find((property) => property.definition.id === def.id)?.value;
    if (stored) return stored;
    if (def.type === 'createdTime') return { type: 'createdTime', value: row.note.createdAt };
    if (def.type === 'lastEditedTime') return { type: 'lastEditedTime', value: row.note.updatedAt };
    return null;
}

export function rangeOfPropertyValue(value: PropertyValue | null | undefined): RowDateRange | null {
    if (!value) return null;
    if (value.type === 'date' || value.type === 'createdTime' || value.type === 'lastEditedTime') {
        const timestamp = parsePropertyDate(value.value);
        if (timestamp === null) return null;
        return { from: timestamp, to: timestamp };
    }
    if (value.type === 'dateRange') {
        const from = parsePropertyDate(value.value.from);
        const to = parsePropertyDate(value.value.to);
        if (from === null || to === null) return null;
        return { from: Math.min(from, to), to: Math.max(from, to) };
    }
    return null;
}

export function rangeForRow(
    row: DatabaseRowSnapshot,
    candidates: readonly PropertyDefinition[],
    preferred: PropertyDefinition | null,
): RowDateRange | null {
    if (preferred) {
        const preferredRange = rangeOfPropertyValue(valueFor(row, preferred));
        if (preferredRange) return preferredRange;
    }

    for (const def of candidates) {
        if (def.id === preferred?.id) continue;
        const range = rangeOfPropertyValue(valueFor(row, def));
        if (range) return range;
    }
    return null;
}