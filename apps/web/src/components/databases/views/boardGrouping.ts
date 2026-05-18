/**
 * boardGrouping.ts — shared utilities for the Board layout.
 *
 * Keeps the "which property types can drive Board columns?" question and
 * the value-encoding rules in one place so the renderer, the settings
 * panel and any future helpers all agree.
 *
 * Three property types are supported as group-by:
 *   – `select`       row sits in exactly one column,
 *   – `status`       same, but options are grouped by lifecycle bucket,
 *   – `multiSelect`  row appears in every column whose option id is
 *                    present in the value. Dropping a card onto a new
 *                    column adds that option without affecting the
 *                    others; the special `__none__` column clears the
 *                    value entirely.
 */
import type { PropertyDefinition, PropertyValue } from '@continuum/shared';

/** Property types that drive Board columns. Keep in sync with renderer. */
export const BOARD_GROUPABLE_TYPES = ['select', 'multiSelect', 'status'] as const;
export type BoardGroupableType = (typeof BOARD_GROUPABLE_TYPES)[number];

/** Type-guard mirror of {@link BOARD_GROUPABLE_TYPES}. */
export function isBoardGroupable(def: PropertyDefinition): boolean {
    return (BOARD_GROUPABLE_TYPES as readonly string[]).includes(def.type);
}

/**
 * Return every option id the row currently has selected for `def`.
 *
 * `select` / `status` yield 0 or 1 ids; `multiSelect` yields N.
 */
export function readSelectedOptionIds(
    value: PropertyValue | undefined | null,
): string[] {
    if (!value) return [];
    if (value.type === 'select' || value.type === 'status') {
        return value.value ? [value.value] : [];
    }
    if (value.type === 'multiSelect') {
        return [...value.value];
    }
    return [];
}

/**
 * Build the next {@link PropertyValue} when a card is moved to `targetOptionId`.
 *
 * For `multiSelect`, this *adds* the target option to the existing set so
 * dropping a card into another column doesn't silently strip the row's
 * other tags. Removing a tag is done by dragging back to `__none__` on a
 * row that only has that single tag, which is handled by the caller via
 * `nextValueOnRemove`.
 */
export function nextValueOnDrop(
    def: PropertyDefinition,
    currentValue: PropertyValue | undefined | null,
    targetOptionId: string,
): PropertyValue {
    if (def.type === 'multiSelect') {
        const next = new Set(readSelectedOptionIds(currentValue));
        next.add(targetOptionId);
        return { type: 'multiSelect', value: Array.from(next) };
    }
    if (def.type === 'status') {
        return { type: 'status', value: targetOptionId };
    }
    return { type: 'select', value: targetOptionId };
}

/**
 * Build the next {@link PropertyValue} when a multi-select row is removed
 * from a column (delete chip on the card). Returns `null` to signal "clear
 * the value entirely" when no options remain.
 */
export function nextValueOnRemoveTag(
    currentValue: PropertyValue | undefined | null,
    optionId: string,
): PropertyValue | null {
    const remaining = readSelectedOptionIds(currentValue).filter((id) => id !== optionId);
    if (remaining.length === 0) return null;
    return { type: 'multiSelect', value: remaining };
}
