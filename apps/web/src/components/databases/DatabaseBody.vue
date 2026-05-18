<script setup lang="ts">
/**
 * Bound-state body for a database block.
 *
 * Owns the bundle (database + views + schema) and the active view.
 * Composes:
 *
 *   – `DatabaseToolbar` — title, view tabs, "add row", "add view".
 *   – The renderer published by `viewRegistry[activeView.type]` — table,
 *     board, gallery, list, calendar today; placeholder for the
 *     remaining planned types.
 *
 * The active view is the prop `viewId` when present, falling back to
 * the first saved view. Switching tabs emits `update:view-id` so the
 * editor persists the user's choice in the node attributes.
 *
 * Live sync — bundle and query reloads driven by mutations on this
 * database (from any block / window / tab) are handled inside the
 * composables themselves through the realtime bus, so this component
 * only forwards UI intents and config patches.
 */
import { computed, ref, toRef } from 'vue';
import { useDatabaseBundle, useDatabaseQuery } from '@/composables/useDatabase';
import type {
    DatabaseView,
    DatabaseViewConfig,
    DatabaseViewType,
} from '@continuum/shared';
import DatabaseToolbar from './DatabaseToolbar.vue';
import { viewRegistry } from './views/registry';

const props = defineProps<{
    databaseId: string;
    viewId: string | null;
    editable: boolean;
}>();

const emit = defineEmits<{
    'update:view-id': [viewId: string | null];
    delete: [];
}>();

const databaseIdRef = toRef(props, 'databaseId');
const bundleState = useDatabaseBundle(databaseIdRef);

/** Selected view (defaults to the first saved view when none is bound). */
const activeView = computed<DatabaseView | null>(() => {
    const list = bundleState.bundle.value?.views ?? [];
    if (!list.length) return null;
    if (props.viewId) {
        const match = list.find((v) => v.id === props.viewId);
        if (match) return match;
    }
    return list[0] ?? null;
});

const activeViewId = computed(() => activeView.value?.id ?? null);

/**
 * Effective database id for the active view. When the saved view has a
 * `dataSourceDatabaseId` override pointing at a different database we
 * resolve rows + schema against that one; otherwise we fall back to
 * the parent block's database (the toolbar / source picker still
 * operates on the parent).
 */
const effectiveDatabaseId = computed<string>(() => {
    const override = activeView.value?.dataSourceDatabaseId;
    if (override && override !== props.databaseId) return override;
    return props.databaseId;
});

const overrideBundleIdRef = computed<string | null>(() => {
    return effectiveDatabaseId.value === props.databaseId
        ? null
        : effectiveDatabaseId.value;
});

const overrideBundleState = useDatabaseBundle(overrideBundleIdRef);

/**
 * Schema fed into the active renderer. Uses the override bundle when
 * the active view points at a different datasource; otherwise the
 * parent bundle's schema. We never mix them \u2014 a Gallery in this
 * view rendering rows from DB B must use DB B's property definitions.
 */
const effectiveSchema = computed(() => {
    if (overrideBundleIdRef.value) {
        return overrideBundleState.bundle.value?.schema ?? [];
    }
    return bundleState.bundle.value?.schema ?? [];
});

const effectiveDatabaseObj = computed(() => {
    if (overrideBundleIdRef.value) {
        return overrideBundleState.bundle.value?.database ?? null;
    }
    return bundleState.bundle.value?.database ?? null;
});

const activeViewLoading = computed(() => {
    return bundleState.loading.value || (!!overrideBundleIdRef.value && overrideBundleState.loading.value);
});

const activeViewNotFound = computed(() => {
    return bundleState.notFound.value || (!!overrideBundleIdRef.value && overrideBundleState.notFound.value);
});

// Resolve the renderer component for the active view, falling back to
// the table renderer when the registry has no entry — defensive: the
// registry currently covers every `DatabaseViewType`, but a stale node
// attr could carry a removed type until the server normalises it.
const activeViewComponent = computed(() => {
    const type = activeView.value?.type ?? 'table';
    return (viewRegistry[type] ?? viewRegistry.table).component;
});

// Ad-hoc per-block config override (filter / sort toggled in the
// toolbar). MVP: empty until the toolbar exposes controls; passing
// `null` keeps the saved view config authoritative.
const configOverride = ref<Partial<DatabaseViewConfig> | null>(null);

// IMPORTANT: when the active view has a per-view datasource override,
// the query targets the *override* database. The active view id stays
// the same (the view definition itself is owned by the parent
// database) \u2014 but the query is bound to the override's database id
// so the rows + property values come from the right table.
const queryState = useDatabaseQuery(effectiveDatabaseId, activeViewId, configOverride);
const activeViewRenderLoading = computed(
    () => activeViewLoading.value || (queryState.loading.value && !queryState.response.value),
);
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

async function onAddView(type: DatabaseViewType = 'table'): Promise<void> {
    if (!props.editable) return;
    actionError.value = null;
    try {
        const entry = viewRegistry[type];
        const id = await bundleState.addView({
            name: `${entry.label} ${(bundleState.bundle.value?.views.length ?? 0) + 1}`,
            type,
            config: entry.defaultLayout
                ? { layout: entry.defaultLayout }
                : undefined,
        });
        if (id) emit('update:view-id', id);
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}

async function onRename(title: string): Promise<void> {
    actionError.value = null;
    try {
        await bundleState.patchDatabase({ title });
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}

async function onRenameView(viewId: string, name: string): Promise<void> {
    if (!props.editable) return;
    actionError.value = null;
    try {
        await bundleState.patchView(viewId, { name });
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}

async function onDeleteView(viewId: string): Promise<void> {
    if (!props.editable) return;
    actionError.value = null;
    try {
        await bundleState.removeView(viewId);
        // If the deleted view was active, fall back to the first remaining one.
        if (viewId === props.viewId) {
            const next = bundleState.bundle.value?.views[0]?.id ?? null;
            emit('update:view-id', next);
        }
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}

async function onSchemaChanged(): Promise<void> {
    actionError.value = null;
    try {
        await bundleState.reload();
        if (overrideBundleIdRef.value) await overrideBundleState.reload();
        await queryState.reload();
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}

/**
 * Apply a per-view datasource override change. When the user picks a
 * different source database we also wipe the view's saved layout knobs
 * (cover / date property, group-by, sort, visibility) \u2014 they reference
 * property keys that almost certainly don't exist on the new database
 * and would produce empty / broken renders. The renderer will re-seed
 * defaults on the next mount.
 */
async function onChangeViewSource(
    viewId: string,
    databaseId: string | null,
): Promise<void> {
    if (!props.editable) return;
    actionError.value = null;
    try {
        await bundleState.patchView(viewId, {
            dataSourceDatabaseId: databaseId,
            config: { layout: {}, sort: [], visibleProperties: [], hiddenProperties: [] },
        });
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}

/**
 * Persist a partial layout-config change emitted by a renderer (e.g.
 * the Board view picking a new group-by property). We deep-merge the
 * `layout` sub-object so a renderer can patch a single knob without
 * clobbering the rest of the saved configuration.
 */
async function onViewConfigChanged(patch: Partial<DatabaseViewConfig>): Promise<void> {
    if (!props.editable) return;
    const view = activeView.value;
    if (!view) return;
    actionError.value = null;
    const merged: Partial<DatabaseViewConfig> = { ...patch };
    if (patch.layout) {
        merged.layout = { ...(view.config.layout ?? {}), ...patch.layout };
    }
    try {
        await bundleState.patchView(view.id, { config: merged });
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}

/**
 * Swap a view's renderer type from the view-settings popover. Type
 * changes leave `config` intact — the new renderer probes the
 * existing `layout` knobs (group-by, cover, date) and silently
 * ignores keys it doesn't understand, so cross-layout switches
 * degrade gracefully without losing user intent.
 */
async function onChangeViewType(viewId: string, type: DatabaseViewType): Promise<void> {
    if (!props.editable) return;
    actionError.value = null;
    try {
        await bundleState.patchView(viewId, { type });
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}

/**
 * Persist a partial layout patch coming from the view-settings popover.
 * Targets an arbitrary view (not necessarily the active one) so the
 * popover can be opened from any tab. Deep-merges into the view's
 * existing `config.layout` to preserve unrelated knobs.
 */
async function onPatchViewLayout(
    viewId: string,
    patch: Record<string, unknown>,
): Promise<void> {
    if (!props.editable) return;
    const targetView = bundleState.bundle.value?.views.find((v) => v.id === viewId);
    if (!targetView) return;
    actionError.value = null;
    const merged = { ...(targetView.config.layout ?? {}), ...patch };
    try {
        await bundleState.patchView(viewId, { config: { layout: merged } });
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}
</script>

<template>
    <div class="db-body">
        <DatabaseToolbar
            v-if="bundleState.bundle.value"
            :database="bundleState.bundle.value.database"
            :views="bundleState.bundle.value.views"
            :schema="bundleState.bundle.value.schema"
            :active-view-id="activeViewId"
            :effective-database-id="effectiveDatabaseId"
            :editable="editable"
            @select-view="(id) => emit('update:view-id', id)"
            @rename-view="(id, name) => onRenameView(id, name)"
            @delete-view="(id) => onDeleteView(id)"
            @add-view="(type) => onAddView(type)"
            @add-row="onAddRow"
            @rename="onRename"
            @change-view-source="(viewId, dbId) => onChangeViewSource(viewId, dbId)"
            @change-view-type="(viewId, type) => onChangeViewType(viewId, type)"
            @patch-view-layout="(viewId, patch) => onPatchViewLayout(viewId, patch)"
            @delete="emit('delete')" />

        <div class="db-body__view">
            <div v-if="actionError || queryState.error.value" class="db-body__error">
                {{ actionError || queryState.error.value }}
            </div>
            <div v-if="activeViewRenderLoading" class="db-body__state">
                Loading…
            </div>
            <div v-else-if="activeViewNotFound" class="db-body__state">
                Database no longer exists.
            </div>
            <component
                :is="activeViewComponent"
                v-else-if="effectiveDatabaseObj && activeView"
                :database="effectiveDatabaseObj"
                :schema="effectiveSchema"
                :rows="queryState.response.value?.rows ?? []"
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
}

.db-body__view {
    border-top: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
}

.db-body__state {
    padding: 1.25rem;
    color: var(--fg-muted, #a09b90);
    font-size: 0.875rem;
    text-align: center;
}

.db-body__error {
    margin: 0.75rem;
    padding: 0.5rem 0.6rem;
    border-radius: var(--radius-xs, 4px);
    background: var(--danger-faint, rgba(184, 92, 92, 0.08));
    border: var(--border-width-1, 1px) solid var(--danger-border, rgba(184, 92, 92, 0.3));
    color: var(--danger, #b85c5c);
    font-size: var(--text-sm, 0.75rem);
}
</style>
