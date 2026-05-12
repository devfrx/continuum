<script setup lang="ts">
/**
 * Relation property editor. Stores an array of note ids; uses the shared
 * `UiNotePickerModal` for selection. The list of selectable notes is
 * fetched lazily when the picker opens to avoid loading the full notes
 * table for every relation editor on screen.
 */
import { computed, ref, watch } from 'vue';
import { api } from '@/api';
import { UiNotePickerModal } from '@/components/ui';
import Icon from '@/components/ui/Icon.vue';
import type { Note, PropertyDefinition, RelationValue } from '@continuum/shared';

const props = defineProps<{
    value: RelationValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{
    'update:value': [v: RelationValue];
    select: [id: string];
}>();

const cfg = computed(
    () =>
        props.definition.config as {
            targetKinds?: string[];
            multiple?: boolean;
        },
);

const ids = computed(() => props.value?.value ?? []);

const open = ref(false);
const allNotes = ref<Note[]>([]);
const loading = ref(false);

async function ensureNotesLoaded(): Promise<void> {
    if (allNotes.value.length > 0 || loading.value) return;
    loading.value = true;
    try {
        allNotes.value = await api.notes.list();
    } finally {
        loading.value = false;
    }
}

// Eagerly load the notes list when this editor mounts with a non-empty
// selection so we can resolve linked ids → titles immediately, instead of
// waiting for the user to open the picker.
watch(
    ids,
    (next) => {
        if (next.length > 0) void ensureNotesLoaded();
    },
    { immediate: true },
);

async function openPicker(): Promise<void> {
    await ensureNotesLoaded();
    open.value = true;
}

const entries = computed(() =>
    allNotes.value
        .filter((n) => {
            const kinds = cfg.value.targetKinds;
            return !kinds || kinds.length === 0 || kinds.includes(n.kind);
        })
        .map((n) => ({ id: n.id, label: n.title || '(untitled)', kind: n.kind })),
);

const linkedNotes = computed(() =>
    ids.value
        .map((id) => allNotes.value.find((n) => n.id === id))
        .filter((n): n is Note => Boolean(n)),
);

function onSubmit(picked: string[]): void {
    emit('update:value', { type: 'relation', value: picked });
}

function remove(id: string): void {
    emit('update:value', {
        type: 'relation',
        value: ids.value.filter((x) => x !== id),
    });
}
</script>

<template>
    <div class="prop-rel">
        <div v-if="ids.length === 0" class="prop-rel__empty">
            <button type="button" class="prop-rel__btn" @click="openPicker">
                <Icon name="plus" :size="11" />
                <span>Link a note</span>
            </button>
        </div>
        <div v-else class="prop-rel__chips">
            <button v-for="n in linkedNotes" :key="n.id" type="button" class="prop-rel__chip"
                @click="emit('select', n.id)">
                <span class="prop-rel__title">{{ n.title || '(untitled)' }}</span>
                <span class="prop-rel__chip-x" @click.stop="remove(n.id)" aria-label="Remove">
                    <Icon name="close" :size="10" />
                </span>
            </button>
            <button v-if="cfg.multiple !== false" type="button" class="prop-rel__btn prop-rel__btn--inline"
                @click="openPicker">
                <Icon name="plus" :size="11" />
            </button>
        </div>

        <UiNotePickerModal v-model="open" title="Link notes" :entries="entries" :initial-selected="ids"
            :multiple="cfg.multiple !== false" confirm-label="Link" @submit="onSubmit" />
    </div>
</template>

<style scoped>
.prop-rel {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--duration-fast) var(--ease-standard);
}

.prop-rel:hover {
    background: var(--bg-soft);
}

.prop-rel__empty,
.prop-rel__chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    align-items: center;
}

.prop-rel__btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: var(--border-width-1) dashed var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg-subtle);
    padding: 2px var(--space-2);
    font-size: var(--text-xs);
    cursor: pointer;
    transition: border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.prop-rel__btn:hover {
    border-color: var(--border-strong);
    color: var(--fg);
}

.prop-rel__btn--inline {
    padding: 2px 4px;
}

.prop-rel__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--fg);
    padding: 2px var(--space-2);
    font-size: var(--text-xs);
    cursor: pointer;
    max-width: 160px;
}

.prop-rel__chip:hover {
    border-color: var(--border-strong);
}

.prop-rel__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.prop-rel__chip-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    color: var(--fg-subtle);
    border-radius: 50%;
    flex-shrink: 0;
}

.prop-rel__chip-x:hover {
    background: var(--bg-soft);
    color: var(--fg);
}
</style>
