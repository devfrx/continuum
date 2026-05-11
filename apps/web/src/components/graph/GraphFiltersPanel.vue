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

            <label class="filters-row">
                <span class="filters-row-label">Orfani (nodi senza collegamenti)</span>
                <input type="checkbox" class="filters-toggle" :checked="!modelValue.hideOrphans"
                    @change="update('hideOrphans', !($event.target as HTMLInputElement).checked)" />
            </label>

            <label class="filters-row">
                <span class="filters-row-label">Mostra colori categorie</span>
                <input type="checkbox" class="filters-toggle" :checked="!modelValue.monochrome"
                    @change="update('monochrome', !($event.target as HTMLInputElement).checked)" />
            </label>

            <details class="filters-section" open>
                <summary>
                    <Icon name="chevron-down" :size="12" class="filters-caret" />
                    <span>Aspetto</span>
                </summary>
                <div class="filters-section-body">
                    <label class="filters-row">
                        <span class="filters-row-label">Frecce</span>
                        <input type="checkbox" class="filters-toggle" :checked="modelValue.arrows"
                            @change="update('arrows', ($event.target as HTMLInputElement).checked)" />
                    </label>
                    <label class="filters-row">
                        <span class="filters-row-label">Nodi solidi</span>
                        <input type="checkbox" class="filters-toggle" :checked="modelValue.solidNodes"
                            @change="update('solidNodes', ($event.target as HTMLInputElement).checked)" />
                    </label>
                    <label class="filters-row">
                        <span class="filters-row-label">LOD adattivo</span>
                        <input type="checkbox" class="filters-toggle" :checked="modelValue.lodEnabled"
                            @change="update('lodEnabled', ($event.target as HTMLInputElement).checked)" />
                    </label>
                    <div class="filters-slider">
                        <span class="filters-row-label">Soglia dissolvenza testo</span>
                        <input type="range" min="0" max="1" step="0.01" :value="modelValue.labelFadeThreshold"
                            @input="update('labelFadeThreshold', Number(($event.target as HTMLInputElement).value))" />
                    </div>
                    <div class="filters-slider">
                        <span class="filters-row-label">Dimensione nodo</span>
                        <input type="range" min="0.3" max="3" step="0.05" :value="modelValue.nodeSizeMultiplier"
                            @input="update('nodeSizeMultiplier', Number(($event.target as HTMLInputElement).value))" />
                    </div>
                    <div class="filters-slider">
                        <span class="filters-row-label">Spessore linea</span>
                        <input type="range" min="0.3" max="4" step="0.05" :value="modelValue.edgeSizeMultiplier"
                            @input="update('edgeSizeMultiplier', Number(($event.target as HTMLInputElement).value))" />
                    </div>
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
                    <div class="filters-slider">
                        <span class="filters-row-label">Forza di centratura</span>
                        <input type="range" min="0" max="0.5" step="0.005" :value="modelValue.centerForce"
                            @input="update('centerForce', Number(($event.target as HTMLInputElement).value))" />
                    </div>
                    <div class="filters-slider">
                        <span class="filters-row-label">Forza di repulsione</span>
                        <input type="range" min="-2000" max="-10" step="10" :value="modelValue.repelForce"
                            @input="update('repelForce', Number(($event.target as HTMLInputElement).value))" />
                    </div>
                    <div class="filters-slider">
                        <span class="filters-row-label">Forza collegamenti</span>
                        <input type="range" min="0" max="2" step="0.05" :value="modelValue.linkForce"
                            @input="update('linkForce', Number(($event.target as HTMLInputElement).value))" />
                    </div>
                    <div class="filters-slider">
                        <span class="filters-row-label">Distanza collegamenti</span>
                        <input type="range" min="30" max="500" step="5" :value="modelValue.linkDistance"
                            @input="update('linkDistance', Number(($event.target as HTMLInputElement).value))" />
                    </div>
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

.filters-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    font-size: var(--text-sm);
    color: var(--fg);
    cursor: pointer;
    padding: var(--space-1) 0;
}

.filters-row-label {
    flex: 1;
    color: var(--fg-muted);
}

.filters-toggle {
    appearance: none;
    width: 32px;
    height: 18px;
    border-radius: 999px;
    background: var(--surface-3, #404040);
    position: relative;
    cursor: pointer;
    outline: none;
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.filters-toggle::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #f5f5f5;
    transition: transform var(--duration-fast) var(--ease-standard);
}

.filters-toggle:checked {
    background: var(--accent);
}

.filters-toggle:checked::after {
    transform: translateX(14px);
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

.filters-slider {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.filters-slider input[type="range"] {
    appearance: none;
    width: 100%;
    height: 4px;
    border-radius: 999px;
    background: var(--surface-3, #404040);
    outline: none;
    cursor: pointer;
}

.filters-slider input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #f5f5f5;
    border: 2px solid var(--accent);
    cursor: pointer;
}

.filters-slider input[type="range"]::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: #f5f5f5;
    border: 2px solid var(--accent);
    cursor: pointer;
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
