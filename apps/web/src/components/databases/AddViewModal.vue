<script setup lang="ts">
/**
 * AddViewModal.vue — Notion-style picker for creating a new view.
 *
 * Presents every entry from `VIEW_REGISTRY_LIST` as a tile (icon +
 * label + description, with a `Soon` badge for `status: 'planned'`
 * types). Selecting a tile commits immediately, emitting the chosen
 * `DatabaseViewType` to the parent which performs the actual
 * `addView()` call. The modal closes on selection and on the standard
 * `update:modelValue` channel.
 */
import { ref, watch } from 'vue';
import { UiModal } from '@/components/ui';
import { Icon } from '@/components/ui';
import type { DatabaseViewType } from '@continuum/shared';
import { VIEW_REGISTRY_LIST } from './views/registry';

const props = defineProps<{ modelValue: boolean }>();
const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    select: [type: DatabaseViewType];
}>();

const filter = ref('');

watch(
    () => props.modelValue,
    (open) => {
        if (open) filter.value = '';
    },
);

function close(): void {
    emit('update:modelValue', false);
}

function pick(type: DatabaseViewType): void {
    emit('select', type);
    close();
}
</script>

<template>
    <UiModal :model-value="modelValue" title="Add a view" size="lg"
        @update:model-value="(v) => emit('update:modelValue', v)">
        <div class="add-view">
            <input
                v-model="filter"
                class="add-view__search"
                type="search"
                placeholder="Search view types…"
                autofocus />
            <div class="add-view__grid">
                <button
                    v-for="entry in VIEW_REGISTRY_LIST.filter(
                        (e) => !filter.trim()
                            || e.label.toLowerCase().includes(filter.trim().toLowerCase())
                            || e.description.toLowerCase().includes(filter.trim().toLowerCase())
                    )"
                    :key="entry.type"
                    type="button"
                    class="add-view__tile"
                    :class="{ 'add-view__tile--planned': entry.status === 'planned' }"
                    @click="pick(entry.type)">
                    <div class="add-view__tile-icon">
                        <Icon :name="entry.icon" :size="22" />
                    </div>
                    <div class="add-view__tile-body">
                        <div class="add-view__tile-head">
                            <strong>{{ entry.label }}</strong>
                            <span v-if="entry.status === 'planned'" class="add-view__badge">Soon</span>
                        </div>
                        <p>{{ entry.description }}</p>
                    </div>
                </button>
            </div>
        </div>
    </UiModal>
</template>

<style scoped>
.add-view {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
}

.add-view__search {
    width: 100%;
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.08));
    background: var(--bg-soft, #1a1a1a);
    color: var(--fg, #ededed);
    font: inherit;
}

.add-view__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 0.5rem;
    max-height: 60vh;
    overflow: auto;
    padding: 0.1rem;
}

.add-view__tile {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    padding: 0.7rem;
    text-align: left;
    background: var(--bg-elev, #232323);
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    cursor: pointer;
    color: var(--fg, #ededed);
    transition: border-color 80ms ease, background 80ms ease;
}

.add-view__tile:hover {
    border-color: var(--accent, #e8dcc8);
    background: var(--surface-hover, rgba(255, 255, 255, 0.04));
}

.add-view__tile--planned {
    opacity: 0.85;
}

.add-view__tile-icon {
    flex: 0 0 auto;
    width: 36px;
    height: 36px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-soft, #1c1c1c);
    color: var(--accent, #e8dcc8);
}

.add-view__tile-body {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
}

.add-view__tile-head {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.85rem;
}

.add-view__badge {
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--surface-soft, rgba(255, 255, 255, 0.06));
    color: var(--fg-muted, #a09b90);
}

.add-view__tile-body p {
    margin: 0;
    font-size: 0.72rem;
    color: var(--fg-muted, #a09b90);
}
</style>
