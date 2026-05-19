<script setup lang="ts">
/**
 * Context menu for a table property header.
 *
 * Renders through `UiContextMenu`, which teleports to `<body>` and clamps
 * to the viewport. Keeping action construction here makes header menus
 * reusable by future table-like database renderers without copying filter
 * / sort config logic.
 */
import { computed } from 'vue';
import { UiContextMenu, type ContextMenuItem } from '@/components/ui';
import type {
    DatabaseView,
    DatabaseViewConfig,
    PropertyDefinition,
} from '@continuum/shared';
import {
    canSortProperty,
    filterActionsForProperty,
    withPropertyFilter,
    withPropertySort,
} from '../propertyHeaderActions';
import { hasPropertySettings } from '@/components/properties/settings/registry';
import PropertySettingsHost from '@/components/properties/settings/PropertySettingsHost.vue';

const props = withDefaults(defineProps<{
    modelValue: boolean;
    x: number;
    y: number;
    property: PropertyDefinition | null;
    view: DatabaseView;
}>(), {
    property: null,
});

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    rename: [property: PropertyDefinition];
    replace: [property: PropertyDefinition];
    'change-icon': [property: PropertyDefinition];
    delete: [property: PropertyDefinition];
    'patch-config': [patch: Partial<DatabaseViewConfig>];
}>();

function close(): void {
    emit('update:modelValue', false);
}

function withProperty(action: (property: PropertyDefinition) => void): () => void {
    return () => {
        const property = props.property;
        if (!property) return;
        action(property);
    };
}

const items = computed<ContextMenuItem[]>(() => {
    const property = props.property;
    if (!property) return [];

    const menuItems: ContextMenuItem[] = [
        {
            id: 'rename',
            label: 'Rename',
            icon: 'edit',
            onSelect: withProperty((target) => emit('rename', target)),
        },
        {
            id: 'change-icon',
            label: 'Change icon',
            icon: 'image',
            onSelect: withProperty((target) => emit('change-icon', target)),
        },
        {
            id: 'replace',
            label: 'Change property',
            icon: 'refresh',
            onSelect: withProperty((target) => emit('replace', target)),
        },
    ];

    if (hasPropertySettings(property.type)) {
        menuItems.push({
            id: 'edit-settings',
            label: 'Edit property',
            icon: 'settings',
            panel: PropertySettingsHost,
            panelProps: { definition: property },
        });
    }

    menuItems.push({ id: 'edit-divider', label: '', divider: true });

    for (const filterAction of filterActionsForProperty(property)) {
        menuItems.push({
            id: `filter-${filterAction.operator}`,
            label: filterAction.label,
            icon: 'filter',
            onSelect: () => emit('patch-config', {
                filter: withPropertyFilter(props.view.config.filter, property, filterAction.operator),
            }),
        });
    }

    if (canSortProperty(property)) {
        menuItems.push(
            {
                id: 'sort-asc',
                label: 'Sort ascending',
                icon: 'arrow-up',
                onSelect: () => emit('patch-config', {
                    sort: withPropertySort(props.view.config.sort, property, 'asc'),
                }),
            },
            {
                id: 'sort-desc',
                label: 'Sort descending',
                icon: 'arrow-down',
                onSelect: () => emit('patch-config', {
                    sort: withPropertySort(props.view.config.sort, property, 'desc'),
                }),
            },
        );
    }

    menuItems.push(
        { id: 'danger-divider', label: '', divider: true },
        {
            id: 'delete',
            label: 'Delete property',
            icon: 'trash',
            danger: true,
            onSelect: withProperty((target) => emit('delete', target)),
        },
    );

    return menuItems;
});
</script>

<template>
    <UiContextMenu
        :model-value="modelValue && property !== null"
        :x="x"
        :y="y"
        :items="items"
        :min-width="220"
        @update:model-value="(value) => { if (!value) close(); }" />
</template>
