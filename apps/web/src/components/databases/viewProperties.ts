/**
 * Shared property-visibility contract for database views.
 *
 * View config stores property keys, not definition ids, so visibility
 * and ordering survive schema re-creation. Renderers and settings use
 * these helpers instead of open-coding `visibleProperties` /
 * `hiddenProperties` rules in separate places.
 */
import type {
  DatabaseView,
  DatabaseViewConfig,
  PropertyDefinition,
} from '@continuum/shared';

export type DropInsertPosition = 'before' | 'after';

export interface ResolveViewPropertiesOptions {
  schema: readonly PropertyDefinition[];
  view: DatabaseView;
  /** Property keys already surfaced elsewhere by the renderer. */
  skipKeys?: Iterable<string>;
  /** Optional hard cap applied after visibility / skip filtering. */
  limit?: number;
}

export interface ViewPropertySettingsItem {
  property: PropertyDefinition;
  visible: boolean;
}

function schemaKeys(schema: readonly PropertyDefinition[]): string[] {
  return schema.map((property) => property.key);
}

function existingUniqueKeys(
  keys: readonly string[],
  schema: readonly PropertyDefinition[],
): string[] {
  const available = new Set(schemaKeys(schema));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const key of keys) {
    if (!available.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function hiddenKeySet(schema: readonly PropertyDefinition[], view: DatabaseView): Set<string> {
  return new Set(existingUniqueKeys(view.config.hiddenProperties ?? [], schema));
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

/** Return visible property keys in the exact order a renderer should use. */
export function visiblePropertyKeysForView(
  schema: readonly PropertyDefinition[],
  view: DatabaseView,
): string[] {
  const hidden = hiddenKeySet(schema, view);
  const visible = view.config.visibleProperties;
  if (visible && visible.length > 0) {
    return existingUniqueKeys(visible, schema).filter((key) => !hidden.has(key));
  }
  return schemaKeys(schema).filter((key) => !hidden.has(key));
}

/** Resolve ordered visible property definitions for a database renderer. */
export function resolveViewProperties(
  options: ResolveViewPropertiesOptions,
): PropertyDefinition[] {
  const { schema, view, skipKeys, limit } = options;
  const byKey = new Map(schema.map((property) => [property.key, property] as const));
  const skip = skipKeys ? new Set(skipKeys) : null;
  let ordered = visiblePropertyKeysForView(schema, view)
    .map((key) => byKey.get(key))
    .filter((property): property is PropertyDefinition => Boolean(property));

  if (skip) ordered = ordered.filter((property) => !skip.has(property.key));
  if (typeof limit === 'number' && limit >= 0) ordered = ordered.slice(0, limit);
  return ordered;
}

/** Build the settings list: visible properties first, hidden below. */
export function resolveViewPropertySettingsItems(
  schema: readonly PropertyDefinition[],
  view: DatabaseView,
): ViewPropertySettingsItem[] {
  const visibleKeys = visiblePropertyKeysForView(schema, view);
  const visible = new Set(visibleKeys);
  const byKey = new Map(schema.map((property) => [property.key, property] as const));
  const ordered: ViewPropertySettingsItem[] = [];

  for (const key of visibleKeys) {
    const property = byKey.get(key);
    if (property) ordered.push({ property, visible: true });
  }
  for (const property of schema) {
    if (!visible.has(property.key)) ordered.push({ property, visible: false });
  }
  return ordered;
}

/** Whether a view differs from the datasource's default property surface. */
export function hasCustomPropertyVisibility(view: DatabaseView): boolean {
  return (view.config.visibleProperties?.length ?? 0) > 0
    || (view.config.hiddenProperties?.length ?? 0) > 0;
}

/** Patch that restores schema order and shows every property in this view. */
export function resetPropertyVisibilityPatch(): Pick<DatabaseViewConfig, 'visibleProperties' | 'hiddenProperties'> {
  return { visibleProperties: null, hiddenProperties: [] };
}

/** Patch a single property's visible/hidden state for the given view. */
export function patchPropertyVisibility(
  schema: readonly PropertyDefinition[],
  view: DatabaseView,
  propertyKey: string,
  visible: boolean,
): Partial<DatabaseViewConfig> {
  const allKeys = schemaKeys(schema);
  if (!allKeys.includes(propertyKey)) return {};

  const explicit = (view.config.visibleProperties?.length ?? 0) > 0;
  const currentVisible = visiblePropertyKeysForView(schema, view)
    .filter((key) => key !== propertyKey);

  if (visible) currentVisible.push(propertyKey);

  if (explicit) {
    const nextVisible = existingUniqueKeys(currentVisible, schema);
    const visibleSet = new Set(nextVisible);
    return {
      visibleProperties: nextVisible,
      hiddenProperties: allKeys.filter((key) => !visibleSet.has(key)),
    };
  }

  const hidden = hiddenKeySet(schema, view);
  if (visible) hidden.delete(propertyKey);
  else hidden.add(propertyKey);
  return { hiddenProperties: allKeys.filter((key) => hidden.has(key)) };
}

/** Patch visible property order after a drag-and-drop move. */
export function patchPropertyOrder(
  schema: readonly PropertyDefinition[],
  view: DatabaseView,
  fromKey: string,
  toKey: string,
  position: DropInsertPosition,
): Partial<DatabaseViewConfig> | null {
  const current = visiblePropertyKeysForView(schema, view);
  const nextVisible = movePropertyKey(current, fromKey, toKey, position);
  if (sameKeys(nextVisible, current)) return null;
  const visibleSet = new Set(nextVisible);
  return {
    visibleProperties: nextVisible,
    hiddenProperties: schemaKeys(schema).filter((key) => !visibleSet.has(key)),
  };
}

/** Move one property key before/after another key in an ordered list. */
export function movePropertyKey(
  keys: readonly string[],
  fromKey: string,
  toKey: string,
  position: DropInsertPosition,
): string[] {
  if (fromKey === toKey) return [...keys];
  const fromIndex = keys.indexOf(fromKey);
  const toIndex = keys.indexOf(toKey);
  if (fromIndex < 0 || toIndex < 0) return [...keys];

  const next = [...keys];
  const [moved] = next.splice(fromIndex, 1);
  if (!moved) return [...keys];
  const targetIndex = next.indexOf(toKey);
  if (targetIndex < 0) return [...keys];
  const insertAt = position === 'after' ? targetIndex + 1 : targetIndex;
  next.splice(insertAt, 0, moved);
  return next;
}
