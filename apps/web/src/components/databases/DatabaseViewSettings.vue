<script setup lang="ts">
/**
 * DatabaseViewSettings.vue — Notion-style "View options" popover.
 *
 * Floating panel anchored to a toolbar tab. Renders a two-level menu
 * (catalogue → focused panel) sourced from `viewSettings/sections.ts`.
 * The shell stays thin: each section is its own component under
 * `viewSettings/` so panels can evolve in isolation.
 *
 * Sections wired today:
 *   - **Layout** — type picker + per-type layout knobs.
 *   - **Data source** — switch the datasource backing this view.
 *
 * Planned sections render `PlannedSectionPanel` so the catalogue
 * stays browsable while implementations are filled in.
 *
 * Lifecycle: positions itself relative to `anchorRect`, recomputes on
 * window resize/scroll, and closes on outside-click / Escape via
 * `update:modelValue`. The parent toolbar is the owner of state.
 */
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
import { Icon } from '@/components/ui';
import { useDatabaseBundle } from '@/composables/useDatabase';
import { useContinuumScrollLock } from '@/composables/useContinuumScrollLock';
import type { DatabaseView, DatabaseViewConfig, DatabaseViewType } from '@continuum/shared';
import { sectionById, SECTIONS, type SectionId } from './viewSettings/sections';
import LayoutPanel from './viewSettings/LayoutPanel.vue';
import PropertiesPanel from './viewSettings/PropertiesPanel.vue';
import DataSourcePanel from './viewSettings/DataSourcePanel.vue';
import FilterPanel from './viewSettings/FilterPanel.vue';
import SortPanel from './viewSettings/SortPanel.vue';
import ConditionalColorPanel from './viewSettings/ConditionalColorPanel.vue';
import PlannedSectionPanel from './viewSettings/PlannedSectionPanel.vue';

interface AnchorRect {
    top: number;
    left: number;
    bottom: number;
    right: number;
}

const props = defineProps<{
    modelValue: boolean;
    view: DatabaseView;
    anchorRect: AnchorRect | null;
    /**
     * When the popover opens, jump straight into this section instead
     * of showing the root catalogue. Used by the summary chip bar so
     * clicking a chip drops you inside the filter/sort editor in one
     * step (Notion-style deep link).
     */
    initialSection?: SectionId | null;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    'change-source': [databaseId: string];
    'change-type': [type: DatabaseViewType];
    'patch-layout': [patch: Record<string, unknown>];
    'patch-config': [patch: Partial<DatabaseViewConfig>];
}>();

const activeSectionId = ref<SectionId | null>(null);

const activeSection = computed(() => (activeSectionId.value ? sectionById(activeSectionId.value) : null));
const viewDatasourceId = toRef(() => props.view.dataSourceDatabaseId);
const datasourceState = useDatabaseBundle(viewDatasourceId);
const viewSchema = computed(() => datasourceState.bundle.value?.schema ?? []);

const POPOVER_WIDTH_DEFAULT = 280;
const POPOVER_WIDTH_WIDE = 360;
const POPOVER_MAX_HEIGHT = 480;
const popoverRef = ref<HTMLElement | null>(null);
const popoverStyle = ref<Record<string, string>>({});
useContinuumScrollLock(toRef(props, 'modelValue'));

/**
 * Sections that need extra horizontal room (multi-control rows). Keep
 * the catalogue compact so the root menu stays readable, expand only
 * when the user drills into an editor with side-by-side controls.
 */
const WIDE_SECTIONS: readonly SectionId[] = ['properties', 'filter', 'sort', 'conditionalColor'];

function currentWidth(): number {
    const id = activeSectionId.value;
    return id && WIDE_SECTIONS.includes(id) ? POPOVER_WIDTH_WIDE : POPOVER_WIDTH_DEFAULT;
}

function resetShellScroll(): void {
    const popover = popoverRef.value;
    if (!popover || popover.scrollTop === 0) return;
    popover.scrollTop = 0;
}

function reposition(): void {
    const rect = props.anchorRect;
    if (typeof window === 'undefined') return;
    // If the anchor is momentarily missing (e.g. parent rebuilds the
    // request object during a layout patch round-trip) keep the
    // last-known popover style. Wiping it would let the wrapper fall
    // back to content-driven sizing, making the popover balloon to fit
    // its widest child (the segmented control) and lose its scroll
    // cap — see the regression where toggling a switch turned the
    // popover into a near-fullscreen panel.
    if (!rect) return;
    const margin = 6;
    const width = currentWidth();
    const top = Math.min(rect.bottom + 4, window.innerHeight - POPOVER_MAX_HEIGHT - margin);
    const left = Math.min(rect.left, window.innerWidth - width - margin);
    popoverStyle.value = {
        position: 'fixed',
        top: `${Math.max(margin, top)}px`,
        left: `${Math.max(margin, left)}px`,
        width: `${width}px`,
        maxHeight: `${POPOVER_MAX_HEIGHT}px`,
        zIndex: '1000',
    };
    resetShellScroll();
}

/**
 * Outside-click handler. The popover closes on any pointerdown that
 * lands outside its own tree. We must whitelist the trigger tab *and*
 * any teleported popup that logically belongs to a child of the panel
 * (UiSelect panel, icon picker, confirm modal, …) — otherwise picking
 * an option inside one of those popups would unmount the settings.
 */
function onDocClick(event: MouseEvent): void {
    if (!props.modelValue) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest('.db-view-settings')) return;
    if (target.closest('.db-toolbar__tab-settings')) return;
    // Popups teleported to <body> by child components.
    if (target.closest('.ui-select__panel')) return;
    if (target.closest('.ui-icon-picker__panel')) return;
    if (target.closest('.color-token-picker__panel')) return;
    if (target.closest('.ui-modal')) return;
    emit('update:modelValue', false);
}

function onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && props.modelValue) emit('update:modelValue', false);
}

function selectSection(id: SectionId): void {
    activeSectionId.value = id;
}

function backToCatalogue(): void {
    activeSectionId.value = null;
}

watch(
    () => props.modelValue,
    (open) => {
        if (open) {
            activeSectionId.value = props.initialSection ?? null;
            reposition();
        }
    },
);

watch(() => props.initialSection, (next) => {
    if (props.modelValue) {
        activeSectionId.value = next ?? activeSectionId.value;
        reposition();
    }
});

watch(activeSectionId, reposition);

watch(() => props.anchorRect, reposition, { deep: true });

onMounted(() => {
    reposition();
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
});

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocClick);
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
});
</script>

<template>
    <Teleport to="body">
        <div
            v-if="modelValue"
            ref="popoverRef"
            class="db-view-settings"
            role="dialog"
            aria-label="View settings"
            data-continuum-scroll-lock-allow="true"
            :style="popoverStyle"
            @scroll.passive="resetShellScroll"
            @click.stop>
            <header class="db-view-settings__header">
                <button
                    v-if="activeSection"
                    type="button"
                    class="db-view-settings__back"
                    @click="backToCatalogue">
                    <Icon name="chevron-left" :size="12" />
                </button>
                <span class="db-view-settings__title">
                    {{ activeSection ? activeSection.label : 'View options' }}
                </span>
            </header>

            <div class="db-view-settings__body">
                <ul v-if="!activeSection" class="db-view-settings__menu" role="menu">
                    <li v-for="section in SECTIONS" :key="section.id">
                        <button
                            type="button"
                            class="db-view-settings__menu-item"
                            @click="selectSection(section.id)">
                            <span class="db-view-settings__menu-icon">
                                <Icon :name="section.icon" :size="14" />
                            </span>
                            <span class="db-view-settings__menu-text">
                                <span class="db-view-settings__menu-label">{{ section.label }}</span>
                                <span class="db-view-settings__menu-hint">{{ section.hint }}</span>
                            </span>
                            <span v-if="section.status === 'planned'" class="db-view-settings__menu-tag">soon</span>
                            <Icon name="chevron-right" :size="12" class="db-view-settings__menu-chev" />
                        </button>
                    </li>
                </ul>

                <LayoutPanel
                    v-else-if="activeSection.id === 'layout'"
                    :view="view"
                    :schema="viewSchema"
                    @change-type="(type) => emit('change-type', type)"
                    @patch-layout="(patch) => emit('patch-layout', patch)" />
                <PropertiesPanel
                    v-else-if="activeSection.id === 'properties'"
                    :view="view"
                    :schema="viewSchema"
                    @patch-config="(patch) => emit('patch-config', patch)" />
                <FilterPanel
                    v-else-if="activeSection.id === 'filter'"
                    :view="view"
                    :schema="viewSchema"
                    @patch-config="(patch) => emit('patch-config', patch)" />
                <SortPanel
                    v-else-if="activeSection.id === 'sort'"
                    :view="view"
                    :schema="viewSchema"
                    @patch-config="(patch) => emit('patch-config', patch)" />
                <ConditionalColorPanel
                    v-else-if="activeSection.id === 'conditionalColor'"
                    :view="view"
                    :schema="viewSchema"
                    @patch-config="(patch) => emit('patch-config', patch)" />
                <DataSourcePanel
                    v-else-if="activeSection.id === 'dataSource'"
                    :view="view"
                    :active-datasource-id="view.dataSourceDatabaseId"
                    @change-source="(databaseId) => emit('change-source', databaseId)" />
                <PlannedSectionPanel
                    v-else
                    :label="activeSection.label" />
            </div>
        </div>
    </Teleport>
</template>

<style scoped>
/**
 * View options popover — Notion-flavoured drawer anchored to the
 * toolbar gear. Stays tight (280 px), section list at root, panel
 * content when drilled in. Uses the dropdown shadow token for the
 * standard floating elevation; no glass / blur.
 */
.db-view-settings {
    /**
     * Default geometry. The inline `popoverStyle` overrides width /
     * maxHeight once `reposition()` runs, but we keep these CSS
     * fallbacks so the wrapper can never collapse to content-driven
     * sizing — without them, a child with a wide intrinsic preferred
     * size (e.g. the "Open pages in" segmented control) would balloon
     * the popover horizontally and uncap its height. See the
     * regression where toggling a layout switch turned the panel into
     * a near-fullscreen empty drawer.
     */
    width: 280px;
    max-width: 360px;
    max-height: 480px;
    background: var(--surface-2);
    color: var(--text-primary);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-dropdown);
    display: flex;
    flex-direction: column;
    overflow: clip;
}

.db-view-settings__header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width-1) solid var(--border);
    background: var(--surface-1);
    min-height: 36px;
}

.db-view-settings__back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: 0;
    background: transparent;
    color: var(--text-secondary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.db-view-settings__back:hover {
    background: var(--surface-hover);
    color: var(--text-primary);
}

.db-view-settings__title {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
    letter-spacing: 0.01em;
}

.db-view-settings__body {
    padding: var(--space-2);
    overflow-y: auto;
    max-height: 360px;
    scrollbar-width: thin;
}

.db-view-settings__menu {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-px);
}

.db-view-settings__menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: 0;
    background: transparent;
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    font: inherit;
    font-size: var(--text-sm);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.db-view-settings__menu-item:hover {
    background: var(--surface-hover);
}

.db-view-settings__menu-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    color: var(--text-secondary);
    flex-shrink: 0;
}

.db-view-settings__menu-item:hover .db-view-settings__menu-icon {
    color: var(--text-primary);
}

.db-view-settings__menu-text {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    gap: 1px;
}

.db-view-settings__menu-label {
    color: inherit;
    font-weight: var(--font-weight-medium);
    line-height: var(--leading-tight);
}

.db-view-settings__menu-hint {
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-tight);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-view-settings__menu-tag {
    font-size: var(--text-2xs);
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: var(--font-weight-semibold);
}

.db-view-settings__menu-chev {
    color: var(--text-muted);
    flex-shrink: 0;
}
</style>
