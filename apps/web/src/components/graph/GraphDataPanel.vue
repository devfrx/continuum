<script setup lang="ts">
/**
 * GraphDataPanel — top-level "Filtra dati" UI for the graph view.
 *
 * Hosts a recursive `FilterBuilder` rooted at `useGraphQuery().filter.root`
 * plus the embedded `GraphEdgeSourcesPanel` for choosing which edge
 * sources contribute to the response. All persistence lives in the
 * underlying composables — this shell just wires them up.
 */
import { computed, inject } from 'vue';
import {
    isFilterGroup,
    type FilterGroup,
} from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import UiButton from '@/components/ui/UiButton.vue';
import { GRAPH_QUERY_KEY } from '@/components/query/graphQueryInjection';
import FilterBuilder from '@/components/query/FilterBuilder.vue';
import GraphEdgeSourcesPanel from './GraphEdgeSourcesPanel.vue';

const injectedQuery = inject(GRAPH_QUERY_KEY);
if (!injectedQuery) {
    throw new Error('GraphDataPanel: GRAPH_QUERY_KEY not provided. Wrap inside <GraphView>.');
}
// Re-bind to a non-nullable const so vue-tsc narrows correctly across the
// `<script setup>` body and template references.
const query: NonNullable<typeof injectedQuery> = injectedQuery;

/**
 * Coerce the root to a `FilterGroup`. The shared contract guarantees the
 * root is always a group, but this guard keeps TS narrow for the template.
 */
const rootGroup = computed<FilterGroup>(() => {
    const root = query.filter.root.value;
    if (isFilterGroup(root)) return root;
    return { type: 'group', id: 'root', combinator: 'and', children: [root] };
});

function onUpdateRoot(next: FilterGroup): void {
    query.filter.replace(next);
}

function resetAll(): void {
    query.filter.reset();
    query.resetEdgeSources();
}
</script>

<template>
    <div class="data-panel">
        <div class="data-panel__head">
            <span class="data-panel__title">Filtra dati</span>
            <UiButton variant="ghost" size="sm" @click="resetAll">
                <template #icon-left>
                    <Icon name="refresh" :size="12" />
                </template>
                Reset
            </UiButton>
        </div>

        <FilterBuilder
            :node="rootGroup"
            :depth="0"
            surface="graph"
            @update:node="onUpdateRoot"
        />

        <div class="data-panel__divider" />

        <div class="data-panel__head">
            <span class="data-panel__title">Sorgenti collegamenti</span>
        </div>
        <GraphEdgeSourcesPanel />
    </div>
</template>

<style scoped>
.data-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.data-panel__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
}

.data-panel__title {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--fg-muted);
    font-weight: var(--font-weight-semibold);
}

.data-panel__divider {
    height: 1px;
    background: var(--border);
    margin: var(--space-2) 0;
}
</style>
