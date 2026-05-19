<script setup lang="ts">
/**
 * PropertiesPanel.vue — view-scoped property visibility and order.
 *
 * The panel edits `DatabaseViewConfig.visibleProperties` /
 * `hiddenProperties`, which are stored per saved view. The datasource
 * schema is untouched: toggling a property here only affects the active
 * view, and dragging visible rows pins that view's display order.
 */
import { computed, ref, type Ref } from 'vue';
import { Icon, UiButton, UiEmpty, UiSwitch } from '@/components/ui';
import type { AppIconName } from '@/assets/icons';
import {
    PROPERTY_TYPE_ICONS,
    PROPERTY_TYPE_LABELS,
    type DatabaseView,
    type DatabaseViewConfig,
    type PropertyDefinition,
} from '@continuum/shared';
import {
    DRAG_MIME,
    useDragSource,
    useDropTarget,
    type DragSourceHandlers,
    type DropTargetHandlers,
} from '@/composables/useDragAndDrop';
import {
    hasCustomPropertyVisibility,
    patchPropertyOrder,
    patchPropertyVisibility,
    resetPropertyVisibilityPatch,
    resolveViewPropertySettingsItems,
    type DropInsertPosition,
    type ViewPropertySettingsItem,
} from '../viewProperties';

const props = defineProps<{
    view: DatabaseView;
    schema: readonly PropertyDefinition[];
}>();

const emit = defineEmits<{
    'patch-config': [patch: Partial<DatabaseViewConfig>];
}>();

const PROPERTY_SETTINGS_DRAG_KIND = 'database-view-property';

const draggedPropertyKey = ref<string | null>(null);
const dropTargetKey = ref<string | null>(null);
const dropPosition = ref<DropInsertPosition>('before');

const sourceCache = new Map<string, { isDragging: Ref<boolean>; handlers: DragSourceHandlers }>();
const targetCache = new Map<string, { isOver: Ref<boolean>; handlers: DropTargetHandlers }>();

const items = computed(() => resolveViewPropertySettingsItems(props.schema, props.view));
const visibleCount = computed(() => items.value.filter((item) => item.visible).length);
const customVisibility = computed(() => hasCustomPropertyVisibility(props.view));

function iconFor(property: PropertyDefinition): AppIconName {
    return (property.icon ?? PROPERTY_TYPE_ICONS[property.type] ?? 'circle') as AppIconName;
}

function typeLabel(property: PropertyDefinition): string {
    return PROPERTY_TYPE_LABELS[property.type] ?? property.type;
}

function isVisible(propertyKey: string): boolean {
    return items.value.some((item) => item.property.key === propertyKey && item.visible);
}

function insertPositionFromEvent(event: DragEvent): DropInsertPosition {
    const target = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    if (!target) return 'before';
    const rect = target.getBoundingClientRect();
    return event.clientY > rect.top + rect.height / 2 ? 'after' : 'before';
}

function updateDropState(propertyKey: string, event: DragEvent): void {
    if (draggedPropertyKey.value === propertyKey) return;
    dropTargetKey.value = propertyKey;
    dropPosition.value = insertPositionFromEvent(event);
}

function clearDropState(): void {
    dropTargetKey.value = null;
    dropPosition.value = 'before';
}

function clearDragState(): void {
    draggedPropertyKey.value = null;
    clearDropState();
}

function sourceHandlers(property: PropertyDefinition): DragSourceHandlers {
    const cached = sourceCache.get(property.key);
    if (cached) return cached.handlers;
    const source = useDragSource({
        mime: DRAG_MIME.propertyId,
        kind: PROPERTY_SETTINGS_DRAG_KIND,
        disabled: () => visibleCount.value < 2 || !isVisible(property.key),
        getPayload: () => property.key,
        onStart: () => {
            draggedPropertyKey.value = property.key;
        },
        onEnd: clearDragState,
    });
    sourceCache.set(property.key, { isDragging: source.isDragging, handlers: source.dragHandlers });
    return source.dragHandlers;
}

function targetHandlers(property: PropertyDefinition): DropTargetHandlers {
    const cached = targetCache.get(property.key);
    if (cached) return cached.handlers;
    const target = useDropTarget({
        accept: DRAG_MIME.propertyId,
        acceptKind: PROPERTY_SETTINGS_DRAG_KIND,
        disabled: () => !isVisible(property.key),
        onEnter: (event) => updateDropState(property.key, event),
        onOver: (event) => updateDropState(property.key, event),
        onLeave: () => {
            if (dropTargetKey.value === property.key) clearDropState();
        },
        onDrop: (payload, event) => {
            const position = insertPositionFromEvent(event);
            const patch = patchPropertyOrder(props.schema, props.view, payload, property.key, position);
            clearDragState();
            if (patch) emit('patch-config', patch);
        },
    });
    targetCache.set(property.key, { isOver: target.isOver, handlers: target.dropHandlers });
    return target.dropHandlers;
}

function rowHandlers(item: ViewPropertySettingsItem): Partial<DragSourceHandlers & DropTargetHandlers> {
    if (!item.visible) return {};
    return {
        ...sourceHandlers(item.property),
        ...targetHandlers(item.property),
    };
}

function isDragging(propertyKey: string): boolean {
    return draggedPropertyKey.value === propertyKey;
}

function isDropTarget(propertyKey: string, position: DropInsertPosition): boolean {
    return dropTargetKey.value === propertyKey
        && dropPosition.value === position
        && draggedPropertyKey.value !== propertyKey;
}

function setPropertyVisible(property: PropertyDefinition, visible: boolean): void {
    const patch = patchPropertyVisibility(props.schema, props.view, property.key, visible);
    if (Object.keys(patch).length > 0) emit('patch-config', patch);
}

function resetProperties(): void {
    emit('patch-config', resetPropertyVisibilityPatch());
}
</script>

<template>
    <div class="properties-panel">
        <UiEmpty
            v-if="schema.length === 0"
            compact
            title="No properties"
            description="Add database properties from the table view.">
            <template #icon>
                <Icon name="eye" :size="20" />
            </template>
        </UiEmpty>

        <template v-else>
            <header class="properties-panel__summary">
                <span class="properties-panel__count">{{ visibleCount }} shown</span>
                <UiButton
                    v-if="customVisibility"
                    variant="ghost"
                    size="sm"
                    class="properties-panel__reset"
                    @click="resetProperties">
                    Reset
                </UiButton>
            </header>

            <ul class="properties-panel__list">
                <li
                    v-for="item in items"
                    :key="item.property.id"
                    class="properties-panel__row"
                    :class="{
                        'is-hidden': !item.visible,
                        'is-dragging': isDragging(item.property.key),
                        'is-drop-before': isDropTarget(item.property.key, 'before'),
                        'is-drop-after': isDropTarget(item.property.key, 'after'),
                    }"
                    :draggable="item.visible && visibleCount > 1"
                    v-on="rowHandlers(item)">
                    <span class="properties-panel__drag" aria-hidden="true">
                        <Icon v-if="item.visible && visibleCount > 1" name="drag" :size="13" />
                    </span>
                    <span class="properties-panel__meta">
                        <Icon :name="iconFor(item.property)" :size="13" class="properties-panel__icon" />
                        <span class="properties-panel__text">
                            <span class="properties-panel__label">{{ item.property.label }}</span>
                            <span class="properties-panel__type">{{ typeLabel(item.property) }}</span>
                        </span>
                    </span>
                    <UiSwitch
                        :model-value="item.visible"
                        :aria-label="`${item.property.label} visibility`"
                        @update:model-value="(visible) => setPropertyVisible(item.property, visible)" />
                </li>
            </ul>
        </template>
    </div>
</template>

<style scoped>
.properties-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.properties-panel__summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 28px;
    gap: var(--space-2);
}

.properties-panel__count {
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: var(--font-weight-semibold);
}

.properties-panel__reset {
    min-height: 24px;
}

.properties-panel__list {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: var(--space-px);
    margin: 0;
    padding: 0;
}

.properties-panel__row {
    position: relative;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    min-height: 38px;
    padding: var(--space-1) var(--space-2);
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        opacity var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard);
}

.properties-panel__row:hover {
    background: var(--surface-hover);
    border-color: color-mix(in srgb, var(--border) 70%, transparent);
}

.properties-panel__row[draggable='true'] {
    cursor: grab;
}

.properties-panel__row[draggable='true']:active {
    cursor: grabbing;
}

.properties-panel__row.is-hidden {
    color: var(--text-muted);
    opacity: 0.62;
}

.properties-panel__row.is-dragging {
    opacity: 0.45;
}

.properties-panel__row.is-drop-before::before,
.properties-panel__row.is-drop-after::after {
    content: '';
    position: absolute;
    left: var(--space-2);
    right: var(--space-2);
    height: 2px;
    border-radius: 999px;
    background: var(--accent);
    pointer-events: none;
}

.properties-panel__row.is-drop-before::before {
    top: -1px;
}

.properties-panel__row.is-drop-after::after {
    bottom: -1px;
}

.properties-panel__drag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 26px;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
}

.properties-panel__meta {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

.properties-panel__icon {
    flex: 0 0 auto;
    color: var(--text-secondary);
}

.properties-panel__text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.properties-panel__label,
.properties-panel__type {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.properties-panel__label {
    font-size: var(--text-sm);
    color: inherit;
}

.properties-panel__type {
    font-size: var(--text-2xs);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
}
</style>
