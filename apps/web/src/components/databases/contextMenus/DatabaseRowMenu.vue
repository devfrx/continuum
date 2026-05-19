<script setup lang="ts">
/**
 * Context menu for a database row.
 *
 * Kept as a small wrapper over `UiContextMenu` so row-level menus share
 * the same body-teleported, viewport-clamped behaviour as property header
 * menus and future database context menus.
 */
import { computed } from 'vue';
import { UiContextMenu, type ContextMenuItem } from '@/components/ui';

defineProps<{
    modelValue: boolean;
    x: number;
    y: number;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    open: [];
    delete: [];
}>();

const items = computed<ContextMenuItem[]>(() => [
    {
        id: 'open',
        label: 'Open page',
        icon: 'chevron-right',
        onSelect: () => emit('open'),
    },
    { id: 'row-divider', label: '', divider: true },
    {
        id: 'delete',
        label: 'Delete row',
        icon: 'trash',
        danger: true,
        onSelect: () => emit('delete'),
    },
]);
</script>

<template>
    <UiContextMenu
        :model-value="modelValue"
        :x="x"
        :y="y"
        :items="items"
        :min-width="200"
        @update:model-value="emit('update:modelValue', $event)" />
</template>
