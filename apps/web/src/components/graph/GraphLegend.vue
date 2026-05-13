<script setup lang="ts">
/**
 * Top-right rail: stats pill, view mode pill, search-match counter,
 * legend popover (per-kind visibility toggles) and the "Hidden"
 * filter chips strip.
 *
 * Owns the legend popover open state via v-model:open.
 */
import { computed, inject, onMounted } from 'vue';
import { Icon, UiChip } from '@/components/ui';
import { fieldRefKey, type FieldRef, type KindDefinition } from '@continuum/shared';
import { GRAPH_PROPERTY_ENCODINGS_KEY } from '@/components/query/graphQueryInjection';
import { useFieldCatalog } from '@/composables/query/useFieldCatalog';
import type { ViewMode } from '@/composables/graph/useGraphPreferences';

interface Props {
    viewMode: ViewMode;
    viewLabel: string;
    visibleStats: { nodes: number; edges: number };
    trimmedSearchQuery: string;
    matchCount: number;
    hasGraphFilters: boolean;
    legendOpen: boolean;
    kinds: KindDefinition[];
    hiddenKinds: Set<string>;
    activeFilters: KindDefinition[];
}
const props = defineProps<Props>();

const emit = defineEmits<{
    'clear-filters': [];
    'update:legend-open': [open: boolean];
    'toggle-kind': [id: string];
    'show-all-kinds': [];
}>();

const hiddenCount = computed(() => props.hiddenKinds.size);
const encodings = inject(GRAPH_PROPERTY_ENCODINGS_KEY, null);
const catalog = useFieldCatalog();

onMounted(() => {
    void catalog.load('graph');
});

function fieldLabel(ref: FieldRef | null | undefined, fallback: string): string {
    if (!ref) return fallback;
    return catalog.fieldByKey('graph', fieldRefKey(ref))?.label ?? 'Campo salvato';
}

const styleRows = computed(() => {
    const active = encodings?.encodings.value ?? { color: null, size: null, badge: null };
    return [
        {
            id: 'color',
            icon: 'palette',
            label: 'Colore',
            value: fieldLabel(active.color, 'Tipo nodo'),
        },
        {
            id: 'size',
            icon: 'circle',
            label: 'Dimensione',
            value: fieldLabel(active.size, 'Uniforme'),
        },
        {
            id: 'badge',
            icon: 'sparkles',
            label: 'Badge',
            value: fieldLabel(active.badge, 'Nessuno'),
        },
    ];
});
</script>

<template>
    <div class="right-rail">
        <div class="panel stats-row" @click.stop>
            <span class="view-pill">
                <Icon :name="viewMode === '3d' ? 'cube' : 'grid'" :size="12" />
                {{ viewLabel }}
            </span>
            <span class="stats-pill">
                {{ visibleStats.nodes }} nodes · {{ visibleStats.edges }} edges
            </span>
            <span v-if="trimmedSearchQuery" class="search-pill">
                {{ matchCount }} matches
            </span>
            <button v-if="hasGraphFilters" type="button" class="clear-filters-btn" @click="emit('clear-filters')">
                Reset
            </button>
            <button class="legend-btn" :class="{ open: legendOpen }"
                @click.stop="emit('update:legend-open', !legendOpen)">
                <span>Legenda</span>
                <Icon :name="legendOpen ? 'chevron-down' : 'chevron-right'" :size="14" class="chev" />
            </button>
        </div>
        <transition name="rail-pop">
            <div v-if="legendOpen" class="panel legend-pop" @click.stop>
                <div class="legend-section">
                    <div class="legend-head">
                        <span>Tipi nodo</span>
                        <button v-if="hiddenCount" class="legend-reset" @click="emit('show-all-kinds')">
                            Mostra tutti
                        </button>
                    </div>
                    <div class="legend-body">
                        <button v-for="k in kinds" :key="k.id" class="legend-row" :class="{ off: hiddenKinds.has(k.id) }"
                            @click="emit('toggle-kind', k.id)">
                            <span class="dot" :style="{ background: k.color }" />
                            <span>{{ k.label }}</span>
                            <Icon :name="hiddenKinds.has(k.id) ? 'eye-off' : 'eye'" size="14" />
                        </button>
                    </div>
                </div>

                <div class="legend-section">
                    <div class="legend-head legend-head--plain">
                        <span>Collegamenti</span>
                    </div>
                    <div class="legend-body">
                        <div class="legend-row legend-row--static">
                            <span class="line-sample line-sample--direct" />
                            <span>Collegamento diretto</span>
                        </div>
                        <div class="legend-row legend-row--static">
                            <span class="line-sample line-sample--relation" />
                            <span>Proprietà di relazione</span>
                        </div>
                    </div>
                </div>

                <div class="legend-section">
                    <div class="legend-head legend-head--plain">
                        <span>Stile</span>
                    </div>
                    <div class="legend-body">
                        <div v-for="row in styleRows" :key="row.id" class="legend-row legend-row--static">
                            <Icon :name="row.icon" size="14" class="style-icon" />
                            <span>{{ row.label }}</span>
                            <span class="style-value">{{ row.value }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </transition>
        <div v-if="activeFilters.length" class="panel filter-chips" @click.stop>
            <div class="chips-head">
                <Icon name="filter" size="12" />
                <span>Nascosti</span>
                <button class="chip-clear" @click="emit('show-all-kinds')">Pulisci</button>
            </div>
            <div class="chips-body">
                <UiChip v-for="k in activeFilters" :key="k.id" closable @close="emit('toggle-kind', k.id)">
                    {{ k.label }}
                </UiChip>
            </div>
        </div>
    </div>
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

.right-rail {
    position: absolute;
    top: var(--space-5);
    right: var(--space-5);
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
    z-index: var(--z-raised);
    max-width: min(360px, calc(100vw - 2 * var(--space-5)));
}

.right-rail .panel {
    position: static;
    width: 100%;
}

.stats-row {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: nowrap;
    gap: var(--space-2);
    padding: var(--space-2);
}

.view-pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 28px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-selected);
    color: var(--fg-strong);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
}

.stats-pill {
    font-size: var(--text-sm);
    color: var(--fg-muted);
    white-space: nowrap;
    padding: 0 var(--space-2);
}

.search-pill,
.clear-filters-btn {
    display: inline-flex;
    align-items: center;
    height: 28px;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    white-space: nowrap;
}

.search-pill {
    padding: 0 var(--space-3);
    background: var(--accent-soft);
    color: var(--accent-hover-color);
    font-weight: var(--font-weight-medium);
}

.clear-filters-btn {
    padding: 0 var(--space-3);
    border: var(--border-width-1) solid var(--border);
    background: transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.clear-filters-btn:hover {
    background: var(--surface-hover);
    border-color: var(--border-strong);
    color: var(--fg);
}

.legend-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: transparent;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    height: 28px;
    padding: 0 var(--space-3);
    font-size: var(--text-sm);
    color: var(--fg);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.legend-btn:hover,
.legend-btn.open {
    background: var(--surface-hover);
    border-color: var(--border-strong);
}

.chev {
    font-size: var(--text-2xs);
    color: var(--fg-muted);
}

.legend-pop {
    padding: var(--space-3);
    box-shadow: var(--shadow-lg);
    max-height: min(560px, calc(100dvh - 96px));
    overflow-y: auto;
}

.legend-section + .legend-section {
    margin-top: var(--space-3);
}

.legend-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2) var(--space-3) var(--space-3);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--fg-muted);
    border-bottom: var(--border-width-1) solid var(--border);
    margin-bottom: var(--space-2);
}

.legend-head--plain {
    padding-top: var(--space-1);
}

.legend-reset {
    background: transparent;
    border: none;
    color: var(--accent);
    font-size: var(--text-xs);
    text-transform: none;
    letter-spacing: 0;
    cursor: pointer;
    padding: 0;
}

.legend-reset:hover {
    color: var(--accent-strong);
}

.legend-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}

.legend-row {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    font-size: var(--text-base);
    background: transparent;
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    text-align: left;
    text-transform: capitalize;
    cursor: pointer;
    color: var(--fg);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.legend-row>span:nth-child(2) {
    flex: 1;
}

.legend-row--static {
    cursor: default;
    text-transform: none;
}

.legend-row:hover {
    background: var(--bg-soft);
}

.legend-row--static:hover {
    background: transparent;
}

.legend-row.off {
    opacity: 0.5;
}

.filter-chips {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) var(--space-4);
    box-shadow: var(--shadow-md);
}

.chips-head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--fg-muted);
}

.chips-head>span {
    flex: 1;
}

.chips-body {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
}

.chip-clear {
    background: transparent;
    border: none;
    font-size: var(--text-xs);
    color: var(--accent);
    cursor: pointer;
    padding: 0;
    text-transform: none;
    letter-spacing: 0;
}

.chip-clear:hover {
    color: var(--accent-strong);
}

.dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-circle);
    display: inline-block;
    flex-shrink: 0;
}

.line-sample {
    width: 28px;
    height: 0;
    border-top-style: solid;
    border-radius: var(--radius-pill);
    flex-shrink: 0;
}

.line-sample--direct {
    border-top-width: 3px;
    border-color: var(--accent, #e8dcc8);
    box-shadow: 0 0 10px color-mix(in srgb, var(--accent) 24%, transparent);
}

.line-sample--relation {
    border-top-width: 1.5px;
    border-color: var(--graph-edge, rgba(160, 155, 144, 0.5));
    opacity: 0.7;
}

.style-icon {
    color: var(--fg-muted);
    flex-shrink: 0;
}

.style-value {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    min-width: 0;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* Pop-in transition for the legend dropdown */
.rail-pop-enter-from,
.rail-pop-leave-to {
    opacity: 0;
    transform: translateY(-4px);
}

.rail-pop-enter-active,
.rail-pop-leave-active {
    transition:
        opacity var(--duration-base) var(--ease-standard),
        transform var(--duration-base) var(--ease-standard);
}

@media (max-width: 1100px) {
    .right-rail {
        top: calc(var(--space-5) + 96px);
    }
}

@media (max-width: 720px) {
    .right-rail {
        top: calc(var(--space-3) + 142px);
        left: var(--space-3);
        right: var(--space-3);
        max-width: none;
        align-items: stretch;
    }

    .stats-row {
        justify-content: flex-start;
        flex-wrap: wrap;
    }
}
</style>
