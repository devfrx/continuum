/**
 * Property settings registry.
 *
 * Maps each {@link PropertyType} to the Vue component that renders its
 * configuration panel (Number → format / display, Text → max length,
 * …). Mirrors `propertyEditorRegistry` so the rest of the app discovers
 * settings purely by type — adding a new panel is a one-line change
 * here plus the new `.vue` file under `./panels/`.
 *
 * Types that don't expose user-facing settings (or whose settings are
 * configured at creation time via `AddPropertyModal`) map to `null` and
 * the host popover renders a friendly "no settings" placeholder.
 */
import type { Component } from 'vue';
import type { PropertyType } from '@continuum/shared';
import NumberSettingsPanel from './panels/NumberSettingsPanel.vue';
import TextSettingsPanel from './panels/TextSettingsPanel.vue';
import LongTextSettingsPanel from './panels/LongTextSettingsPanel.vue';

export const propertySettingsRegistry: Partial<Record<PropertyType, Component>> = {
    number: NumberSettingsPanel,
    text: TextSettingsPanel,
    longText: LongTextSettingsPanel,
};

/**
 * @returns `true` when `type` has a dedicated settings panel registered.
 *   Useful for hiding the "Edit property" menu item on types without
 *   any extra knobs.
 */
export function hasPropertySettings(type: PropertyType): boolean {
    return propertySettingsRegistry[type] !== undefined;
}
