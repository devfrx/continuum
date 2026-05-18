<script setup lang="ts">
/**
 * Root host component bound to the editor's `database` NodeView.
 *
 * Two modes:
 *
 *   – **Unbound** (`attrs.databaseId === null`): renders an inline
 *     picker offering "Create new database" (calls
 *     `api.databases.create` and emits `update:attrs`) or
 *     "Link existing database" (lists databases via
 *     `api.databases.list`). The block is otherwise inert.
 *
 *   – **Bound**: delegates to `DatabaseBody`, which loads the bundle
 *     and renders the toolbar plus the active view body. Linked
 *     databases are simply two blocks pointing at the same
 *     `databaseId` with different `viewId`s — exactly what
 *     `DatabaseBody` consumes.
 *
 * The component never mutates `attrs` directly: every change is
 * forwarded through the `update:attrs` emit so the editor remains the
 * single writer of node attributes.
 */
import { ref } from 'vue';
import { api } from '@/api';
import type { Database, DatabaseBlockAttrs } from '@continuum/shared';
import DatabaseUnboundPicker from './DatabaseUnboundPicker.vue';
import DatabaseBody from './DatabaseBody.vue';

const props = defineProps<{
    attrs: DatabaseBlockAttrs;
    editable: boolean;
}>();

const emit = defineEmits<{
    'update:attrs': [patch: Partial<DatabaseBlockAttrs>];
    delete: [];
}>();

const creating = ref(false);
const error = ref<string | null>(null);

async function onCreate(title: string): Promise<void> {
    if (!props.editable) return;
    creating.value = true;
    error.value = null;
    try {
        const { database, views } = await api.databases.create({ title });
        const defaultView = views[0] ?? null;
        emit('update:attrs', {
            databaseId: database.id,
            viewId: defaultView?.id ?? null,
        });
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not create database';
    } finally {
        creating.value = false;
    }
}

function onLink(database: Database): void {
    if (!props.editable) return;
    error.value = null;
    emit('update:attrs', { databaseId: database.id, viewId: null });
}
</script>

<template>
    <DatabaseUnboundPicker
        v-if="!attrs.databaseId"
        :editable="editable"
        :busy="creating"
        :error="error"
        @create="onCreate"
        @link="onLink"
        @delete="emit('delete')" />
    <DatabaseBody
        v-else
        :database-id="attrs.databaseId"
        :view-id="attrs.viewId"
        :editable="editable"
        @update:view-id="(viewId) => emit('update:attrs', { viewId })"
        @delete="emit('delete')" />
</template>
