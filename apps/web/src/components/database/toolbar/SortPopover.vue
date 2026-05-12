<script setup lang="ts">
/**
 * SortPopover — multi-column sort builder.
 *
 * Renders the view's `sort: SortRule[]`, lets the user add / remove / reorder
 * (HTML5 drag-and-drop) and toggle direction. Every mutation emits the
 * complete new array via `change` so the parent can patch the view.
 */
import { computed, ref } from 'vue';
import type { PropertyDefinition, SortRule, SortDirection } from '@continuum/shared';
import UiButton from '@/components/ui/UiButton.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import Icon from '@/components/ui/Icon.vue';

const props = defineProps<{
    sort: SortRule[];
    properties: PropertyDefinition[];
}>();
const emit = defineEmits<{ change: [next: SortRule[]] }>();

/** Property options not already in the sort list (used by the "+ Add sort" picker). */
const remainingOptions = computed(() => {
    const used = new Set(props.sort.map((r) => r.propertyKey));
    return props.properties
        .filter((p) => !used.has(p.key))
        .map((p) => ({ label: p.label, value: p.key }));
});

const allOptions = computed(() =>
    props.properties.map((p) => ({ label: p.label, value: p.key })),
);

function emitNext(next: SortRule[]): void {
    emit('change', next);
}

function setDirection(idx: number, dir: SortDirection): void {
    const next = props.sort.map((r, i) => (i === idx ? { ...r, direction: dir } : r));
    emitNext(next);
}

function setProperty(idx: number, key: string): void {
    const next = props.sort.map((r, i) => (i === idx ? { ...r, propertyKey: key } : r));
    emitNext(next);
}

function removeAt(idx: number): void {
    emitNext(props.sort.filter((_, i) => i !== idx));
}

function addSort(): void {
    const first = remainingOptions.value[0];
    if (!first) return;
    emitNext([...props.sort, { propertyKey: String(first.value), direction: 'asc' }]);
}

function clearAll(): void {
    emitNext([]);
}

// ── Drag & drop reorder ──
const dragIndex = ref<number | null>(null);

function onDragStart(idx: number, e: DragEvent): void {
    dragIndex.value = idx;
    e.dataTransfer?.setData('text/plain', String(idx));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
}

function onDrop(targetIdx: number): void {
    const from = dragIndex.value;
    dragIndex.value = null;
    if (from === null || from === targetIdx) return;
    const next = [...props.sort];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(targetIdx, 0, moved);
    emitNext(next);
}
</script>

<template>
    <div class="db-sort">
        <ul v-if="sort.length > 0" class="db-sort__list">
            <li
                v-for="(rule, idx) in sort"
                :key="rule.propertyKey + idx"
                class="db-sort__row"
                :draggable="true"
                @dragstart="onDragStart(idx, $event)"
                @dragover="onDragOver"
                @drop="onDrop(idx)"
            >
                <span class="db-sort__handle" aria-label="Drag to reorder">
                    <Icon name="drag" :size="14" />
                </span>
                <UiSelect
                    :model-value="rule.propertyKey"
                    :options="allOptions"
                    @update:model-value="(v) => setProperty(idx, String(v))"
                />
                <div class="db-sort__dir">
                    <button
                        type="button"
                        :class="['db-sort__dir-btn', { 'is-on': rule.direction === 'asc' }]"
                        @click="setDirection(idx, 'asc')"
                        title="Ascending"
                    >
                        <Icon name="arrow-up" :size="14" />
                    </button>
                    <button
                        type="button"
                        :class="['db-sort__dir-btn', { 'is-on': rule.direction === 'desc' }]"
                        @click="setDirection(idx, 'desc')"
                        title="Descending"
                    >
                        <Icon name="arrow-down" :size="14" />
                    </button>
                </div>
                <button class="db-sort__remove" type="button" @click="removeAt(idx)" aria-label="Remove sort">
                    <Icon name="close" :size="12" />
                </button>
            </li>
        </ul>
        <p v-else class="db-sort__empty">No sorts applied</p>

        <div class="db-sort__footer">
            <UiButton size="sm" variant="ghost" :disabled="remainingOptions.length === 0" @click="addSort">
                <template #icon-left><Icon name="plus" :size="14" /></template>
                Add sort
            </UiButton>
            <UiButton v-if="sort.length > 0" size="sm" variant="ghost" @click="clearAll">
                Delete sort
            </UiButton>
        </div>
    </div>
</template>

<style scoped>
.db-sort {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 320px;
}

.db-sort__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.db-sort__row {
    display: grid;
    grid-template-columns: auto 1fr auto auto;
    gap: var(--space-2);
    align-items: center;
}

.db-sort__handle {
    display: inline-flex;
    cursor: grab;
    color: var(--fg-subtle);
}

.db-sort__dir {
    display: inline-flex;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
}

.db-sort__dir-btn {
    background: transparent;
    border: none;
    padding: var(--space-2) var(--space-3);
    color: var(--fg-subtle);
    cursor: pointer;
}

.db-sort__dir-btn.is-on {
    background: var(--accent-soft);
    color: var(--accent);
}

.db-sort__remove {
    background: transparent;
    border: none;
    color: var(--fg-subtle);
    cursor: pointer;
    padding: var(--space-1);
}

.db-sort__empty {
    margin: 0;
    color: var(--fg-subtle);
    font-size: var(--text-sm);
    padding: var(--space-2) var(--space-1);
}

.db-sort__footer {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding-top: var(--space-2);
    border-top: var(--border-width-1) solid var(--border);
}
</style>
