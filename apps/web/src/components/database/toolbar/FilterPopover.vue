<script setup lang="ts">
/**
 * FilterPopover — entry point for the filter builder.
 *
 * Wraps a single (always-present) root `FilterGroup` rendered by
 * `FilterGroupEditor`. Emits `change` with the full new tree on every edit.
 */
import type { FilterTree, PropertyDefinition } from '@continuum/shared';
import { emptyFilterTree } from '@continuum/shared';
import FilterGroupEditor from './FilterGroupEditor.vue';

const props = defineProps<{
    filter: FilterTree | null | undefined;
    properties: PropertyDefinition[];
}>();
const emit = defineEmits<{ change: [next: FilterTree] }>();

function rootGroup(): FilterTree {
    return props.filter && props.filter.type === 'group' ? props.filter : emptyFilterTree();
}
</script>

<template>
    <FilterGroupEditor
        :group="rootGroup()"
        :properties="properties"
        :removable="false"
        :depth="0"
        @change="(next) => emit('change', next)"
    />
</template>
