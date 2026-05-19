/**
 * Compatibility wrapper for card-shaped renderers.
 *
 * The underlying visibility / ordering contract now lives in
 * `../viewProperties` so Table, Board, Gallery, Feed, List and the
 * settings popover all resolve the same view-scoped property surface.
 */
import {
    resolveViewProperties,
    type ResolveViewPropertiesOptions,
} from '../viewProperties';

export type ResolveCardPropertiesOptions = ResolveViewPropertiesOptions;

/**
 * Return the ordered list of properties a card-shaped renderer should display.
 */
export function resolveCardProperties(
    opts: ResolveCardPropertiesOptions,
): ReturnType<typeof resolveViewProperties> {
    return resolveViewProperties(opts);
}
