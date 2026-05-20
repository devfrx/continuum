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
import { useDatabaseDirectory } from '@/composables/useDatabaseDirectory';
import { api } from '@/api';
import { publishPropertyValueChanged } from '@/lib/realtime';
import type {
    DatabaseRowSnapshot,
    DatabaseView,
    DatabaseViewConfig,
    DatabaseViewType,
    PropertyDefinition,
} from '@continuum/shared';
import DatabaseToolbar from './DatabaseToolbar.vue';
import DatabaseViewSettings from './DatabaseViewSettings.vue';
import DatabaseLayoutRequirementModal from './DatabaseLayoutRequirementModal.vue';
import DatabaseRowDraftBar from './DatabaseRowDraftBar.vue';
import LinkExistingNoteModal from './LinkExistingNoteModal.vue';
import { useLayoutRequirementPrompt } from './useLayoutRequirementPrompt';
import {
    createMissingLayoutRequirementProperties,
    prepareDatabaseViewCreation,
} from './viewCreation';
import { DatabaseViewSummaryBar } from './summary';
import {
    conditionalColorsWithoutRule,
    filterWithoutCondition,
    sortWithoutRule,
} from './summary/summarize';
import type { AnchorRect } from './summary';
import type { SectionId } from './viewSettings/sections';
import { viewEntryFor, viewRegistry } from './views/registry';
import {
    findSourceTableView,
    viewNeedsTableCompanion,
} from './views/tableCompanion';
import type {
    AddRowPlan,
    AddRowSeed,
} from './views/types';
import {
    buildViewLayoutContext,
    layoutPatchFromResolutions,
    missingPropertyRequirements,
    resolveLayoutRequirements,
    viewWithTypeAndLayout,
    type LayoutRequirementResolution,
    type RequiredPropertyCreateInput,
} from './views/layoutRequirements';
import { useDatabaseViewQuery } from './useDatabaseViewQuery';

const props = defineProps<{
    blockId: string;
    views: DatabaseView[];
    activeViewId: string | null;
    editable: boolean;
}>();

const emit = defineEmits<{
    'select-view': [viewId: string];
    'add-view': [
        payload: {
            type: DatabaseViewType;
            dataSourceDatabaseId: string;
            name?: string;
            config?: Partial<DatabaseViewConfig>;
        },
    ];
    'rename-view': [viewId: string, name: string];
    'delete-view': [viewId: string];
    'change-view-source': [viewId: string, dataSourceDatabaseId: string];
    'change-view-type': [
        viewId: string,
        type: DatabaseViewType,
        config?: Partial<DatabaseViewConfig>,
    ];
    'patch-view-config': [viewId: string, patch: Partial<DatabaseViewConfig>];
    /**
     * Persist the current view's filter+sort as a brand-new view.
     * The embed handles the actual `addView` call so the body stays
     * declarative.
     */
    'save-as-new-view': [payload: { sourceViewId: string; name: string }];
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
const databaseDirectory = useDatabaseDirectory();

function fallbackSourceLabel(databaseId: string): string {
    const active = activeDatabase.value;
    if (active?.id === databaseId && active.title.trim()) return active.title;
    return databaseId.slice(0, 6);
}

const sourceLabels = computed<Record<string, string>>(() => {
    const labels: Record<string, string> = {};
    for (const view of props.views) {
        const database = databaseDirectory.byId(view.dataSourceDatabaseId);
        const title = database?.title.trim();
        labels[view.dataSourceDatabaseId] = title || fallbackSourceLabel(view.dataSourceDatabaseId);
    }
    return labels;
});

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

const { finalRows, hasFilter, hasSort } = useDatabaseViewQuery({
    rows: rawRows,
    activeView: safeActiveView,
    schema: activeSchema,
});

const hasConditionalColors = computed(() =>
    (activeView.value?.config.conditionalColors?.length ?? 0) > 0,
);

const showSummaryBar = computed(() =>
    !!activeView.value
    && (hasFilter.value || hasSort.value || hasConditionalColors.value),
);

const sourceTableView = computed<DatabaseView | null>(() => {
    const view = activeView.value;
    return view ? findSourceTableView(props.views, view.dataSourceDatabaseId) : null;
});

const showSourceTableAction = computed(() => {
    const database = activeDatabase.value;
    const view = activeView.value;
    if (!database || !view) return false;
    if (!props.editable && !sourceTableView.value) return false;
    const entry = viewEntryFor(view.type);
    return viewNeedsTableCompanion({
        database,
        schema: activeSchema.value,
        activeView: view,
        layoutRequirements: entry.layoutRequirements,
    });
});

const sourceTableActionLabel = computed(() =>
    sourceTableView.value ? 'Open table' : 'Create table',
);

const sourceTableActionTitle = computed(() =>
    sourceTableView.value
        ? 'Open the table view for this datasource'
        : 'Create a table view for this datasource',
);

const isLoadingActive = computed(() => sourceBundleState.loading.value
    || (queryState.loading.value && !queryState.response.value));
const activeNotFound = computed(() => sourceBundleState.notFound.value);

const actionError = ref<string | null>(null);
const draftRequest = ref(0);

interface BodyDraftState {
    viewId: string;
    title: string;
    creating: boolean;
    error: string | null;
    placeholder: string;
    focusToken: number;
    seeds: AddRowSeed[];
}

const bodyDraft = ref<BodyDraftState | null>(null);
const {
    layoutRequirementPrompt,
    requestMissingLayoutProperties,
    onLayoutRequirementSubmit,
    onLayoutRequirementCancel,
} = useLayoutRequirementPrompt();

function messageFromUnknownError(err: unknown): string {
    return err instanceof Error ? err.message : 'Database operation failed';
}

async function createMissingLayoutProperties(
    databaseId: string,
    missing: LayoutRequirementResolution[],
    inputs: RequiredPropertyCreateInput[],
): Promise<{ schema: PropertyDefinition[]; layoutPatch: Record<string, unknown> }> {
    const created = await createMissingLayoutRequirementProperties({
        databaseId,
        schema: activeSchema.value,
        missing,
        inputs,
    });
    if (created.createdPropertyCount > 0) {
        await sourceBundleState.reload();
        await queryState.reload();
    }
    const reloadedSchema = sourceBundleState.bundle.value?.schema ?? [];
    return {
        schema: reloadedSchema.length > 0 ? reloadedSchema : created.schema,
        layoutPatch: created.layoutPatch,
    };
}

async function ensureLayoutRequirements(
    view: DatabaseView,
    nextType: DatabaseViewType,
    layoutPatch: Record<string, unknown> = {},
): Promise<{ view: DatabaseView; schema: PropertyDefinition[]; layoutPatch: Record<string, unknown> } | null> {
    const database = activeDatabase.value;
    if (!database) {
        actionError.value = 'Datasource is still loading — try again in a moment.';
        return null;
    }
    const entry = viewEntryFor(nextType);
    const base = { database, schema: activeSchema.value, activeView: view };
    const ctx = buildViewLayoutContext(base, nextType, layoutPatch);
    const resolutions = resolveLayoutRequirements(entry.layoutRequirements ?? [], ctx);
    const missing = missingPropertyRequirements(resolutions);
    let schema = activeSchema.value;
    let requirementPatch = layoutPatchFromResolutions(resolutions);

    if (missing.length > 0) {
        const inputs = await requestMissingLayoutProperties(
            entry.label,
            missing.map((resolution) => resolution.requirement),
        );
        if (!inputs) return null;
        try {
            const created = await createMissingLayoutProperties(database.id, missing, inputs);
            schema = created.schema;
            requirementPatch = { ...requirementPatch, ...created.layoutPatch };
        } catch (err) {
            actionError.value = messageFromUnknownError(err);
            return null;
        }
    }

    const finalLayoutPatch = { ...layoutPatch, ...requirementPatch };
    return {
        schema,
        layoutPatch: finalLayoutPatch,
        view: viewWithTypeAndLayout(view, nextType, finalLayoutPatch),
    };
}

function startBodyDraft(view: DatabaseView, plan: Extract<AddRowPlan, { mode: 'draft' }>): void {
    bodyDraft.value = {
        viewId: view.id,
        title: '',
        creating: false,
        error: null,
        placeholder: plan.placeholder ?? 'New row',
        focusToken: Date.now(),
        seeds: plan.seeds ?? [],
    };
}

function cancelBodyDraft(): void {
    if (bodyDraft.value?.creating) return;
    bodyDraft.value = null;
}

async function commitBodyDraft(): Promise<void> {
    const draft = bodyDraft.value;
    if (!draft || draft.creating) return;
    const title = draft.title.trim();
    if (!title) {
        cancelBodyDraft();
        return;
    }
    draft.creating = true;
    draft.error = null;
    try {
        const created = await queryState.createRow({ title });
        if (!created) {
            draft.error = queryState.error.value ?? 'Failed to create row.';
            return;
        }
        for (const seed of draft.seeds) {
            await api.properties.setValue(created.noteId, seed.propertyId, seed.value);
            publishPropertyValueChanged(created.noteId, seed.propertyId);
        }
        if (draft.seeds.length > 0) await queryState.reload();
        bodyDraft.value = null;
    } catch (err) {
        draft.error = messageFromUnknownError(err);
    } finally {
        if (bodyDraft.value) bodyDraft.value.creating = false;
    }
}

async function onAddRow(): Promise<void> {
    if (!props.editable) return;
    actionError.value = null;
    const view = activeView.value;
    if (!view) return;
    const database = activeDatabase.value;
    if (!database) {
        actionError.value = 'Datasource is still loading — try again in a moment.';
        return;
    }
    const entry = viewEntryFor(view.type);
    const initialPlanner = entry.planAddRow ?? ((): AddRowPlan => ({ mode: 'draft' }));
    const initialPlan = initialPlanner({ database, schema: activeSchema.value, activeView: view });
    if (initialPlan.mode === 'unsupported') {
        actionError.value = initialPlan.reason;
        return;
    }
    const prepared = await ensureLayoutRequirements(view, view.type);
    if (!prepared) return;
    if (Object.keys(prepared.layoutPatch).length > 0) {
        emit('patch-view-config', view.id, { layout: prepared.layoutPatch } as Partial<DatabaseViewConfig>);
    }
    const planner = entry.planAddRow ?? ((): AddRowPlan => ({ mode: 'draft' }));
    const plan: AddRowPlan = planner({
        database,
        schema: prepared.schema,
        activeView: prepared.view,
    });

    if (plan.mode === 'inline-draft') {
        draftRequest.value += 1;
        return;
    }
    if (plan.mode === 'unsupported') {
        actionError.value = plan.reason;
        return;
    }
    startBodyDraft(prepared.view, plan);
}

// ── Link-existing-note flow ────────────────────────────────────────────
// Open the picker → preview → MergeSchemaModal flow scoped to the
// active datasource. The modal owns its own preview/resolve lifecycle;
// here we only gate access (need a loaded database) and refresh the
// query when a row is committed.
const linkExistingOpen = ref(false);
const linkedNoteIds = computed(() => rawRows.value.map((r) => r.noteId));

function onLinkExisting(): void {
    if (!props.editable) return;
    if (!activeDatabase.value) {
        actionError.value = 'Datasource is still loading — try again in a moment.';
        return;
    }
    actionError.value = null;
    linkExistingOpen.value = true;
}

function onOpenSourceTable(): void {
    const view = activeView.value;
    if (!view) return;
    const tableView = sourceTableView.value;
    if (tableView) {
        emit('select-view', tableView.id);
        return;
    }
    if (!props.editable) return;
    emit('add-view', {
        type: 'table',
        dataSourceDatabaseId: view.dataSourceDatabaseId,
        name: 'Table',
    });
}

async function onLinkExistingDone(): Promise<void> {
    try {
        await queryState.reload();
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
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

// ── View options popover (owned here so the gear & summary chips
// share one source of truth) ─────────────────────────────────────────
interface SettingsRequest {
    viewId: string;
    anchorRect: AnchorRect | null;
    section: SectionId | null;
}
const settingsRequest = ref<SettingsRequest | null>(null);

const settingsView = computed<DatabaseView | null>(() => {
    const req = settingsRequest.value;
    if (!req) return null;
    return props.views.find((v) => v.id === req.viewId) ?? null;
});

function onToolbarOpenSettings(viewId: string, anchorRect: AnchorRect): void {
    settingsRequest.value = { viewId, anchorRect, section: null };
}

function onSummaryOpenSettings(section: SectionId, anchorRect: AnchorRect): void {
    const view = activeView.value;
    if (!view) return;
    settingsRequest.value = { viewId: view.id, anchorRect, section };
}

function onSettingsModelValue(value: boolean): void {
    if (!value) settingsRequest.value = null;
}

function onSettingsChangeSource(databaseId: string): void {
    const req = settingsRequest.value;
    if (!req) return;
    settingsRequest.value = null;
    emit('change-view-source', req.viewId, databaseId);
}

/**
 * "+" button on the toolbar. The user picked a layout + datasource;
 * before we create the view we walk its layout requirements (e.g. a
 * Chart needs a group-by, a Timeline needs a date range) and, when
 * the chosen datasource is missing the necessary properties, prompt
 * the user to create them up-front. The resolved `layout` patch is
 * then forwarded along with the original payload so the new view
 * lands fully configured.
 */
async function onToolbarAddView(payload: {
    type: DatabaseViewType;
    dataSourceDatabaseId: string;
    name?: string;
}): Promise<void> {
    if (!props.editable) return;
    actionError.value = null;

    let database = activeDatabase.value;
    let schema = activeSchema.value;
    if (!database || database.id !== payload.dataSourceDatabaseId) {
        try {
            const bundle = await api.databases.bundle(payload.dataSourceDatabaseId);
            database = bundle.database;
            schema = bundle.schema;
        } catch (err) {
            actionError.value = messageFromUnknownError(err);
            return;
        }
    }

    try {
        const prepared = await prepareDatabaseViewCreation({
            blockId: props.blockId,
            database,
            schema,
            existingViewCount: props.views.length,
            intent: { type: payload.type, name: payload.name },
            resolveMissingRequirements: requestMissingLayoutProperties,
        });
        if (!prepared) return;
        if (prepared.createdPropertyCount > 0 && database.id === activeDatabase.value?.id) {
            await sourceBundleState.reload();
            await queryState.reload();
        }
        emit('add-view', {
            type: prepared.type,
            dataSourceDatabaseId: database.id,
            name: prepared.name,
            ...(prepared.config ? { config: prepared.config } : {}),
        });
    } catch (err) {
        actionError.value = messageFromUnknownError(err);
    }
}

async function onSettingsChangeType(type: DatabaseViewType): Promise<void> {
    const req = settingsRequest.value;
    if (!req) return;
    const view = props.views.find((candidate) => candidate.id === req.viewId);
    if (!view) return;
    actionError.value = null;
    const prepared = await ensureLayoutRequirements(view, type);
    if (!prepared) return;
    emit('change-view-type', req.viewId, type, { layout: prepared.layoutPatch });
}

async function onSettingsPatchLayout(patch: Record<string, unknown>): Promise<void> {
    const req = settingsRequest.value;
    if (!req) return;
    const view = props.views.find((candidate) => candidate.id === req.viewId);
    if (!view) return;
    actionError.value = null;
    const prepared = await ensureLayoutRequirements(view, view.type, patch);
    if (!prepared) return;
    emit('patch-view-config', req.viewId, { layout: prepared.layoutPatch } as Partial<DatabaseViewConfig>);
}

function onSettingsPatchConfig(patch: Partial<DatabaseViewConfig>): void {
    const req = settingsRequest.value;
    if (!req) return;
    emit('patch-view-config', req.viewId, patch);
}

// ── Summary chip actions ───────────────────────────────────────────────────
function onRemoveFilterChip(conditionId: string): void {
    const view = activeView.value;
    if (!view) return;
    const nextFilter = filterWithoutCondition(view.config.filter, conditionId);
    emit('patch-view-config', view.id, { filter: nextFilter } as Partial<DatabaseViewConfig>);
}

function onRemoveSortChip(ruleId: string): void {
    const view = activeView.value;
    if (!view) return;
    const nextSort = sortWithoutRule(view.config.sort, ruleId);
    emit('patch-view-config', view.id, { sort: nextSort } as Partial<DatabaseViewConfig>);
}

function onRemoveConditionalColorChip(ruleId: string): void {
    const view = activeView.value;
    if (!view) return;
    const nextRules = conditionalColorsWithoutRule(view.config.conditionalColors, ruleId);
    emit('patch-view-config', view.id, { conditionalColors: nextRules } as Partial<DatabaseViewConfig>);
}

function onSaveAsNewView(name: string): void {
    const view = activeView.value;
    if (!view) return;
    emit('save-as-new-view', { sourceViewId: view.id, name });
}
</script>

<template>
    <div class="db-body">
        <DatabaseToolbar
            v-if="views.length"
            :views="views"
            :active-view-id="activeView?.id ?? null"
            :editable="editable"
            :source-labels="sourceLabels"
            :show-source-table-action="showSourceTableAction"
            :source-table-action-label="sourceTableActionLabel"
            :source-table-action-title="sourceTableActionTitle"
            @select-view="(id) => emit('select-view', id)"
            @rename-view="(id, name) => emit('rename-view', id, name)"
            @delete-view="(id) => emit('delete-view', id)"
            @add-view="onToolbarAddView"
            @add-row="onAddRow"
            @link-existing="onLinkExisting"
            @open-source-table="onOpenSourceTable"
            @open-settings="onToolbarOpenSettings"
            @delete="emit('delete')" />

        <DatabaseViewSummaryBar
            v-if="showSummaryBar && activeView"
            :view="activeView"
            :schema="activeSchema"
            :editable="editable"
            :row-count="finalRows.length"
            @open-settings="onSummaryOpenSettings"
            @remove-filter="onRemoveFilterChip"
            @remove-sort="onRemoveSortChip"
            @remove-conditional-color="onRemoveConditionalColorChip"
            @save-as-new-view="onSaveAsNewView" />

        <DatabaseRowDraftBar
            v-if="bodyDraft"
            v-model="bodyDraft.title"
            :creating="bodyDraft.creating"
            :error="bodyDraft.error"
            :placeholder="bodyDraft.placeholder"
            :focus-token="bodyDraft.focusToken"
            @commit="commitBodyDraft"
            @cancel="cancelBodyDraft" />

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

        <DatabaseViewSettings
            v-if="settingsView"
            :model-value="true"
            :view="settingsView"
            :anchor-rect="settingsRequest?.anchorRect ?? null"
            :initial-section="settingsRequest?.section ?? null"
            @update:model-value="onSettingsModelValue"
            @change-source="onSettingsChangeSource"
            @change-type="onSettingsChangeType"
            @patch-layout="onSettingsPatchLayout"
            @patch-config="onSettingsPatchConfig" />
        <LinkExistingNoteModal
            v-if="activeDatabase"
            v-model="linkExistingOpen"
            :database-id="activeDatabase.id"
            :database-name="activeDatabase.title || 'Untitled database'"
            :exclude-note-ids="linkedNoteIds"
            @done="onLinkExistingDone" />
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
