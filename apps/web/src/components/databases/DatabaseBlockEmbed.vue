<script setup lang="ts">
/**
 * Root host bound to the editor's `database` NodeView (schema v2).
 *
 * A `database` block is now a thin container that holds zero or more
 * `BlockView`s. Each block view points at one datasource. The two
 * possible states are:
 *
 *   - **Unbound** — the block has no views yet. We render
 *     `DatabaseUnboundPicker` so the user can create a fresh
 *     datasource or link an existing one. Confirming either path
 *     creates the *first* block view bound to that datasource and
 *     sets it as the active view.
 *
 *   - **Bound** — the block has ≥1 block view. We delegate to
 *     `DatabaseBody`, which owns the toolbar (view tabs, settings,
 *     add view, delete block) and the active view body.
 *
 * The component never mutates `attrs` directly: every change is
 * forwarded through the `update:attrs` emit so the editor remains the
 * single writer of node attributes.
 */
import { computed, ref, toRef } from 'vue';
import { api } from '@/api';
import type {
    Database,
    DatabaseBlockAttrs,
    DatabaseViewType,
} from '@continuum/shared';
import { EMPTY_DATABASE_VIEW_CONFIG } from '@continuum/shared';
import { useBlockViews } from '@/composables/useDatabase';
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

const blockIdRef = toRef(() => props.attrs.blockId || null);
const blockViewsState = useBlockViews(blockIdRef);

const busy = ref(false);
const error = ref<string | null>(null);

const isUnbound = computed(
    () => blockViewsState.loaded.value && blockViewsState.views.value.length === 0,
);

/**
 * First-view bootstrap. Picks a sensible default name + type (table)
 * and immediately appends a block view bound to the given datasource.
 * Used by both "create new" and "link existing" picker paths so the
 * block flips out of unbound state in one round-trip.
 */
async function bootstrapFirstView(database: Database): Promise<void> {
    const id = await blockViewsState.addView({
        dataSourceDatabaseId: database.id,
        name: database.title || 'Table',
        type: 'table',
    });
    if (id) emit('update:attrs', { activeViewId: id });
}

async function onCreateDatasource(title: string): Promise<void> {
    if (!props.editable) return;
    busy.value = true;
    error.value = null;
    try {
        const { database } = await api.databases.create({ title });
        await bootstrapFirstView(database);
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
        await bootstrapFirstView(database);
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not link datasource';
    } finally {
        busy.value = false;
    }
}

/**
 * Add a brand-new view (after the first one). Used by the toolbar's
 * "+" button via `AddViewModal`, which already collected the type +
 * datasource pair.
 */
async function onAddView(payload: {
    type: DatabaseViewType;
    dataSourceDatabaseId: string;
    name?: string;
}): Promise<void> {
    if (!props.editable) return;
    const id = await blockViewsState.addView({
        dataSourceDatabaseId: payload.dataSourceDatabaseId,
        name: payload.name ?? defaultViewName(payload.type),
        type: payload.type,
    });
    if (id) emit('update:attrs', { activeViewId: id });
}

function defaultViewName(type: DatabaseViewType): string {
    const count = blockViewsState.views.value.length + 1;
    const labels: Record<DatabaseViewType, string> = {
        table: 'Table',
        board: 'Board',
        gallery: 'Gallery',
        list: 'List',
        calendar: 'Calendar',
        timeline: 'Timeline',
        chart: 'Chart',
        dashboard: 'Dashboard',
        feed: 'Feed',
        map: 'Map',
        form: 'Form',
    };
    return `${labels[type] ?? 'View'} ${count}`;
}

/**
 * Remove a view. If the user nukes the last one we also wipe the
 * `activeViewId` so the embed flips back to the unbound picker.
 */
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

/**
 * "Save as new view" — fork the current view's full config (filter,
 * sort, layout, …) into a brand-new sibling view bound to the same
 * datasource. Used by the summary chip bar so the user can promote an
 * ad-hoc filter into a permanent saved view in one click.
 */
async function onSaveAsNewView(payload: { sourceViewId: string; name: string }): Promise<void> {
    if (!props.editable) return;
    const source = blockViewsState.views.value.find((v) => v.id === payload.sourceViewId);
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
    <div v-if="!blockViewsState.loaded.value" class="db-embed__loading">Loading…</div>
    <DatabaseUnboundPicker
        v-else-if="isUnbound"
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
</template>

<style scoped>
.db-embed__loading {
    padding: 1.25rem;
    color: var(--fg-muted, #a09b90);
    font-size: 0.875rem;
    text-align: center;
}
</style>
