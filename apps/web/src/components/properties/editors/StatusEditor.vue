<script setup lang="ts">
/**
 * Status property editor.
 *
 * Behaves like `SelectEditor` but groups the options by their lifecycle
 * column (`todo` / `inProgress` / `done`) inside the popover, matching
 * the Notion-style status pill UX.
 */
import { computed, onBeforeUnmount, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import {
    PROPERTY_TYPE_PLACEHOLDERS,
    STATUS_GROUP_LABELS,
    type PropertyDefinition,
    type StatusGroupId,
    type StatusOption,
    type StatusValue,
} from '@continuum/shared';

const props = defineProps<{
    value: StatusValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: StatusValue] }>();

const options = computed(
    () => (props.definition.config as { options: StatusOption[] }).options ?? [],
);
const current = computed(() => props.value?.value ?? '');
const currentOption = computed<StatusOption | null>(
    () => options.value.find((o) => o.id === current.value) ?? null,
);

const grouped = computed<Record<StatusGroupId, StatusOption[]>>(() => {
    const out: Record<StatusGroupId, StatusOption[]> = { todo: [], inProgress: [], done: [] };
    for (const opt of options.value) {
        (out[opt.group] ?? out.todo).push(opt);
    }
    return out;
});

const open = ref(false);
const root = ref<HTMLDivElement | null>(null);

function pick(id: string): void {
    emit('update:value', { type: 'status', value: id });
    close();
}

function clear(): void {
    emit('update:value', { type: 'status', value: '' });
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

const groupOrder: StatusGroupId[] = ['todo', 'inProgress', 'done'];
</script>

<template>
    <div ref="root" class="prop-status">
        <button type="button" class="prop-status__trigger" @click="toggle">
            <span v-if="currentOption" class="prop-status__chip" :style="{ background: currentOption.color }">
                <span class="prop-status__dot" />
                {{ currentOption.label }}
            </span>
            <span v-else class="prop-status__placeholder">{{ PROPERTY_TYPE_PLACEHOLDERS.status }}</span>
            <Icon name="chevron-down" :size="12" class="prop-status__caret" />
        </button>

        <div v-if="open" class="prop-status__panel" role="listbox">
            <button v-if="currentOption" type="button" class="prop-status__row prop-status__row--clear" @click="clear">
                <span class="prop-status__check">
                    <Icon name="close" :size="11" />
                </span>
                <span class="prop-status__clear-label">Clear status</span>
            </button>

            <template v-for="g in groupOrder">
                <div v-if="grouped[g].length > 0" :key="`g-${g}`" class="prop-status__group-heading">
                    {{ STATUS_GROUP_LABELS[g] }}
                </div>
                <button v-for="opt in grouped[g]" :key="opt.id" type="button" class="prop-status__row"
                    :class="{ 'is-on': opt.id === current }" @click="pick(opt.id)">
                    <span class="prop-status__check">
                        <Icon v-if="opt.id === current" name="check" :size="12" />
                    </span>
                    <span class="prop-status__chip prop-status__chip--row" :style="{ background: opt.color }">
                        <span class="prop-status__dot" />
                        {{ opt.label }}
                    </span>
                </button>
            </template>

            <div v-if="options.length === 0" class="prop-status__empty">
                No status options. Configure them when adding the property.
            </div>
        </div>
    </div>
</template>

<style scoped>
.prop-status {
    position: relative;
    width: fit-content;
    min-width: 168px;
    max-width: min(100%, 360px);
}
.prop-status__trigger {
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
.prop-status__trigger:hover, .prop-status__trigger:focus { background: var(--bg-soft); }
.prop-status__placeholder { color: var(--fg-subtle); font-size: var(--text-sm); flex: 1; }
.prop-status__chip {
    display: inline-flex; align-items: center; gap: var(--space-2);
    height: 22px; padding: 0 var(--space-3);
    border-radius: var(--radius-sm); color: #fff;
    font-size: var(--text-xs); font-weight: var(--font-weight-semibold);
    line-height: 1; white-space: nowrap; max-width: 100%;
    overflow: hidden; text-overflow: ellipsis;
}
.prop-status__dot {
    width: 6px; height: 6px; border-radius: 50%;
    background: rgba(255, 255, 255, 0.85);
    flex-shrink: 0;
}
.prop-status__caret { margin-left: auto; color: var(--fg-subtle); flex-shrink: 0; }
.prop-status__panel {
    position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 50;
    background: var(--bg-elev); border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm); box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
    padding: var(--space-2); max-height: 280px; overflow: auto;
    display: flex; flex-direction: column; gap: 2px;
}
.prop-status__group-heading {
    padding: var(--space-2) var(--space-2) var(--space-1);
    font-size: var(--text-xs); font-weight: var(--font-weight-semibold);
    color: var(--fg-subtle); text-transform: uppercase; letter-spacing: 0.04em;
}
.prop-status__row {
    display: flex; align-items: center; gap: var(--space-2);
    background: transparent; border: none; color: var(--fg); cursor: pointer;
    padding: var(--space-2); border-radius: var(--radius-sm); text-align: left;
}
.prop-status__row:hover { background: var(--bg-soft); }
.prop-status__row--clear {
    color: var(--fg-muted);
    border-bottom: var(--border-width-1) solid var(--border);
    border-radius: 0; margin-bottom: var(--space-1); padding-bottom: var(--space-2);
}
.prop-status__check {
    display: inline-flex; align-items: center; justify-content: center;
    width: 14px; height: 14px; color: var(--fg-strong); flex-shrink: 0;
}
.prop-status__clear-label { font-size: var(--text-xs); }
.prop-status__chip--row { height: 20px; }
.prop-status__empty {
    padding: var(--space-3); color: var(--fg-subtle);
    font-size: var(--text-xs); text-align: center;
}
</style>
