/**
 * timelineSchedule — date arithmetic + persistence helpers for the
 * interactive Timeline view.
 *
 * The helpers stay framework-agnostic so they can be unit-tested in
 * isolation. Persistence flows through the same `api.properties` +
 * `publishPropertyValueChanged` channel used everywhere else in the
 * app.
 */
import type {
    DateRangeValue,
    DateValue,
    PropertyDefinition,
    PropertyValue,
} from '@continuum/shared';

/** Strict `YYYY-MM-DD` formatter (local time, no TZ surprises). */
export function toIsoDate(date: Date): string {
    const y = date.getFullYear();
    const m = `${date.getMonth() + 1}`.padStart(2, '0');
    const d = `${date.getDate()}`.padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/** Parse `YYYY-MM-DD` (local) into a Date at 00:00. */
export function fromIsoDate(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Add `delta` whole days to a Date and return a fresh copy. */
export function addDays(date: Date, delta: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + delta);
    return next;
}

/** Inclusive day difference between two midnight Dates. */
export function daysBetween(from: Date, to: Date): number {
    const ms = to.getTime() - from.getTime();
    return Math.round(ms / 86_400_000);
}

/** True for the system-timestamp property types we surface read-only. */
export function isReadOnlyDateType(type: PropertyDefinition['type']): boolean {
    return type === 'createdTime' || type === 'lastEditedTime';
}

/** True when the property only stores a single calendar day. */
export function isSingleDateType(type: PropertyDefinition['type']): boolean {
    return type === 'date' || isReadOnlyDateType(type);
}

/**
 * Build the property value to persist for a given property type and
 * day range. Returns `null` for read-only system timestamps.
 */
export function buildSchedulePayload(
    type: PropertyDefinition['type'],
    from: Date,
    to: Date,
): PropertyValue | null {
    if (isReadOnlyDateType(type)) return null;
    if (type === 'date') {
        return { type: 'date', value: toIsoDate(from) } satisfies DateValue;
    }
    if (type === 'dateRange') {
        const start = from <= to ? from : to;
        const end = from <= to ? to : from;
        return {
            type: 'dateRange',
            value: { from: toIsoDate(start), to: toIsoDate(end) },
        } satisfies DateRangeValue;
    }
    return null;
}
