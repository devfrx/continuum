<script setup lang="ts">
/**
 * TimelineBarContextMenu — right-click menu for a scheduled bar.
 *
 * Reuses the shared `UiContextMenu` so positioning, viewport-flip,
 * outside-click and keyboard navigation match every other context
 * menu in the app.
 */
import { computed } from 'vue';
import { UiContextMenu, type ContextMenuItem } from '@/components/ui';

const props = defineProps<{
    modelValue: boolean;
    x: number;
    y: number;
    /** When true, hide the "Unschedule" entry (no writable date property). */
    readOnly?: boolean;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    open: [];
    unschedule: [];
    delete: [];
}>();

const items = computed<ContextMenuItem[]>(() => {
    const out: ContextMenuItem[] = [
        {
            id: 'open',
            label: 'Open page',
            icon: 'chevron-right',
            onSelect: () => emit('open'),
        },
    ];
    if (!props.readOnly) {
        out.push({
            id: 'unschedule',
            label: 'Unschedule',
            icon: 'view-calendar',
            onSelect: () => emit('unschedule'),
        });
    }
    out.push(
        { id: 'tl-divider', label: '', divider: true },
        {
            id: 'delete',
            label: 'Delete row',
            icon: 'trash',
            danger: true,
            onSelect: () => emit('delete'),
        },
    );
    return out;
});
</script>

<template>
    <UiContextMenu :model-value="modelValue" :x="x" :y="y" :items="items" :min-width="200"
        @update:model-value="emit('update:modelValue', $event)" />
</template>
