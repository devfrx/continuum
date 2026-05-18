<script setup lang="ts">
/**
 * Per-cell wrapper used inside the database table.
 *
 * The cell receives a single `NoteProperty` plus the row's `noteId`
 * and renders the matching editor from `propertyEditorRegistry` (the
 * same registry used by the inline `PropertyPanel`, so behaviour stays
 * consistent across surfaces). Edits are forwarded straight to
 * `api.properties.setValue` — rows are real notes, so this is
 * exactly the same code path used everywhere else.
 *
 * Read-only computed property types (formula / rollup / createdTime /
 * …) automatically resolve to `ComputedDisplay` from the registry.
 */
import { computed } from 'vue';
import { propertyEditorRegistry } from '@/components/properties/editors/registry';
import { useDatabaseCellSetter } from '@/composables/useDatabase';
import type { NoteProperty, PropertyValue } from '@continuum/shared';

const props = defineProps<{
    noteId: string;
    entry: NoteProperty | null;
    editable: boolean;
}>();

const emit = defineEmits<{ saved: [] }>();

const { setValue } = useDatabaseCellSetter();
const editor = computed(() => (
    props.entry ? propertyEditorRegistry[props.entry.definition.type] : null
));

async function onUpdate(value: PropertyValue): Promise<void> {
    if (!props.editable) return;
    if (!props.entry) return;
    await setValue(props.noteId, props.entry.definition.id, value);
    emit('saved');
}
</script>

<template>
    <div class="db-cell">
        <component
            v-if="entry && editor"
            :is="editor"
            :value="entry.value"
            :definition="entry.definition"
            :note-id="noteId"
            :readonly="!editable"
            @update:value="onUpdate" />
    </div>
</template>

<style scoped>
.db-cell {
    width: 100%;
    min-height: 1.75rem;
    display: flex;
    align-items: center;
}
</style>
