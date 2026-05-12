<script setup lang="ts">
/**
 * PropertiesPopover — show / hide / reorder columns.
 *
 * Materialises a default `ColumnConfig[]` from the kind's property defs
 * when the view's `columns` is empty, then exposes a per-row visibility
 * toggle and an HTML5 drag handle to reorder.
 *
 * Every mutation emits the new array; the parent persists it via
 * `patch({ columns: next })`.
 */
import { computed, ref } from 'vue';
import type { ColumnConfig, PropertyDefinition } from '@continuum/shared';
import UiSwitch from '@/components/ui/UiSwitch.vue';
import Icon from '@/components/ui/Icon.vue';

const props = defineProps<{
    columns: ColumnConfig[];
    properties: PropertyDefinition[];
}>();
const emit = defineEmits<{ change: [next: ColumnConfig[]] }>();

/**
 * Materialised column list. When `view.columns` is empty we synthesise
 * one entry per property def so the UI is never blank; the synthesised
 * list is only persisted on the next mutation.
 */
const materialised = computed<ColumnConfig[]>(() => {
    if (props.columns.length > 0) {
        // Order = stored `position` ascending.
        return [...props.columns].sort((a, b) => a.position.localeCompare(b.position));
    }
    return props.properties.map((p) => ({
        propertyKey: p.key,
        visible: true,
        width: null,
        position: p.position,
        frozen: false,
        wrap: false,
    }));
});

/** Property definition lookup table for label / icon. */
const defByKey = computed<Map<string, PropertyDefinition>>(() => {
    const m = new Map<string, PropertyDefinition>();
    for (const p of props.properties) m.set(p.key, p);
    return m;
});

/** Re-stamp `position` strings with stable, ordered keys ('a0', 'a1', …). */
function withFreshPositions(list: ColumnConfig[]): ColumnConfig[] {
    return list.map((c, i) => ({ ...c, position: `a${String(i).padStart(4, '0')}` }));
}

function toggleVisible(key: string, value: boolean): void {
    const next = materialised.value.map((c) =>
        c.propertyKey === key ? { ...c, visible: value } : c,
    );
    emit('change', withFreshPositions(next));
}

// ── Drag reorder ──
const dragKey = ref<string | null>(null);

function onDragStart(key: string, e: DragEvent): void {
    dragKey.value = key;
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

function onDragOver(e: DragEvent): void {
    e.preventDefault();
}

function onDrop(targetKey: string): void {
    const from = dragKey.value;
    dragKey.value = null;
    if (!from || from === targetKey) return;
    const list = [...materialised.value];
    const fromIdx = list.findIndex((c) => c.propertyKey === from);
    const toIdx = list.findIndex((c) => c.propertyKey === targetKey);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = list.splice(fromIdx, 1);
    if (!moved) return;
    list.splice(toIdx, 0, moved);
    emit('change', withFreshPositions(list));
}
</script>

<template>
    <div class="db-props">
        <ul class="db-props__list">
            <li
                v-for="col in materialised"
                :key="col.propertyKey"
                class="db-props__row"
                :draggable="true"
                @dragstart="onDragStart(col.propertyKey, $event)"
                @dragover="onDragOver"
                @drop="onDrop(col.propertyKey)"
            >
                <span class="db-props__handle" aria-label="Drag to reorder">
                    <Icon name="drag" :size="14" />
                </span>
                <Icon
                    v-if="defByKey.get(col.propertyKey)?.icon"
                    :name="defByKey.get(col.propertyKey)!.icon as string"
                    :size="14"
                />
                <span class="db-props__label">
                    {{ defByKey.get(col.propertyKey)?.label ?? col.propertyKey }}
                </span>
                <UiSwitch
                    :model-value="col.visible"
                    @update:model-value="(v) => toggleVisible(col.propertyKey, v)"
                />
            </li>
            <li v-if="materialised.length === 0" class="db-props__empty">No properties</li>
        </ul>
    </div>
</template>

<style scoped>
.db-props {
    min-width: 280px;
}
.db-props__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}
.db-props__row {
    display: grid;
    grid-template-columns: auto auto 1fr auto;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
}
.db-props__row:hover {
    background: var(--bg-soft);
}
.db-props__handle {
    cursor: grab;
    color: var(--fg-subtle);
}
.db-props__label {
    font-size: var(--text-sm);
    color: var(--fg);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.db-props__empty {
    color: var(--fg-subtle);
    font-size: var(--text-sm);
    padding: var(--space-3);
}
</style>
