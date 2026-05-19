<script setup lang="ts">
/**
 * GraphEdgeSourcesPanel — toggles for `GraphEdgeSourceSelection`.
 *
 * Reads (and patches) edge-source selection straight off
 * `useGraphQuery()`. When `allRelationProperties` is `false`, an
 * inline checklist of relation properties (gathered across every
 * loaded kind) is exposed so the user can pin a focused subset.
 *
 * Self-loading — reads the server-backed graph field catalogue so private,
 * kind/global and database-shared relation definitions all appear through
 * one source of truth.
 */
import { computed, inject, onMounted } from 'vue';
import type { FieldDescriptor, GraphEdgeSourceSelection } from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import UiSwitch from '@/components/ui/UiSwitch.vue';
import { GRAPH_QUERY_KEY } from '@/components/query/graphQueryInjection';
import { useFieldCatalog } from '@/composables/query/useFieldCatalog';

const injectedQuery = inject(GRAPH_QUERY_KEY);
if (!injectedQuery) {
    throw new Error('GraphEdgeSourcesPanel: GRAPH_QUERY_KEY not provided. Wrap inside <GraphView>.');
}
const query: NonNullable<typeof injectedQuery> = injectedQuery;
const fieldCatalog = useFieldCatalog();

const edgeSources = computed<GraphEdgeSourceSelection>(() => query.edgeSources.value);

function patch(partial: Partial<GraphEdgeSourceSelection>): void {
    query.edgeSources.value = { ...edgeSources.value, ...partial };
}

function setIncludeLinks(value: boolean): void {
    patch({ includeLinks: value });
}

function setAllRelationProperties(value: boolean): void {
    // When switching back to "all", clear the explicit allow-list so the
    // server falls through to the fast path on the next request.
    patch({
        allRelationProperties: value,
        relationPropertyKeys: value ? [] : edgeSources.value.relationPropertyKeys,
    });
}

// ───────── Relation-property catalog (every kind, every relation prop) ─────────
//
// Property identity in this layer is the canonical `key`: per-note
// definition clones share the same key, and we want a single pill per
// logical relation regardless of how many backing rows exist. The catalog
// therefore deduplicates by key while preserving a representative label.

interface RelationEntry {
    key: string;
    label: string;
    hint: string;
}

const relationProperties = computed<RelationEntry[]>(() => {
    const out = fieldCatalog.fields('graph')
        .filter((field): field is FieldDescriptor & { ref: { kind: 'property'; key: string } } => (
            field.ref.kind === 'property' && field.dataType === 'relation'
        ))
        .map((field) => ({ key: field.ref.key, label: field.label, hint: field.hint ?? 'Property' }));
    out.sort((a, b) => a.label.localeCompare(b.label));
    return out;
});

const selectedSet = computed<Set<string>>(() => new Set(edgeSources.value.relationPropertyKeys));

function togglePropertyKey(key: string): void {
    const next = new Set(selectedSet.value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    patch({ relationPropertyKeys: [...next] });
}

// ───────── Lazy-load every kind's properties on mount ─────────

onMounted(() => {
    void fieldCatalog.load('graph');
});
</script>

<template>
    <div class="edge-sources">
        <div class="edge-sources__row">
            <UiSwitch
                :model-value="edgeSources.includeLinks"
                label="Collegamenti diretti"
                @update:model-value="setIncludeLinks"
            />
        </div>

        <div class="edge-sources__row">
            <UiSwitch
                :model-value="edgeSources.allRelationProperties"
                label="Tutte le proprietà di relazione"
                @update:model-value="setAllRelationProperties"
            />
        </div>

        <div v-if="!edgeSources.allRelationProperties" class="edge-sources__list">
            <div class="edge-sources__list-label">Proprietà di relazione attive</div>
            <div v-if="relationProperties.length === 0" class="edge-sources__empty">
                Nessuna proprietà di relazione definita.
            </div>
            <button
                v-for="rel in relationProperties"
                :key="rel.key"
                type="button"
                class="edge-sources__pill"
                :class="{ 'is-on': selectedSet.has(rel.key) }"
                @click="togglePropertyKey(rel.key)"
            >
                <Icon
                    v-if="selectedSet.has(rel.key)"
                    name="check"
                    :size="11"
                    class="edge-sources__pill-icon"
                />
                <span class="edge-sources__pill-label">{{ rel.label }}</span>
                <span class="edge-sources__pill-kind">{{ rel.hint }}</span>
            </button>
        </div>
    </div>
</template>

<style scoped>
.edge-sources {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.edge-sources__row {
    display: flex;
    align-items: center;
}

.edge-sources__list {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding: var(--space-2);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
}

.edge-sources__list-label {
    width: 100%;
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    margin-bottom: var(--space-1);
}

.edge-sources__empty {
    width: 100%;
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    padding: var(--space-1);
}

.edge-sources__pill {
    appearance: none;
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-3);
    border: var(--border-width-1) solid var(--border);
    background: var(--surface-1);
    border-radius: var(--radius-sm);
    color: var(--fg-muted);
    font: inherit;
    font-size: var(--text-xs);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.edge-sources__pill:hover {
    border-color: var(--border-strong);
    color: var(--fg);
}

.edge-sources__pill.is-on {
    background: var(--accent-soft, var(--bg-elev));
    color: var(--accent, var(--fg));
    border-color: transparent;
}

.edge-sources__pill-icon {
    flex-shrink: 0;
}

.edge-sources__pill-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 140px;
}

.edge-sources__pill-kind {
    color: var(--fg-subtle);
    font-size: 10px;
}
</style>
