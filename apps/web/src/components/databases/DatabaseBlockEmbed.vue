<script setup lang="ts">
/**
 * Root host bound to the editor's `database` NodeView (schema v3).
 *
 * A database block is a thin container that holds zero or more block
 * views. The optional `initialView` attr is a one-shot creation intent:
 * slash commands can insert a "Line chart" or "Board view" block, then
 * this host turns that intent into the first server-backed block view
 * when the user creates or links a datasource.
 */
import { computed, ref, toRef } from 'vue';
import { api } from '@/api';
import type {
    Database,
    DatabaseBlockAttrs,
    DatabaseBlockInitialView,
    DatabaseViewConfig,
    DatabaseViewType,
    PropertyDefinition,
} from '@continuum/shared';
import { EMPTY_DATABASE_VIEW_CONFIG } from '@continuum/shared';
import { useBlockViews } from '@/composables/useDatabase';
import DatabaseUnboundPicker from './DatabaseUnboundPicker.vue';
import DatabaseBody from './DatabaseBody.vue';
import DatabaseLayoutRequirementModal from './DatabaseLayoutRequirementModal.vue';
import { useLayoutRequirementPrompt } from './useLayoutRequirementPrompt';
import {
    defaultMissingLayoutInputs,
    defaultViewName,
    prepareDatabaseViewCreation,
    type MissingLayoutRequirementResolver,
} from './viewCreation';
import { viewEntryFor } from './views/registry';

const props = defineProps<{
    attrs: DatabaseBlockAttrs;
    editable: boolean;
}>();

const emit = defineEmits<{
    'update:attrs': [patch: Partial<DatabaseBlockAttrs>];
    delete: [];
}>();

const blockIdRef = toRef(() => props.attrs.blockId || null);
const blockViewsState = useBlockViews(blockIdRef);

const busy = ref(false);
const error = ref<string | null>(null);
const {
    layoutRequirementPrompt,
    requestMissingLayoutProperties,
    onLayoutRequirementSubmit,
    onLayoutRequirementCancel,
} = useLayoutRequirementPrompt();

const isUnbound = computed(
    () => blockViewsState.loaded.value && blockViewsState.views.value.length === 0,
);

const initialViewIntent = computed<DatabaseBlockInitialView>(() => props.attrs.initialView ?? {
    type: 'table',
    name: defaultViewName('table'),
});

const initialViewEntry = computed(() => viewEntryFor(initialViewIntent.value.type));

const initialViewLabel = computed(
    () => initialViewIntent.value.name?.trim() || initialViewEntry.value.label,
);

async function bootstrapFirstView(
    database: Database,
    schema: PropertyDefinition[],
    resolveMissingRequirements: MissingLayoutRequirementResolver,
): Promise<void> {
    const prepared = await prepareDatabaseViewCreation({
        blockId: props.attrs.blockId,
        database,
        schema,
        existingViewCount: 0,
        intent: initialViewIntent.value,
        resolveMissingRequirements,
    });
    if (!prepared) return;
    const id = await blockViewsState.addView({
        dataSourceDatabaseId: database.id,
        name: prepared.name,
        type: prepared.type,
        ...(prepared.config ? { config: prepared.config } : {}),
    });
    if (id) emit('update:attrs', { activeViewId: id, initialView: null });
}

async function onCreateDatasource(title: string): Promise<void> {
    if (!props.editable) return;
    busy.value = true;
    error.value = null;
    try {
        const { database } = await api.databases.create({ title });
        await bootstrapFirstView(database, [], (_viewLabel, requirements) =>
            Promise.resolve(defaultMissingLayoutInputs(requirements)),
        );
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not create datasource';
    } finally {
        busy.value = false;
    }
}

async function onLinkDatasource(database: Database): Promise<void> {
    if (!props.editable) return;
    busy.value = true;
    error.value = null;
    try {
        const bundle = await api.databases.bundle(database.id);
        await bootstrapFirstView(
            bundle.database,
            bundle.schema,
            requestMissingLayoutProperties,
        );
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not link datasource';
    } finally {
        busy.value = false;
    }
}

async function onAddView(payload: {
    type: DatabaseViewType;
    dataSourceDatabaseId: string;
    name?: string;
    config?: Partial<DatabaseViewConfig>;
}): Promise<void> {
    if (!props.editable) return;
    const id = await blockViewsState.addView({
        dataSourceDatabaseId: payload.dataSourceDatabaseId,
        name: payload.name ?? defaultViewName(payload.type),
        type: payload.type,
        ...(payload.config ? { config: payload.config } : {}),
    });
    if (id) emit('update:attrs', { activeViewId: id });
}

async function onRemoveView(viewId: string): Promise<void> {
    if (!props.editable) return;
    await blockViewsState.removeView(viewId);
    const remaining = blockViewsState.views.value;
    if (!remaining.length) {
        emit('update:attrs', { activeViewId: null });
        return;
    }
    if (viewId === props.attrs.activeViewId) {
        emit('update:attrs', { activeViewId: remaining[0].id });
    }
}

function onSelectView(viewId: string): void {
    if (viewId === props.attrs.activeViewId) return;
    emit('update:attrs', { activeViewId: viewId });
}

async function onSaveAsNewView(payload: { sourceViewId: string; name: string }): Promise<void> {
    if (!props.editable) return;
    const source = blockViewsState.views.value.find((view) => view.id === payload.sourceViewId);
    if (!source) return;
    const id = await blockViewsState.addView({
        dataSourceDatabaseId: source.dataSourceDatabaseId,
        name: payload.name,
        type: source.type,
        config: source.config,
    });
    if (id) emit('update:attrs', { activeViewId: id });
}
</script>

<template>
    <div class="db-embed">
        <div v-if="!blockViewsState.loaded.value" class="db-embed__loading">Loading...</div>
        <DatabaseUnboundPicker
            v-else-if="isUnbound"
            :view-label="initialViewLabel"
            :view-icon="initialViewEntry.icon"
            :view-description="initialViewEntry.description"
            :editable="editable"
            :busy="busy"
            :error="error"
            @create="onCreateDatasource"
            @link="onLinkDatasource"
            @delete="emit('delete')" />
        <DatabaseBody
            v-else
            :block-id="attrs.blockId"
            :views="blockViewsState.views.value"
            :active-view-id="attrs.activeViewId"
            :editable="editable"
            @select-view="onSelectView"
            @rename-view="(id, name) => blockViewsState.patchView(id, { name })"
            @delete-view="onRemoveView"
            @add-view="onAddView"
            @change-view-source="(id, source) => blockViewsState.patchView(id, { dataSourceDatabaseId: source, config: EMPTY_DATABASE_VIEW_CONFIG })"
            @change-view-type="(id, type, config) => blockViewsState.patchView(id, { type, ...(config ? { config } : {}) })"
            @patch-view-config="(id, patch) => blockViewsState.patchView(id, { config: patch })"
            @save-as-new-view="onSaveAsNewView"
            @delete="emit('delete')" />
        <DatabaseLayoutRequirementModal
            v-if="layoutRequirementPrompt"
            :model-value="true"
            :view-label="layoutRequirementPrompt.viewLabel"
            :requirements="layoutRequirementPrompt.requirements"
            @update:model-value="(value) => { if (!value) onLayoutRequirementCancel(); }"
            @submit="onLayoutRequirementSubmit"
            @cancel="onLayoutRequirementCancel" />
    </div>
</template>

<style scoped>
.db-embed {
    display: contents;
}

.db-embed__loading {
    padding: 1.25rem;
    color: var(--fg-muted, #a09b90);
    font-size: 0.875rem;
    text-align: center;
}
</style>
