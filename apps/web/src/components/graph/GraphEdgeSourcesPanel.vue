<script setup lang="ts">
/**
 * GraphEdgeSourcesPanel — toggles for `GraphEdgeSourceSelection`.
 *
 * Reads (and patches) edge-source selection straight off
 * `useGraphQuery()`. When `allRelationProperties` is `false`, an
 * inline checklist of relation properties (gathered across every
 * loaded kind) is exposed so the user can pin a focused subset.
 *
 * Self-loading — calls `useKinds().load()` and `useProperties().load()`
 * for every kind on mount because the relation list is derived from
 * cached property definitions.
 */
import { computed, inject, onMounted, watch } from 'vue';
import type { GraphEdgeSourceSelection, PropertyDefinition } from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import UiSwitch from '@/components/ui/UiSwitch.vue';
import { GRAPH_QUERY_KEY } from '@/components/query/graphQueryInjection';
import { useKinds } from '@/composables/useKinds';
import { useProperties } from '@/composables/useProperties';

const injectedQuery = inject(GRAPH_QUERY_KEY);
if (!injectedQuery) {
    throw new Error('GraphEdgeSourcesPanel: GRAPH_QUERY_KEY not provided. Wrap inside <GraphView>.');
}
const query: NonNullable<typeof injectedQuery> = injectedQuery;
const kinds = useKinds();
const properties = useProperties();

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
    kindLabels: string[];
}

const relationProperties = computed<RelationEntry[]>(() => {
    const byKey = new Map<string, RelationEntry>();
    for (const k of kinds.kinds.value) {
        const defs = properties.byKind.value.get(k.id) ?? [];
        for (const d of defs) {
            if (d.type !== 'relation') continue;
            const existing = byKey.get(d.key);
            if (existing) {
                if (!existing.kindLabels.includes(k.label)) existing.kindLabels.push(k.label);
            } else {
                byKey.set(d.key, { key: d.key, label: d.label, kindLabels: [k.label] });
            }
        }
    }
    const out = Array.from(byKey.values());
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

onMounted(async () => {
    await kinds.load();
    await Promise.all(kinds.kinds.value.map((k) => properties.load(k.id)));
});

// Track newly-loaded kinds (e.g. user creates one while panel is open).
watch(
    () => kinds.kinds.value.map((k) => k.id).join(','),
    async () => {
        await Promise.all(
            kinds.kinds.value.map((k) =>
                properties.loaded.value.has(k.id) ? Promise.resolve([] as PropertyDefinition[]) : properties.load(k.id),
            ),
        );
    },
);
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
                <span class="edge-sources__pill-kind">{{ rel.kindLabels.join(', ') }}</span>
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
