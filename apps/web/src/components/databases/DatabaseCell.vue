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
            class="db-cell__editor"
            :value="entry.value"
            :definition="entry.definition"
            :note-id="noteId"
            compact
            :readonly="!editable"
            @update:value="onUpdate" />
    </div>
</template>

<style scoped>
.db-cell {
    width: 100%;
    min-height: 28px;
    display: flex;
    align-items: center;
    min-width: 0;
    overflow: hidden;
}

.db-cell :deep(.db-cell__editor),
.db-cell :deep(.prop-sel),
.db-cell :deep(.prop-status),
.db-cell :deep(.prop-ms),
.db-cell :deep(.prop-rel),
.db-cell :deep(.prop-files) {
    width: 100%;
    min-width: 0;
    max-width: 100%;
}

.db-cell :deep(.prop-sel__trigger),
.db-cell :deep(.prop-status__trigger),
.db-cell :deep(.prop-ms__trigger) {
    min-height: 26px;
    padding: var(--space-1) 0;
}

.db-cell :deep(.prop-ms__trigger) {
    flex-wrap: nowrap;
    overflow: hidden;
}

.db-cell :deep(.prop-ms__chip),
.db-cell :deep(.prop-sel__chip),
.db-cell :deep(.prop-status__chip) {
    min-width: 0;
    max-width: 100%;
}

.db-cell :deep(.prop-ms__caret),
.db-cell :deep(.prop-sel__caret),
.db-cell :deep(.prop-status__caret) {
    margin-left: var(--space-1);
}
</style>
