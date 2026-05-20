<script setup lang="ts">
/**
 * DatabaseViewSummaryBar.vue — chips strip that surfaces active
 * filters, sorts and conditional colours directly above the view body.
 *
 * Two goals:
 *   1. Make the *applied* filter/sort visible at a glance — Notion's
 *      "Filters/Sorts pills above the table" UX, ported to Continuum.
 *   2. Provide one-click access to the underlying editors and to
 *      "Save as new view" so the user can turn an ad-hoc query into
 *      a permanent saved view.
 *
 * The bar is rendered by `DatabaseBody` and:
 *   – Shows one chip per filter condition, sort rule and colour rule.
 *   – Clicking a chip opens the View options popover focused on the
 *     matching section.
 *   – The trailing × on each chip removes that single condition / rule
 *     via `patch-config` so the user can iterate without opening a
 *     popover.
 *   – "+" buttons open the popover on the relevant section directly.
 *   – "Save as new view" emits `save-as-new-view` carrying a name
 *     supplied by `UiPromptModal`. The parent owns the actual view
 *     creation so this component stays render-only.
 *
 * All anchors (chips, buttons) forward their `DOMRect` upward so the
 * popover positions itself relative to the clicked control.
 */
import { computed, ref } from 'vue';
import { Icon, UiButton, UiPromptModal } from '@/components/ui';
import type { DatabaseView, PropertyDefinition } from '@continuum/shared';
import type { SectionId } from '../viewSettings/sections';
import type { AnchorRect } from './types';
import {
    summarizeConditionalColorChips,
    summarizeFilterChips,
    summarizeSortChips,
    type ConditionalColorChip,
    type FilterChip,
    type SortChip,
} from './summarize';

type SummarySettingsSection = Extract<SectionId, 'filter' | 'sort' | 'conditionalColor'>;

const props = defineProps<{
    view: DatabaseView;
    schema: readonly PropertyDefinition[];
    editable: boolean;
    /** Total rows after filter+sort applied — shown as a hint chip. */
    rowCount: number;
}>();

const emit = defineEmits<{
    /** Open the view-options popover focused on a specific section. */
    'open-settings': [section: SummarySettingsSection, anchorRect: AnchorRect];
    /** Remove a single filter condition by id. */
    'remove-filter': [conditionId: string];
    /** Remove a single sort rule by id. */
    'remove-sort': [ruleId: string];
    /** Remove a single conditional-color rule by id. */
    'remove-conditional-color': [ruleId: string];
    /** Persist the current view config as a brand-new view. */
    'save-as-new-view': [name: string];
}>();

const filterChips = computed<FilterChip[]>(() =>
    summarizeFilterChips(props.view.config.filter, props.schema, {
        conditionalColors: props.view.config.conditionalColors,
    }),
);

const sortChips = computed<SortChip[]>(() =>
    summarizeSortChips(props.view.config.sort, props.schema, {
        conditionalColors: props.view.config.conditionalColors,
    }),
);

const conditionalColorChips = computed<ConditionalColorChip[]>(() =>
    summarizeConditionalColorChips(props.view.config.conditionalColors, props.schema),
);

const hasAny = computed(() =>
    filterChips.value.length > 0
    || sortChips.value.length > 0
    || conditionalColorChips.value.length > 0,
);

function rectFrom(event: MouseEvent): AnchorRect {
    const target = event.currentTarget as HTMLElement | null;
    if (target) {
        const r = target.getBoundingClientRect();
        return { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    }
    return {
        top: event.clientY,
        left: event.clientX,
        bottom: event.clientY,
        right: event.clientX,
    };
}

function openFilterSection(event: MouseEvent): void {
    emit('open-settings', 'filter', rectFrom(event));
}

function openSortSection(event: MouseEvent): void {
    emit('open-settings', 'sort', rectFrom(event));
}

function openConditionalColorSection(event: MouseEvent): void {
    emit('open-settings', 'conditionalColor', rectFrom(event));
}

function onRemoveFilter(id: string, event: MouseEvent): void {
    event.stopPropagation();
    emit('remove-filter', id);
}

function onRemoveSort(id: string, event: MouseEvent): void {
    event.stopPropagation();
    emit('remove-sort', id);
}

function onRemoveConditionalColor(id: string, event: MouseEvent): void {
    event.stopPropagation();
    emit('remove-conditional-color', id);
}

// ── Save as new view ────────────────────────────────────────────────────
const saveModalOpen = ref(false);
const defaultSaveName = computed(() => `${props.view.name} (copy)`);

function openSaveModal(): void {
    if (!props.editable || !hasAny.value) return;
    saveModalOpen.value = true;
}

function onSaveSubmit(value: string): void {
    emit('save-as-new-view', value);
}
</script>

<template>
    <div v-if="hasAny" class="db-summary" role="toolbar" aria-label="Active view filters, sorts and colors">
        <div v-if="filterChips.length > 0" class="db-summary__group">
            <button
                type="button"
                class="db-summary__lead"
                :disabled="!editable"
                title="Edit filters"
                @click="openFilterSection">
                <Icon name="filter" :size="12" />
                <span>Filter</span>
            </button>
            <button
                v-for="chip in filterChips"
                :key="chip.id"
                type="button"
                class="db-summary__chip"
                :disabled="!editable"
                :title="editable ? 'Edit this filter' : ''"
                @click="openFilterSection">
                <span class="db-summary__chip-field">{{ chip.fieldLabel }}</span>
                <span class="db-summary__chip-op">{{ chip.operatorLabel }}</span>
                <span v-if="chip.valueLabel" class="db-summary__chip-value">{{ chip.valueLabel }}</span>
                <button
                    v-if="editable"
                    type="button"
                    class="db-summary__chip-remove"
                    aria-label="Remove filter"
                    @click="onRemoveFilter(chip.id, $event)">
                    <Icon name="close" :size="10" />
                </button>
            </button>
            <button
                v-if="editable"
                type="button"
                class="db-summary__add"
                title="Add filter"
                @click="openFilterSection">
                <Icon name="plus" :size="11" />
            </button>
        </div>

        <div v-if="sortChips.length > 0" class="db-summary__group">
            <button
                type="button"
                class="db-summary__lead"
                :disabled="!editable"
                title="Edit sorts"
                @click="openSortSection">
                <Icon name="arrow-down" :size="12" />
                <span>Sort</span>
            </button>
            <button
                v-for="chip in sortChips"
                :key="chip.id"
                type="button"
                class="db-summary__chip"
                :disabled="!editable"
                :title="editable ? 'Edit this sort rule' : ''"
                @click="openSortSection">
                <span class="db-summary__chip-field">{{ chip.fieldLabel }}</span>
                <Icon
                    class="db-summary__chip-dir"
                    :name="chip.direction === 'asc' ? 'arrow-up' : 'arrow-down'"
                    :size="10" />
                <button
                    v-if="editable"
                    type="button"
                    class="db-summary__chip-remove"
                    aria-label="Remove sort rule"
                    @click="onRemoveSort(chip.id, $event)">
                    <Icon name="close" :size="10" />
                </button>
            </button>
            <button
                v-if="editable"
                type="button"
                class="db-summary__add"
                title="Add sort"
                @click="openSortSection">
                <Icon name="plus" :size="11" />
            </button>
        </div>

        <div v-if="conditionalColorChips.length > 0" class="db-summary__group">
            <button
                type="button"
                class="db-summary__lead"
                :disabled="!editable"
                title="Edit conditional colors"
                @click="openConditionalColorSection">
                <Icon name="palette" :size="12" />
                <span>Color</span>
            </button>
            <button
                v-for="chip in conditionalColorChips"
                :key="chip.id"
                type="button"
                class="db-summary__chip db-summary__chip--color"
                :disabled="!editable"
                :title="editable ? 'Edit this conditional color rule' : ''"
                @click="openConditionalColorSection">
                <span
                    class="db-summary__swatch"
                    :style="{ background: chip.colorSwatch }"
                    aria-hidden="true" />
                <span class="db-summary__chip-field">{{ chip.fieldLabel }}</span>
                <span class="db-summary__chip-op">{{ chip.operatorLabel }}</span>
                <span v-if="chip.valueLabel" class="db-summary__chip-value">{{ chip.valueLabel }}</span>
                <span v-if="chip.extraConditionCount" class="db-summary__chip-op">
                    +{{ chip.extraConditionCount }}
                </span>
                <span class="db-summary__chip-op">{{ chip.colorLabel }}</span>
                <span class="db-summary__chip-target">{{ chip.targetLabel }} {{ chip.scopeLabel }}</span>
                <button
                    v-if="editable"
                    type="button"
                    class="db-summary__chip-remove"
                    aria-label="Remove conditional color rule"
                    @click="onRemoveConditionalColor(chip.id, $event)">
                    <Icon name="close" :size="10" />
                </button>
            </button>
            <button
                v-if="editable"
                type="button"
                class="db-summary__add"
                title="Add conditional color"
                @click="openConditionalColorSection">
                <Icon name="plus" :size="11" />
            </button>
        </div>

        <div class="db-summary__spacer" />

        <span class="db-summary__count">
            {{ rowCount }} {{ rowCount === 1 ? 'result' : 'results' }}
        </span>

        <UiButton
            v-if="editable"
            variant="ghost"
            size="sm"
            class="db-summary__save"
            title="Save current view rules as a new view"
            @click="openSaveModal">
            <Icon name="save" :size="12" />
            <span>Save as new view</span>
        </UiButton>

        <UiPromptModal
            v-model="saveModalOpen"
            title="Save as new view"
            label="View name"
            placeholder="My filtered view"
            :initial-value="defaultSaveName"
            confirm-label="Create view"
            @submit="onSaveSubmit" />
    </div>
</template>

<style scoped>
/**
 * Notion-style summary bar. Slim, dense, scrollable horizontally on
 * overflow. Tokenised against the existing design system — no new
 * CSS variables, no glass/blur effects.
 */
.db-summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width-1) solid var(--border);
    background: var(--surface-1);
    color: var(--text-secondary);
    overflow-x: auto;
    scrollbar-width: thin;
    min-height: 36px;
}

.db-summary::-webkit-scrollbar {
    height: 6px;
}

.db-summary__group {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
}

.db-summary__lead {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    border: 0;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
        color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.db-summary__lead:hover:not(:disabled) {
    color: var(--text-primary);
    background: var(--surface-hover);
}

.db-summary__chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    background: var(--surface-2);
    color: var(--text-primary);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px var(--space-1) 2px var(--space-2);
    font: inherit;
    font-size: var(--text-xs);
    cursor: pointer;
    white-space: nowrap;
    min-height: 24px;
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.db-summary__chip:hover:not(:disabled) {
    border-color: var(--accent-border);
    background: var(--surface-3);
}

.db-summary__chip--color {
    max-width: min(34rem, 70vw);
}

.db-summary__chip:disabled {
    cursor: default;
}

.db-summary__swatch {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    border: var(--border-width-1) solid var(--border);
    flex: 0 0 auto;
}

.db-summary__chip-field {
    font-weight: var(--font-weight-semibold);
    color: var(--text-primary);
}

.db-summary__chip-op {
    color: var(--text-muted);
    font-weight: var(--font-weight-medium);
}

.db-summary__chip-value {
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
    max-width: 12rem;
    overflow: hidden;
    text-overflow: ellipsis;
}

.db-summary__chip-target {
    color: var(--text-muted);
    font-weight: var(--font-weight-medium);
    max-width: 10rem;
    overflow: hidden;
    text-overflow: ellipsis;
}

.db-summary__chip-dir {
    color: var(--text-muted);
}

.db-summary__chip-remove {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: 0;
    background: transparent;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.db-summary__chip-remove:hover {
    background: var(--danger-faint);
    color: var(--danger);
}

.db-summary__add {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border: var(--border-width-1) dashed var(--border);
    background: transparent;
    color: var(--text-muted);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.db-summary__add:hover {
    color: var(--text-primary);
    border-color: var(--border-hover);
    background: var(--surface-hover);
}

.db-summary__spacer {
    flex: 1;
    min-width: var(--space-2);
}

.db-summary__count {
    font-size: var(--text-xs);
    color: var(--text-muted);
    white-space: nowrap;
    flex-shrink: 0;
}

.db-summary__save {
    flex-shrink: 0;
}
</style>
