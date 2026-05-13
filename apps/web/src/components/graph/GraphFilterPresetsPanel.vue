<script setup lang="ts">
/**
 * GraphFilterPresetsPanel — saved presets for the full graph filter surface.
 *
 * The component captures and restores the same canonical state owners used by
 * the other filter tabs: `useGraphQuery`, `useGraphPropertyEncodings` and the
 * physical/display filters passed down from `GraphView`.
 */
import { computed, inject, ref } from 'vue';
import { isFilterGroup, type FilterGroup, type FilterNode } from '@continuum/shared';
import { GRAPH_PROPERTY_ENCODINGS_KEY, GRAPH_QUERY_KEY } from '@/components/query/graphQueryInjection';
import { Icon, UiButton, UiEmpty, UiInput } from '@/components/ui';
import {
    GRAPH_FILTERS_DEFAULTS,
    type GraphFilters,
} from '@/composables/graph/useGraphFilters';
import {
    cloneGraphFilterPresetPayload,
    useGraphFilterPresets,
    type GraphFilterPreset,
    type GraphFilterPresetPayload,
} from '@/composables/graph/useGraphFilterPresets';

interface Props {
    filters: GraphFilters;
    searchQuery: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    'update:filters': [filters: GraphFilters];
    'update:search-query': [value: string];
}>();

const injectedQuery = inject(GRAPH_QUERY_KEY);
if (!injectedQuery) {
    throw new Error('GraphFilterPresetsPanel: GRAPH_QUERY_KEY not provided. Wrap inside <GraphView>.');
}
const query: NonNullable<typeof injectedQuery> = injectedQuery;

const injectedEncodings = inject(GRAPH_PROPERTY_ENCODINGS_KEY);
if (!injectedEncodings) {
    throw new Error(
        'GraphFilterPresetsPanel: GRAPH_PROPERTY_ENCODINGS_KEY not provided. Wrap inside <GraphView>.',
    );
}
const encodings: NonNullable<typeof injectedEncodings> = injectedEncodings;

const presets = useGraphFilterPresets();
const savedPresets = presets.presets;
const draftName = ref('');
const selectedPresetId = ref<string | null>(null);

const canSave = computed<boolean>(() => draftName.value.trim().length > 0);

function cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function countConditions(node: FilterNode): number {
    if (!isFilterGroup(node)) return 1;
    return node.children.reduce((total, child) => total + countConditions(child), 0);
}

function customPhysicsCount(filters: GraphFilters): number {
    let total = 0;
    for (const key of Object.keys(GRAPH_FILTERS_DEFAULTS) as Array<keyof GraphFilters>) {
        if (filters[key] !== GRAPH_FILTERS_DEFAULTS[key]) total += 1;
    }
    return total;
}

function encodingCount(payload: GraphFilterPresetPayload): number {
    return [payload.encodings.color, payload.encodings.size, payload.encodings.badge]
        .filter((value) => value !== null).length;
}

function edgeSourceLabel(payload: GraphFilterPresetPayload): string {
    const edgeSources = payload.edgeSources;
    const hasRelationSubset = edgeSources.relationPropertyIds.length > 0;
    if (edgeSources.includeLinks && edgeSources.allRelationProperties) return 'Link + relazioni';
    if (edgeSources.includeLinks && hasRelationSubset) return 'Link + selezione';
    if (edgeSources.includeLinks) return 'Solo link';
    if (edgeSources.allRelationProperties || hasRelationSubset) return 'Solo relazioni';
    return 'Nessun link';
}

function formatUpdated(timestamp: number): string {
    return new Intl.DateTimeFormat('it-IT', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    }).format(timestamp);
}

function capturePayload(): GraphFilterPresetPayload {
    return {
        filterRoot: cloneJson(query.filter.root.value) as FilterGroup,
        edgeSources: {
            ...query.edgeSources.value,
            relationPropertyIds: query.edgeSources.value.relationPropertyIds.slice(),
        },
        encodings: cloneJson(encodings.encodings.value),
        filters: { ...props.filters },
        searchQuery: props.searchQuery,
    };
}

function createPreset(): void {
    if (!canSave.value) return;
    const preset = presets.createPreset(draftName.value, capturePayload());
    if (!preset) return;
    selectedPresetId.value = preset.id;
    draftName.value = '';
}

function applyPreset(preset: GraphFilterPreset): void {
    const payload = cloneGraphFilterPresetPayload(preset.payload);
    query.filter.replace(payload.filterRoot);
    query.edgeSources.value = payload.edgeSources;
    encodings.encodings.value = payload.encodings;
    emit('update:filters', payload.filters);
    emit('update:search-query', payload.searchQuery);
    selectedPresetId.value = preset.id;
}

function updatePreset(preset: GraphFilterPreset): void {
    const updated = presets.updatePreset(preset.id, capturePayload());
    if (updated) selectedPresetId.value = updated.id;
}

function removePreset(preset: GraphFilterPreset): void {
    presets.removePreset(preset.id);
    if (selectedPresetId.value === preset.id) selectedPresetId.value = null;
}
</script>

<template>
    <div class="preset-panel">
        <div class="preset-panel__head">
            <span class="preset-panel__title">Preimpostazioni</span>
        </div>

        <div class="preset-create">
            <UiInput
                v-model="draftName"
                size="sm"
                placeholder="Nome preset"
                @keydown.enter.prevent="createPreset"
            />
            <UiButton variant="primary" size="sm" :disabled="!canSave" @click="createPreset">
                <template #icon-left>
                    <Icon name="save" :size="12" />
                </template>
                Salva
            </UiButton>
        </div>

        <div v-if="savedPresets.length > 0" class="preset-list">
            <article
                v-for="preset in savedPresets"
                :key="preset.id"
                class="preset-row"
                :class="{ 'is-selected': selectedPresetId === preset.id }"
            >
                <div class="preset-row__main">
                    <div class="preset-row__head">
                        <strong class="preset-row__name">{{ preset.name }}</strong>
                        <span class="preset-row__date">{{ formatUpdated(preset.updatedAt) }}</span>
                    </div>
                    <div class="preset-row__meta">
                        <span class="preset-chip">
                            <Icon name="filter" :size="11" />
                            {{ countConditions(preset.payload.filterRoot) }} cond.
                        </span>
                        <span class="preset-chip">
                            <Icon name="connection" :size="11" />
                            {{ edgeSourceLabel(preset.payload) }}
                        </span>
                        <span v-if="encodingCount(preset.payload) > 0" class="preset-chip">
                            <Icon name="palette" :size="11" />
                            {{ encodingCount(preset.payload) }} stile
                        </span>
                        <span v-if="customPhysicsCount(preset.payload.filters) > 0" class="preset-chip">
                            <Icon name="activity" :size="11" />
                            Fisica
                        </span>
                        <span v-if="preset.payload.searchQuery.trim().length > 0" class="preset-chip">
                            <Icon name="search" :size="11" />
                            Ricerca
                        </span>
                    </div>
                </div>

                <div class="preset-row__actions">
                    <UiButton variant="subtle" size="sm" @click="applyPreset(preset)">
                        Applica
                    </UiButton>
                    <UiButton variant="ghost" size="sm" @click="updatePreset(preset)">
                        Aggiorna
                    </UiButton>
                    <button
                        type="button"
                        class="preset-row__icon-btn"
                        title="Elimina preset"
                        aria-label="Elimina preset"
                        @click="removePreset(preset)"
                    >
                        <Icon name="trash" :size="13" />
                    </button>
                </div>
            </article>
        </div>

        <UiEmpty v-else compact title="Nessun preset salvato">
            <template #icon>
                <Icon name="save" :size="18" />
            </template>
        </UiEmpty>
    </div>
</template>

<style scoped>
.preset-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.preset-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
}

.preset-panel__title {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--fg-muted);
    font-weight: var(--font-weight-semibold);
}

.preset-create {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-2);
    align-items: center;
}

.preset-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.preset-row {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.preset-row.is-selected {
    border-color: var(--accent-border);
    background: color-mix(in srgb, var(--accent) 8%, var(--surface-1));
}

.preset-row__main {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
}

.preset-row__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
}

.preset-row__name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--fg-strong);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
}

.preset-row__date {
    flex-shrink: 0;
    color: var(--fg-subtle);
    font-size: var(--text-xs);
}

.preset-row__meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
}

.preset-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    padding: 2px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    color: var(--fg-muted);
    font-size: var(--text-xs);
}

.preset-row__actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) 28px;
    gap: var(--space-2);
    align-items: center;
}

.preset-row__actions :deep(.ui-btn) {
    min-width: 0;
    padding-inline: var(--space-2);
}

.preset-row__icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg-subtle);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.preset-row__icon-btn:hover {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    color: var(--danger);
}
</style>
