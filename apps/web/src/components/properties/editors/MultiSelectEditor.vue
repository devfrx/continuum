<script setup lang="ts">
/**
 * Multi-select property editor. Renders coloured chips inline + a small "+"
 * button that toggles a checklist popover.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import type { MultiSelectValue, PropertyDefinition, PropertyOption } from '@continuum/shared';

const props = defineProps<{
    value: MultiSelectValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: MultiSelectValue] }>();

const options = computed(
    () => (props.definition.config as { options: PropertyOption[] }).options ?? [],
);
const selected = computed(() => props.value?.value ?? []);
const selectedOptions = computed(() =>
    selected.value
        .map((id) => options.value.find((o) => o.id === id))
        .filter((o): o is PropertyOption => Boolean(o)),
);

const open = ref(false);
const root = ref<HTMLDivElement | null>(null);

function toggle(id: string): void {
    const set = new Set(selected.value);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    emit('update:value', { type: 'multiSelect', value: Array.from(set) });
}

function remove(id: string): void {
    emit('update:value', {
        type: 'multiSelect',
        value: selected.value.filter((s) => s !== id),
    });
}

function onDocClick(e: MouseEvent): void {
    if (!open.value) return;
    if (root.value && !root.value.contains(e.target as Node)) open.value = false;
}

function onTrigger(): void {
    open.value = !open.value;
    if (open.value) {
        // Defer attaching the document listener so the same click that
        // opened the popover doesn't immediately close it.
        queueMicrotask(() => document.addEventListener('mousedown', onDocClick));
    } else {
        document.removeEventListener('mousedown', onDocClick);
    }
}

onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick));
</script>

<template>
    <div ref="root" class="prop-ms">
        <button type="button" class="prop-ms__trigger" @click="onTrigger">
            <span v-if="selectedOptions.length === 0" class="prop-ms__placeholder">Select options</span>
            <span v-for="opt in selectedOptions" :key="opt.id" class="prop-ms__chip" :style="{ background: opt.color }">
                {{ opt.label }}
                <button type="button" class="prop-ms__chip-x" @click.stop="remove(opt.id)" aria-label="Remove">
                    <Icon name="close" :size="10" />
                </button>
            </span>
            <Icon name="chevron-down" :size="12" class="prop-ms__caret" />
        </button>
        <div v-if="open" class="prop-ms__panel" role="listbox">
            <button v-for="opt in options" :key="opt.id" type="button" class="prop-ms__row"
                :class="{ 'is-on': selected.includes(opt.id) }" @click="toggle(opt.id)">
                <span class="prop-ms__check">
                    <Icon v-if="selected.includes(opt.id)" name="check" :size="12" />
                </span>
                <span class="prop-ms__chip prop-ms__chip--row" :style="{ background: opt.color }">{{ opt.label }}</span>
            </button>
            <div v-if="options.length === 0" class="prop-ms__empty">No options. Configure them in the property settings.</div>
        </div>
    </div>
</template>

<style scoped>
.prop-ms {
    position: relative;
    width: fit-content;
    min-width: 220px;
    max-width: min(100%, 520px);
}

.prop-ms__trigger {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    background: transparent;
    border: none;
    color: var(--fg);
    text-align: left;
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    flex-wrap: wrap;
    min-height: 30px;
    transition: background var(--duration-fast) var(--ease-standard);
}

.prop-ms__trigger:hover,
.prop-ms__trigger:focus {
    background: var(--bg-soft);
}

.prop-ms__placeholder {
    color: var(--fg-subtle);
    font-size: var(--text-sm);
    flex: 1;
}

.prop-ms__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 22px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    color: #fff;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    white-space: nowrap;
}

.prop-ms__chip-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: rgba(255, 255, 255, 0.85);
    cursor: pointer;
    padding: 0;
}

.prop-ms__chip-x:hover {
    background: rgba(0, 0, 0, 0.2);
    color: #fff;
}

.prop-ms__caret {
    margin-left: auto;
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.prop-ms__panel {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    z-index: 50;
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
    padding: var(--space-2);
    max-height: 240px;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.prop-ms__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: transparent;
    border: none;
    color: var(--fg);
    cursor: pointer;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    text-align: left;
}

.prop-ms__row:hover {
    background: var(--bg-soft);
}

.prop-ms__check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    color: var(--fg-strong);
}

.prop-ms__chip--row {
    height: 20px;
}

.prop-ms__empty {
    padding: var(--space-3);
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    text-align: center;
}
</style>
