<script setup lang="ts">
/**
 * Mid-left filters panel — three-tab shell:
 *   - **Dati** (`GraphDataPanel`)   structured filter tree + edge sources
 *   - **Stile** (`GraphEncodingPanel`) property-driven visual encodings
 *   - **Fisica** (this file)        sliders/toggles for layout / forces
 *   - **Preset** (`GraphFilterPresetsPanel`) saved filter configurations
 *
 * The `Fisica` tab keeps the existing `GraphFilters` contract intact while
 * using the shared `UiSwitch` primitive. Query/style/preset tabs read the
 * canonical graph singletons provided by `GraphView`.
 */
import { onMounted, ref, watch } from 'vue';
import { Icon, UiSegmented, UiSwitch } from '@/components/ui';
import FilterSlider from '@/components/graph/FilterSlider.vue';
import GraphDataPanel from '@/components/graph/GraphDataPanel.vue';
import GraphEncodingPanel from '@/components/graph/GraphEncodingPanel.vue';
import GraphFilterPresetsPanel from '@/components/graph/GraphFilterPresetsPanel.vue';
import type { GraphFilters } from '@/composables/graph/useGraphFilters';
import { STORAGE_KEYS } from '@/lib/storageKeys';

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

// ───────── Tab persistence ─────────

type TabId = 'data' | 'style' | 'physics' | 'presets';

const TAB_OPTIONS: ReadonlyArray<{ label: string; value: TabId }> = [
    { label: 'Dati', value: 'data' },
    { label: 'Stile', value: 'style' },
    { label: 'Fisica', value: 'physics' },
    { label: 'Preset', value: 'presets' },
];

const TAB_STORAGE_KEY = STORAGE_KEYS.graphFiltersPanelTab;

const activeTab = ref<TabId>('data');

function isTabId(v: string): v is TabId {
    return v === 'data' || v === 'style' || v === 'physics' || v === 'presets';
}

onMounted(() => {
    try {
        const raw = window.localStorage.getItem(TAB_STORAGE_KEY);
        if (raw && isTabId(raw)) activeTab.value = raw;
    } catch {
        // Storage may be unavailable (private mode, embedded contexts) —
        // silently fall through to the default tab.
    }
});

watch(activeTab, (next) => {
    try {
        window.localStorage.setItem(TAB_STORAGE_KEY, next);
    } catch {
        // Same rationale as the read above; persistence is best-effort.
    }
});

function onTabChange(value: string): void {
    if (isTabId(value)) activeTab.value = value;
}

function onSearchInput(event: Event): void {
    emit('update:search-query', (event.target as HTMLInputElement).value);
}
</script>

<template>
    <aside class="panel filters-panel" @click.stop>
        <header class="filters-head">
            <Icon name="chevron-down" :size="12" class="filters-caret" />
            <span class="filters-title">Filtri</span>
            <button type="button" class="filters-icon-btn" title="Ripristina filtri" aria-label="Ripristina filtri grafo"
                @click="emit('reset')">
                <Icon name="refresh" size="14" />
            </button>
            <button type="button" class="filters-icon-btn" title="Chiudi pannello" aria-label="Chiudi pannello filtri"
                @click="emit('close')">
                <Icon name="close" size="14" />
            </button>
        </header>

        <div class="filters-tabs">
            <UiSegmented :model-value="activeTab" :options="[...TAB_OPTIONS]" size="sm" fill
                @update:model-value="onTabChange" />
        </div>

        <div class="filters-body">
            <!-- ───── Tab: Dati ───── -->
            <GraphDataPanel v-if="activeTab === 'data'" />

            <!-- ───── Tab: Stile ───── -->
            <GraphEncodingPanel v-else-if="activeTab === 'style'" />

            <!-- ───── Tab: Preset ───── -->
            <GraphFilterPresetsPanel
                v-else-if="activeTab === 'presets'"
                :filters="modelValue"
                :search-query="searchQuery"
                @update:filters="emit('update:model-value', $event)"
                @update:search-query="emit('update:search-query', $event)"
            />

            <!-- ───── Tab: Fisica ───── -->
            <template v-else>
                <div class="filters-search">
                    <Icon name="search" size="14" />
                    <input :value="searchQuery" class="filters-search-input" placeholder="Cerca file…"
                        @input="onSearchInput" />
                </div>

                <UiSwitch label="Orfani (nodi senza collegamenti)" label-position="start" block
                    :model-value="!modelValue.hideOrphans"
                    @update:model-value="update('hideOrphans', !$event)" />
                <UiSwitch label="Mostra colori categorie" label-position="start" block
                    :model-value="!modelValue.monochrome"
                    @update:model-value="update('monochrome', !$event)" />

                <details class="filters-section" open>
                    <summary>
                        <Icon name="chevron-down" :size="12" class="filters-caret" />
                        <span>Aspetto</span>
                    </summary>
                    <div class="filters-section-body">
                        <UiSwitch label="Frecce" label-position="start" block :model-value="modelValue.arrows"
                            @update:model-value="update('arrows', $event)" />
                        <UiSwitch label="Nomi nodi" label-position="start" block
                            :model-value="modelValue.showNodeLabels"
                            @update:model-value="update('showNodeLabels', $event)" />
                        <UiSwitch label="Icone categorie" label-position="start" block
                            :model-value="modelValue.showNodeIcons"
                            @update:model-value="update('showNodeIcons', $event)" />
                        <UiSwitch label="Nodi solidi" label-position="start" block :model-value="modelValue.solidNodes"
                            @update:model-value="update('solidNodes', $event)" />
                        <UiSwitch label="LOD adattivo" label-position="start" block :model-value="modelValue.lodEnabled"
                            @update:model-value="update('lodEnabled', $event)" />
                        <FilterSlider label="Soglia dissolvenza testo" :model-value="modelValue.labelFadeThreshold"
                            :min="0" :max="1" :step="0.01"
                            @update:model-value="update('labelFadeThreshold', $event)" />
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
                        <FilterSlider label="Forza di centratura" :model-value="modelValue.centerForce" :min="0"
                            :max="0.5" :step="0.005" :format="(v) => v.toFixed(3)"
                            @update:model-value="update('centerForce', $event)" />
                        <FilterSlider label="Forza di repulsione" :model-value="modelValue.repelForce" :min="-2000"
                            :max="-10" :step="10" :format="(v) => Math.round(v).toString()"
                            @update:model-value="update('repelForce', $event)" />
                        <FilterSlider label="Forza collegamenti" :model-value="modelValue.linkForce" :min="0" :max="2"
                            :step="0.05" :format="(v) => v.toFixed(2)"
                            @update:model-value="update('linkForce', $event)" />
                        <FilterSlider label="Distanza collegamenti" :model-value="modelValue.linkDistance" :min="30"
                            :max="500" :step="5" :format="(v) => Math.round(v).toString()"
                            @update:model-value="update('linkDistance', $event)" />
                    </div>
                </details>
            </template>
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
    width: clamp(360px, 30vw, 440px);
    max-width: calc(100vw - (var(--space-5) * 2));
    max-height: calc(100dvh - 160px);
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
    flex-shrink: 0;
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

.filters-tabs {
    display: flex;
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width-1) solid var(--border);
    background: color-mix(in srgb, var(--surface-1) 92%, transparent);
    flex-shrink: 0;
}

.filters-tabs > :deep(.ui-seg) {
    width: 100%;
    --ui-seg-h: 30px;
}

.filters-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    min-height: 0;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-gutter: stable;
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

@media (max-width: 520px) {
    .filters-panel {
        left: var(--space-3);
        right: var(--space-3);
        width: auto;
        max-width: none;
    }
}
</style>
