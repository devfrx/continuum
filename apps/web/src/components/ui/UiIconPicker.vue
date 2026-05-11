<script setup lang="ts">
/**
 * Universal icon picker — grid of selectable icons grouped by section,
 * with a search input that filters across the flat list. Emits the
 * picked icon id via `update:modelValue`.
 *
 * Defaults to the curated Solar Bold catalogue used for note kinds,
 * but consumers can pass any list of `{label, icons[]}` groups so the
 * component can be reused for other pickers (toolbars, custom widgets,
 * etc.).
 */
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import UiInput from './UiInput.vue';
import { KIND_ICON_GROUPS, DEFAULT_KIND_ICON, type KindIconGroup } from '@/assets/kindIcons';

const props = withDefaults(
    defineProps<{
        modelValue: string;
        /** Optional override — defaults to the kind-icons catalogue. */
        groups?: readonly KindIconGroup[];
        /** Show a search filter above the grid. */
        searchable?: boolean;
        /** Inline preview of the active selection. */
        showPreview?: boolean;
    }>(),
    {
        groups: () => KIND_ICON_GROUPS,
        searchable: true,
        showPreview: true,
    },
);

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const query = ref('');

/**
 * Filtered groups — when the user types a query we strip group sections
 * whose icons all fail the substring test, then trim each remaining
 * group's icon list to the matching subset.
 */
const filteredGroups = computed<KindIconGroup[]>(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return [...props.groups];
    const out: KindIconGroup[] = [];
    for (const g of props.groups) {
        const icons = g.icons.filter((i) => i.toLowerCase().includes(q));
        if (icons.length) out.push({ label: g.label, icons });
    }
    return out;
});

function pick(name: string): void {
    emit('update:modelValue', name);
}
</script>

<template>
    <div class="ui-icon-picker">
        <div v-if="searchable || showPreview" class="ui-icon-picker__head">
            <UiInput v-if="searchable" v-model="query" size="sm" placeholder="Search icons…" />
            <div v-if="showPreview" class="ui-icon-picker__preview" :title="modelValue || 'No icon'">
                <Icon :name="modelValue || DEFAULT_KIND_ICON" :size="22" />
            </div>
        </div>

        <div v-if="filteredGroups.length === 0" class="ui-icon-picker__empty">
            No matches.
        </div>

        <div v-for="group in filteredGroups" :key="group.label" class="ui-icon-picker__group">
            <h4 class="ui-icon-picker__heading">{{ group.label }}</h4>
            <div class="ui-icon-picker__grid">
                <button v-for="name in group.icons" :key="name" type="button" class="ui-icon-picker__tile"
                    :class="{ 'is-active': modelValue === name }" :title="name.replace(/^[a-z-]+:/, '')"
                    @click="pick(name)">
                    <Icon :name="name" :size="18" />
                </button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.ui-icon-picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
}

.ui-icon-picker__head {
    display: flex;
    align-items: center;
    gap: var(--space-5);
}

.ui-icon-picker__head> :first-child {
    flex: 1;
}

.ui-icon-picker__preview {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    color: var(--accent);
    border: var(--border-width-1) solid var(--border);
    flex-shrink: 0;
}

.ui-icon-picker__group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.ui-icon-picker__heading {
    margin: 0;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--fg-subtle);
}

.ui-icon-picker__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(34px, 1fr));
    gap: var(--space-3);
    max-height: 220px;
    overflow-y: auto;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
}

.ui-icon-picker__tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 34px;
    border-radius: var(--radius-xs);
    background: transparent;
    border: var(--border-width-1) solid transparent;
    color: var(--fg);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.ui-icon-picker__tile:hover {
    background: var(--bg-elev);
}

.ui-icon-picker__tile.is-active {
    background: var(--accent-soft);
    border-color: var(--accent);
    color: var(--accent);
}

.ui-icon-picker__tile:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
}

.ui-icon-picker__empty {
    font-size: var(--text-sm);
    color: var(--fg-subtle);
    padding: var(--space-6);
    text-align: center;
    background: var(--bg-soft);
    border-radius: var(--radius-sm);
}
</style>
