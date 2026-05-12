<script setup lang="ts">
/**
 * Mid-left "Filtri" panel — Obsidian-style sliders + toggles for
 * filters, appearance and forces. The parent owns persistence; this
 * component is bound via v-model to the reactive filters object and
 * the search query.
 *
 * Persistence uses STORAGE_KEYS.graphFilters (R-26).
 */
import { Icon } from '@/components/ui';
import FilterSlider from '@/components/graph/FilterSlider.vue';
import FilterToggle from '@/components/graph/FilterToggle.vue';
import type { GraphFilters } from '@/composables/graph/useGraphFilters';

interface Props {
    modelValue: GraphFilters;
    searchQuery: string;
}
const props = defineProps<Props>();

const emit = defineEmits<{
    'update:model-value': [filters: GraphFilters];
    'update:search-query': [value: string];
    reset: [];
    close: [];
    /** Re-run the layout (Aspetto → Animazione button). */
    'rerun-layout': [];
}>();

function update<K extends keyof GraphFilters>(key: K, value: GraphFilters[K]): void {
    emit('update:model-value', { ...props.modelValue, [key]: value });
}
</script>

<template>
    <aside class="panel filters-panel" @click.stop>
        <header class="filters-head">
            <Icon name="chevron-down" :size="12" class="filters-caret" />
            <span class="filters-title">Filtri</span>
            <button type="button" class="filters-icon-btn" title="Reset to defaults" aria-label="Reset graph filters"
                @click="emit('reset')">
                <Icon name="refresh" size="14" />
            </button>
            <button type="button" class="filters-icon-btn" title="Close panel" aria-label="Close filters panel"
                @click="emit('close')">
                <Icon name="close" size="14" />
            </button>
        </header>

        <div class="filters-body">
            <div class="filters-search">
                <Icon name="search" size="14" />
                <input :value="searchQuery" class="filters-search-input" placeholder="Cerca file…"
                    @input="emit('update:search-query', ($event.target as HTMLInputElement).value)" />
            </div>

            <FilterToggle label="Orfani (nodi senza collegamenti)" :model-value="!modelValue.hideOrphans"
                @update:model-value="update('hideOrphans', !$event)" />
            <FilterToggle label="Mostra colori categorie" :model-value="!modelValue.monochrome"
                @update:model-value="update('monochrome', !$event)" />

            <details class="filters-section" open>
                <summary>
                    <Icon name="chevron-down" :size="12" class="filters-caret" />
                    <span>Aspetto</span>
                </summary>
                <div class="filters-section-body">
                    <FilterToggle label="Frecce" :model-value="modelValue.arrows"
                        @update:model-value="update('arrows', $event)" />
                    <FilterToggle label="Nomi nodi" :model-value="modelValue.showNodeLabels"
                        @update:model-value="update('showNodeLabels', $event)" />
                    <FilterToggle label="Icone categorie" :model-value="modelValue.showNodeIcons"
                        @update:model-value="update('showNodeIcons', $event)" />
                    <FilterToggle label="Nodi solidi" :model-value="modelValue.solidNodes"
                        @update:model-value="update('solidNodes', $event)" />
                    <FilterToggle label="LOD adattivo" :model-value="modelValue.lodEnabled"
                        @update:model-value="update('lodEnabled', $event)" />
                    <FilterSlider label="Soglia dissolvenza testo" :model-value="modelValue.labelFadeThreshold" :min="0"
                        :max="1" :step="0.01" @update:model-value="update('labelFadeThreshold', $event)" />
                    <FilterSlider label="Dimensione nodo" :model-value="modelValue.nodeSizeMultiplier" :min="0.3"
                        :max="3" :step="0.05" :format="(v) => `${v.toFixed(2)}×`"
                        @update:model-value="update('nodeSizeMultiplier', $event)" />
                    <FilterSlider label="Spessore linea" :model-value="modelValue.edgeSizeMultiplier" :min="0.3"
                        :max="4" :step="0.05" :format="(v) => `${v.toFixed(2)}×`"
                        @update:model-value="update('edgeSizeMultiplier', $event)" />
                    <button type="button" class="filters-action-btn" @click="emit('rerun-layout')">
                        Animazione
                    </button>
                </div>
            </details>

            <details class="filters-section" open>
                <summary>
                    <Icon name="chevron-down" :size="12" class="filters-caret" />
                    <span>Forze</span>
                </summary>
                <div class="filters-section-body">
                    <FilterSlider label="Forza di centratura" :model-value="modelValue.centerForce" :min="0" :max="0.5"
                        :step="0.005" :format="(v) => v.toFixed(3)"
                        @update:model-value="update('centerForce', $event)" />
                    <FilterSlider label="Forza di repulsione" :model-value="modelValue.repelForce" :min="-2000"
                        :max="-10" :step="10" :format="(v) => Math.round(v).toString()"
                        @update:model-value="update('repelForce', $event)" />
                    <FilterSlider label="Forza collegamenti" :model-value="modelValue.linkForce" :min="0" :max="2"
                        :step="0.05" :format="(v) => v.toFixed(2)" @update:model-value="update('linkForce', $event)" />
                    <FilterSlider label="Distanza collegamenti" :model-value="modelValue.linkDistance" :min="30"
                        :max="500" :step="5" :format="(v) => Math.round(v).toString()"
                        @update:model-value="update('linkDistance', $event)" />
                </div>
            </details>
        </div>
    </aside>
</template>

<style scoped>
.panel {
    background: color-mix(in srgb, var(--surface-1) 94%, transparent);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    color: var(--fg);
    z-index: var(--z-raised);
}

.filters-panel {
    position: absolute;
    top: calc(var(--space-5) + 64px);
    left: var(--space-5);
    width: 280px;
    max-height: calc(100vh - 160px);
    display: flex;
    flex-direction: column;
    padding: 0;
    overflow: hidden;
    box-shadow: var(--shadow-lg);
}

.filters-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-3);
    border-bottom: var(--border-width-1) solid var(--border);
    background: var(--surface-1);
}

.filters-title {
    flex: 1;
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--fg-strong);
}

.filters-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.filters-icon-btn:hover {
    background: var(--surface-hover);
    color: var(--fg);
}

.filters-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    overflow-y: auto;
}

.filters-search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    color: var(--fg-muted);
}

.filters-search:focus-within {
    border-color: var(--accent-border);
    background: var(--surface-1);
}

.filters-search-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--fg);
    font-size: var(--text-sm);
    min-width: 0;
}

.filters-section {
    border-top: var(--border-width-1) solid var(--border);
    padding-top: var(--space-3);
}

.filters-section>summary {
    list-style: none;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--fg-muted);
    user-select: none;
    padding-bottom: var(--space-2);
}

.filters-section>summary::-webkit-details-marker {
    display: none;
}

.filters-section[open]>summary .filters-caret {
    transform: rotate(0deg);
}

.filters-section:not([open])>summary .filters-caret {
    transform: rotate(-90deg);
}

.filters-caret {
    transition: transform var(--duration-fast) var(--ease-standard);
}

.filters-section-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.filters-action-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--accent);
    color: var(--fg-on-accent);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.filters-action-btn:hover {
    background: var(--accent-hover-color);
}

.filters-pop-enter-active,
.filters-pop-leave-active {
    transition: opacity var(--duration-base) var(--ease-standard),
        transform var(--duration-base) var(--ease-standard);
}

.filters-pop-enter-from,
.filters-pop-leave-to {
    opacity: 0;
    transform: translateX(-12px);
}
</style>
