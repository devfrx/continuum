<script setup lang="ts">
/**
 * Single-select property editor.
 *
 * The trigger doubles as a coloured chip showing the current option (or a
 * placeholder when empty). Clicking the trigger — chip included — opens a
 * Notion-style popover that lets the user pick another option or clear the
 * value, so changing the selection after the first pick is always one
 * click away.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import {
    PROPERTY_TYPE_PLACEHOLDERS,
    type PropertyDefinition,
    type PropertyOption,
    type SelectValue,
} from '@continuum/shared';

const props = defineProps<{
    value: SelectValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: SelectValue] }>();

const options = computed(
    () => (props.definition.config as { options: PropertyOption[] }).options ?? [],
);
const current = computed(() => props.value?.value ?? '');
const currentOption = computed<PropertyOption | null>(
    () => options.value.find((o) => o.id === current.value) ?? null,
);

const open = ref(false);
const root = ref<HTMLDivElement | null>(null);

function pick(id: string): void {
    emit('update:value', { type: 'select', value: id });
    close();
}

function clear(): void {
    emit('update:value', { type: 'select', value: '' });
    close();
}

function onDocClick(e: MouseEvent): void {
    if (!open.value) return;
    if (root.value && !root.value.contains(e.target as Node)) close();
}

function toggle(): void {
    open.value ? close() : openPanel();
}

function openPanel(): void {
    open.value = true;
    queueMicrotask(() => document.addEventListener('mousedown', onDocClick));
}

function close(): void {
    open.value = false;
    document.removeEventListener('mousedown', onDocClick);
}

onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick));
</script>

<template>
    <div ref="root" class="prop-sel">
        <button type="button" class="prop-sel__trigger" @click="toggle">
            <span v-if="currentOption" class="prop-sel__chip" :style="{ background: currentOption.color }">
                {{ currentOption.label }}
            </span>
            <span v-else class="prop-sel__placeholder">{{ PROPERTY_TYPE_PLACEHOLDERS.select }}</span>
            <Icon name="chevron-down" :size="12" class="prop-sel__caret" />
        </button>

        <div v-if="open" class="prop-sel__panel" role="listbox">
            <button v-if="currentOption" type="button" class="prop-sel__row prop-sel__row--clear" @click="clear">
                <span class="prop-sel__check">
                    <Icon name="close" :size="11" />
                </span>
                <span class="prop-sel__clear-label">Clear selection</span>
            </button>
            <button v-for="opt in options" :key="opt.id" type="button" class="prop-sel__row"
                :class="{ 'is-on': opt.id === current }" @click="pick(opt.id)">
                <span class="prop-sel__check">
                    <Icon v-if="opt.id === current" name="check" :size="12" />
                </span>
                <span class="prop-sel__chip prop-sel__chip--row" :style="{ background: opt.color }">
                    {{ opt.label }}
                </span>
            </button>
            <div v-if="options.length === 0" class="prop-sel__empty">
                No options. Configure them when adding the property.
            </div>
        </div>
    </div>
</template>

<style scoped>
.prop-sel {
    position: relative;
    width: fit-content;
    min-width: 168px;
    max-width: min(100%, 360px);
}

.prop-sel__trigger {
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
    min-height: 30px;
    transition: background var(--duration-fast) var(--ease-standard);
}

.prop-sel__trigger:hover,
.prop-sel__trigger:focus {
    background: var(--bg-soft);
}

.prop-sel__placeholder {
    color: var(--fg-subtle);
    font-size: var(--text-sm);
    flex: 1;
}

.prop-sel__chip {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    color: #fff;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
}

.prop-sel__caret {
    margin-left: auto;
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.prop-sel__panel {
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

.prop-sel__row {
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

.prop-sel__row:hover {
    background: var(--bg-soft);
}

.prop-sel__row--clear {
    color: var(--fg-muted);
    border-bottom: var(--border-width-1) solid var(--border);
    border-radius: 0;
    margin-bottom: var(--space-1);
    padding-bottom: var(--space-2);
}

.prop-sel__check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    color: var(--fg-strong);
    flex-shrink: 0;
}

.prop-sel__clear-label {
    font-size: var(--text-xs);
}

.prop-sel__chip--row {
    height: 20px;
}

.prop-sel__empty {
    padding: var(--space-3);
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    text-align: center;
}
</style>
