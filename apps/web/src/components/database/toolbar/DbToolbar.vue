<script setup lang="ts">
/**
 * DbToolbar — Database View toolbar (M5).
 *
 * Composition:
 *   left  — debounced search input.
 *   right — Sort badge · Filter badge · Properties badge · "+ New" button.
 *
 * Each badge toggles its own popover. State changes flow up via `patch()`
 * (provided by `<DatabaseView>`); after creating a note we call `reload()`
 * so the active layout refetches.
 */
import { computed, ref } from 'vue';
import type {
    ColumnConfig,
    DatabaseView,
    FilterTree,
    SortRule,
} from '@continuum/shared';
import { api } from '@/api';
import { useProperties } from '@/composables/useProperties';
import UiButton from '@/components/ui/UiButton.vue';
import UiBadge from '@/components/ui/UiBadge.vue';
import UiPopover from '@/components/ui/UiPopover.vue';
import Icon from '@/components/ui/Icon.vue';
import SearchInput from './SearchInput.vue';
import SortPopover from './SortPopover.vue';
import FilterPopover from './FilterPopover.vue';
import PropertiesPopover from './PropertiesPopover.vue';

const props = defineProps<{
    view: DatabaseView | null;
    patch: (delta: Partial<DatabaseView>) => Promise<void>;
    reload: () => Promise<void>;
}>();

const emit = defineEmits<{ created: [noteId: string] }>();

// ── Property catalogue (shared module-level cache) ──
const properties = useProperties();
const kindProperties = computed(() =>
    props.view ? properties.forKind(props.view.kindId) : [],
);
// Lazy-load on first toolbar mount so the popovers have data ready.
if (props.view) void properties.load(props.view.kindId);

// ── Active counts (drives the badge labels) ──
const sortCount = computed(() => props.view?.sort?.length ?? 0);
const filterCount = computed(() => countRules(props.view?.filter ?? null));
const hiddenCount = computed(
    () => props.view?.columns?.filter((c) => !c.visible).length ?? 0,
);

function countRules(node: FilterTree | null): number {
    if (!node) return 0;
    let n = 0;
    for (const child of node.rules) {
        if (child.type === 'rule') n += 1;
        else n += countRules(child);
    }
    return n;
}

// ── Popover anchors / open state ──
const sortBtn = ref<HTMLElement | null>(null);
const filterBtn = ref<HTMLElement | null>(null);
const propsBtn = ref<HTMLElement | null>(null);
const sortOpen = ref(false);
const filterOpen = ref(false);
const propsOpen = ref(false);

function toggle(which: 'sort' | 'filter' | 'props'): void {
    sortOpen.value = which === 'sort' ? !sortOpen.value : false;
    filterOpen.value = which === 'filter' ? !filterOpen.value : false;
    propsOpen.value = which === 'props' ? !propsOpen.value : false;
}

// ── Mutation handlers ──
function onSearch(value: string | null): void {
    void props.patch({ search: value });
}
function onSortChange(next: SortRule[]): void {
    void props.patch({ sort: next });
}
function onFilterChange(next: FilterTree): void {
    void props.patch({ filter: next });
}
function onColumnsChange(next: ColumnConfig[]): void {
    void props.patch({ columns: next });
}

async function createNote(): Promise<void> {
    if (!props.view) return;
    const note = await api.notes.create({
        kind: props.view.kindId,
        title: 'Untitled',
    });
    emit('created', note.id);
    await props.reload();
}

// ── CSV export ──
const exporting = ref(false);
async function exportCsv(): Promise<void> {
    if (!props.view || exporting.value) return;
    exporting.value = true;
    try {
        const blob = await api.views.exportCsv(props.view.kindId, {
            view: { viewId: props.view.id },
            pageSize: 200,
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${props.view.name}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } finally {
        exporting.value = false;
    }
}
</script>

<template>
    <div class="db-toolbar">
        <div class="db-toolbar__left">
            <SearchInput :model-value="view?.search ?? null" @update="onSearch" />
        </div>
        <div class="db-toolbar__right">
            <button
                ref="sortBtn"
                type="button"
                class="db-toolbar__pill"
                :class="{ 'is-active': sortCount > 0 }"
                @click="toggle('sort')"
            >
                <Icon name="arrow-down" :size="14" />
                <span>Sort</span>
                <UiBadge v-if="sortCount > 0" tone="accent" size="sm">{{ sortCount }}</UiBadge>
            </button>
            <button
                ref="filterBtn"
                type="button"
                class="db-toolbar__pill"
                :class="{ 'is-active': filterCount > 0 }"
                @click="toggle('filter')"
            >
                <Icon name="filter" :size="14" />
                <span>Filter</span>
                <UiBadge v-if="filterCount > 0" tone="accent" size="sm">{{ filterCount }}</UiBadge>
            </button>
            <button
                ref="propsBtn"
                type="button"
                class="db-toolbar__pill"
                :class="{ 'is-active': hiddenCount > 0 }"
                @click="toggle('props')"
            >
                <Icon name="eye" :size="14" />
                <span>Properties</span>
            </button>

            <UiButton
                size="sm"
                variant="ghost"
                :disabled="!view || exporting"
                :title="exporting ? 'Exporting…' : 'Export to CSV'"
                @click="exportCsv"
            >
                <template #icon-left><Icon name="download" :size="14" /></template>
                Export
            </UiButton>

            <UiButton size="sm" variant="primary" :disabled="!view" @click="createNote">
                <template #icon-left><Icon name="plus" :size="14" /></template>
                New
            </UiButton>
        </div>

        <UiPopover
            v-model:open="sortOpen"
            :trigger-ref="sortBtn"
        >
            <SortPopover
                v-if="view"
                :sort="view.sort ?? []"
                :properties="kindProperties"
                @change="onSortChange"
            />
        </UiPopover>

        <UiPopover
            v-model:open="filterOpen"
            :trigger-ref="filterBtn"
        >
            <FilterPopover
                v-if="view"
                :filter="view.filter"
                :properties="kindProperties"
                @change="onFilterChange"
            />
        </UiPopover>

        <UiPopover
            v-model:open="propsOpen"
            :trigger-ref="propsBtn"
        >
            <PropertiesPopover
                v-if="view"
                :columns="view.columns ?? []"
                :properties="kindProperties"
                @change="onColumnsChange"
            />
        </UiPopover>
    </div>
</template>

<style scoped>
.db-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-3) var(--space-4);
    gap: var(--space-3);
}
.db-toolbar__left,
.db-toolbar__right {
    display: flex;
    align-items: center;
    gap: var(--space-2);
}
.db-toolbar__pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: transparent;
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
    color: var(--fg-muted);
    font-size: var(--text-sm);
    cursor: pointer;
    transition: background-color var(--duration-fast) var(--ease-standard);
}
.db-toolbar__pill:hover {
    background: var(--bg-soft);
}
.db-toolbar__pill.is-active {
    color: var(--accent);
    background: var(--accent-soft);
}
</style>
