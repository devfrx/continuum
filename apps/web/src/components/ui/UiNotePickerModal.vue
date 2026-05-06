<script setup lang="ts">
/**
 * Reusable note-picker modal — search through every node in a graph and
 * select one or more by checkbox. Emits the chosen ids via `submit`.
 *
 * Used by GraphView's "Link to note(s)…" action. Designed to be generic
 * enough that other features (bulk-tag, bulk-move, etc.) can reuse it.
 */
import { computed, ref, watch } from 'vue';
import UiModal from './UiModal.vue';
import UiButton from './UiButton.vue';
import UiInput from './UiInput.vue';
import UiBadge from './UiBadge.vue';
import Icon from './Icon.vue';

export interface NotePickerEntry {
    id: string;
    label: string;
    kind?: string;
    /** Disable selection on this row (e.g. the source node itself). */
    disabled?: boolean;
}

const props = withDefaults(
    defineProps<{
        modelValue: boolean;
        title?: string;
        /** Full list of selectable notes. */
        entries: NotePickerEntry[];
        /** Initial selection (note ids). */
        initialSelected?: string[];
        /** Allow picking multiple notes at once. */
        multiple?: boolean;
        confirmLabel?: string;
    }>(),
    {
        title: 'Select notes',
        initialSelected: () => [],
        multiple: true,
        confirmLabel: 'Confirm',
    },
);

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    submit: [ids: string[]];
}>();

const query = ref('');
const selected = ref<Set<string>>(new Set());

watch(
    () => props.modelValue,
    (open) => {
        if (open) {
            query.value = '';
            selected.value = new Set(props.initialSelected);
        }
    },
);

const filtered = computed<NotePickerEntry[]>(() => {
    const q = query.value.trim().toLowerCase();
    if (!q) return props.entries;
    return props.entries.filter((e) => e.label.toLowerCase().includes(q));
});

function toggle(id: string, disabled?: boolean): void {
    if (disabled) return;
    if (props.multiple) {
        const next = new Set(selected.value);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selected.value = next;
    } else {
        selected.value = new Set([id]);
    }
}

function close(): void {
    emit('update:modelValue', false);
}

function submit(): void {
    if (selected.value.size === 0) return;
    emit('submit', Array.from(selected.value));
    close();
}
</script>

<template>
    <UiModal :modelValue="modelValue" :title="title" size="md" @update:modelValue="emit('update:modelValue', $event)">
        <div class="np-body">
            <UiInput v-model="query" size="sm" placeholder="Search notes…" />
            <div class="np-list" role="listbox">
                <button v-for="entry in filtered" :key="entry.id" type="button" class="np-row" :class="{
                    'is-selected': selected.has(entry.id),
                    'is-disabled': entry.disabled,
                }" :disabled="entry.disabled" @click="toggle(entry.id, entry.disabled)">
                    <span class="np-row__check">
                        <Icon v-if="selected.has(entry.id)" name="check" :size="12" />
                    </span>
                    <span class="np-row__label">{{ entry.label || '(untitled)' }}</span>
                    <UiBadge v-if="entry.kind" tone="neutral">{{ entry.kind }}</UiBadge>
                </button>
                <div v-if="filtered.length === 0" class="np-empty">No matches.</div>
            </div>
            <div class="np-footer-meta">
                <span>{{ selected.size }} selected</span>
            </div>
        </div>

        <template #footer>
            <UiButton variant="ghost" size="sm" @click="close">Cancel</UiButton>
            <UiButton variant="primary" size="sm" :disabled="selected.size === 0" @click="submit">
                {{ confirmLabel }}
            </UiButton>
        </template>
    </UiModal>
</template>

<style scoped>
.np-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
}

.np-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 360px;
    overflow-y: auto;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
}

.np-row {
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-3) var(--space-5);
    border-radius: var(--radius-xs);
    background: transparent;
    border: none;
    text-align: left;
    cursor: pointer;
    font-size: var(--text-base);
    color: var(--fg);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.np-row:hover {
    background: var(--bg-elev);
}

.np-row.is-selected {
    background: var(--accent-soft);
}

.np-row.is-disabled {
    opacity: 0.4;
    cursor: not-allowed;
}

.np-row__check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-xs);
    border: 1.5px solid var(--border-strong);
    color: var(--fg-on-accent);
    flex-shrink: 0;
}

.np-row.is-selected .np-row__check {
    background: var(--accent);
    border-color: var(--accent);
}

.np-row__label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.np-empty {
    padding: var(--space-8);
    text-align: center;
    color: var(--fg-subtle);
    font-size: var(--text-sm);
}

.np-footer-meta {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
}
</style>
