<script setup lang="ts">
/**
 * Bound-state body for a database block.
 *
 * Renders the toolbar (view tabs / settings / add / delete) and the
 * active view's body. Owns:
 *
 *   – Active-view resolution (prop fallback → first view).
 *   – Datasource bundle (database + schema) for the active view's
 *     `dataSourceDatabaseId`. Each block view targets exactly one
 *     datasource, so we don't reconcile a parent/override pair any
 *     more — just load the source the active view points at.
 *   – The query against that datasource.
 *
 * Live sync — bundle, block-views and query reloads driven by
 * mutations from other blocks / windows / tabs are handled inside the
 * composables themselves through the realtime bus, so this component
 * only forwards UI intents and config patches.
 */
import { computed, ref } from 'vue';
import { useDatabaseBundle, useDatabaseQuery } from '@/composables/useDatabase';
import type {
    DatabaseRowSnapshot,
    DatabaseView,
    DatabaseViewConfig,
    DatabaseViewType,
} from '@continuum/shared';
import DatabaseToolbar from './DatabaseToolbar.vue';
import { viewRegistry } from './views/registry';
import { useDatabaseViewQuery } from './useDatabaseViewQuery';

const props = defineProps<{
    blockId: string;
    views: DatabaseView[];
    activeViewId: string | null;
    editable: boolean;
}>();

const emit = defineEmits<{
    'select-view': [viewId: string];
    'add-view': [payload: { type: DatabaseViewType; dataSourceDatabaseId: string; name?: string }];
    'rename-view': [viewId: string, name: string];
    'delete-view': [viewId: string];
    'change-view-source': [viewId: string, dataSourceDatabaseId: string];
    'change-view-type': [viewId: string, type: DatabaseViewType];
    'patch-view-config': [viewId: string, patch: Partial<DatabaseViewConfig>];
    delete: [];
}>();

/** Selected view (defaults to the first one when the saved id is stale). */
const activeView = computed<DatabaseView | null>(() => {
    if (!props.views.length) return null;
    if (props.activeViewId) {
        const match = props.views.find((v) => v.id === props.activeViewId);
        if (match) return match;
    }
    return props.views[0] ?? null;
});

/** Datasource id backing the active view. */
const activeSourceIdRef = computed(() => activeView.value?.dataSourceDatabaseId ?? null);
const sourceBundleState = useDatabaseBundle(activeSourceIdRef);

const activeSchema = computed(() => sourceBundleState.bundle.value?.schema ?? []);
const activeDatabase = computed(() => sourceBundleState.bundle.value?.database ?? null);

// Renderer for the active view, with a defensive fallback so a stale
// type from an old node attr can never crash render.
const activeViewComponent = computed(() => {
    const type = activeView.value?.type ?? 'table';
    return (viewRegistry[type] ?? viewRegistry.table).component;
});

const queryConfig = computed<Partial<DatabaseViewConfig> | null>(() => activeView.value?.config ?? null);

const queryState = useDatabaseQuery(activeSourceIdRef, queryConfig);

/**
 * Raw rows straight from the server query. Filter & sort happen in
 * `useDatabaseViewQuery` below so every renderer sees the same
 * derived list without per-component plumbing.
 */
const rawRows = computed<DatabaseRowSnapshot[]>(
    () => queryState.response.value?.rows ?? [],
);

/**
 * Synthetic view fallback used while the real view is still loading.
 * Keeps the composable type-stable so `finalRows` never has to short
 * circuit on `null`.
 */
const safeActiveView = computed<DatabaseView>(() => {
    return activeView.value ?? {
        id: '__pending__',
        blockId: props.blockId,
        dataSourceDatabaseId: '',
        type: 'table',
        name: '',
        position: 0,
        config: {},
    } as unknown as DatabaseView;
});

const { finalRows } = useDatabaseViewQuery({
    rows: rawRows,
    activeView: safeActiveView,
    schema: activeSchema,
});

const isLoadingActive = computed(() => sourceBundleState.loading.value
    || (queryState.loading.value && !queryState.response.value));
const activeNotFound = computed(() => sourceBundleState.notFound.value);

const actionError = ref<string | null>(null);
const draftRequest = ref(0);

function messageFromUnknownError(err: unknown): string {
    return err instanceof Error ? err.message : 'Database operation failed';
}

async function onAddRow(): Promise<void> {
    if (!props.editable) return;
    actionError.value = null;
    if (activeView.value?.type === 'table') {
        draftRequest.value += 1;
        return;
    }
    actionError.value = 'Switch to a Table view to draft a new row inline.';
}

async function onRemoveRow(rowId: string): Promise<void> {
    if (!props.editable) return;
    actionError.value = null;
    await queryState.removeRow(rowId);
}

async function onSchemaChanged(): Promise<void> {
    actionError.value = null;
    try {
        await sourceBundleState.reload();
        await queryState.reload();
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}

/**
 * Per-renderer config patch (e.g. Board picking a new group-by
 * property). Deep-merges the `layout` sub-object so a renderer can
 * patch a single knob without clobbering the rest of the saved
 * configuration.
 */
function onViewConfigChanged(patch: Partial<DatabaseViewConfig>): void {
    if (!props.editable) return;
    const view = activeView.value;
    if (!view) return;
    const merged: Partial<DatabaseViewConfig> = { ...patch };
    if (patch.layout) {
        merged.layout = { ...(view.config.layout ?? {}), ...patch.layout };
    }
    emit('patch-view-config', view.id, merged);
}

/**
 * Toolbar-bridged `patch-view-config` (filter / sort / future root
 * keys). Re-emits as a typed `Partial<DatabaseViewConfig>` so the
 * template stays free of inline type casts.
 */
function onPatchConfigFromToolbar(viewId: string, patch: Record<string, unknown>): void {
    emit('patch-view-config', viewId, patch as Partial<DatabaseViewConfig>);
}
</script>

<template>
    <div class="db-body">
        <DatabaseToolbar
            v-if="views.length"
            :views="views"
            :active-view-id="activeView?.id ?? null"
            :editable="editable"
            @select-view="(id) => emit('select-view', id)"
            @rename-view="(id, name) => emit('rename-view', id, name)"
            @delete-view="(id) => emit('delete-view', id)"
            @add-view="(payload) => emit('add-view', payload)"
            @add-row="onAddRow"
            @change-view-source="(viewId, dbId) => emit('change-view-source', viewId, dbId)"
            @change-view-type="(viewId, type) => emit('change-view-type', viewId, type)"
            @patch-view-layout="(viewId, patch) => emit('patch-view-config', viewId, { layout: patch })"
            @patch-view-config="(viewId, patch) => onPatchConfigFromToolbar(viewId, patch)"
            @delete="emit('delete')" />

        <div class="db-body__view">
            <div v-if="actionError || queryState.error.value" class="db-body__error">
                {{ actionError || queryState.error.value }}
            </div>
            <div v-if="isLoadingActive" class="db-body__state">
                Loading…
            </div>
            <div v-else-if="activeNotFound" class="db-body__state">
                Datasource no longer exists. Pick another in view settings.
            </div>
            <component
                :is="activeViewComponent"
                v-else-if="activeDatabase && activeView"
                :database="activeDatabase"
                :schema="activeSchema"
                :rows="finalRows"
                :active-view="activeView"
                :draft-request="draftRequest"
                :editable="editable"
                @schema-changed="onSchemaChanged"
                @remove-row="onRemoveRow"
                @row-created="queryState.reload"
                @cell-saved="queryState.reload"
                @view-config-changed="onViewConfigChanged" />
        </div>
    </div>
</template>

<style scoped>
.db-body {
    display: flex;
    flex-direction: column;
    background: var(--surface-0);
}

.db-body__state {
    padding: var(--space-6);
    color: var(--text-muted);
    font-size: var(--text-sm);
    text-align: center;
}

.db-body__error {
    margin: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--danger-faint);
    border: var(--border-width-1) solid var(--danger-border);
    color: var(--danger);
    font-size: var(--text-xs);
}
</style>
