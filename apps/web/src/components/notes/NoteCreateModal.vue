<script setup lang="ts">
/**
 * NoteCreateModal — focused creation flow shared by Notes and Graph.
 *
 * New notes inherit the active folder's effective kind by default, while
 * still letting the user override kind, destination and starter content
 * before the note row exists. That keeps creation intentional instead of
 * dropping anonymous "Untitled" records into the workspace.
 */
import { computed, ref, watch } from 'vue';
import type { EntityKind } from '@continuum/shared';
import { Icon, UiButton, UiInput, UiModal, UiSelect, UiTextarea } from '@/components/ui';
import { useFolders } from '@/composables/useFolders';
import { useKinds } from '@/composables/useKinds';

interface CreateNotePayload {
    title: string;
    kind: EntityKind;
    content: string;
    folderId: string | null;
}

const props = withDefaults(defineProps<{
    modelValue: boolean;
    defaultFolderId?: string | null;
    busy?: boolean;
    context?: 'notes' | 'graph';
    error?: string;
}>(), {
    defaultFolderId: null,
    busy: false,
    context: 'notes',
    error: '',
});

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    submit: [payload: CreateNotePayload];
}>();

const folders = useFolders();
const kinds = useKinds();

const title = ref('');
const kind = ref<EntityKind>('note');
const folderId = ref('');
const content = ref('');

const kindOptions = computed(() => kinds.sorted.value.map((k) => ({ value: k.id, label: k.label })));
const folderOptions = computed(() => [
    { value: '', label: 'Inbox' },
    ...folders.flat.value.map((folder) => ({
        value: folder.id,
        label: folders.breadcrumb(folder.id).map((part) => part.name).join(' / '),
    })),
]);

const destinationLabel = computed(() =>
    folderId.value ? folders.breadcrumb(folderId.value).map((part) => part.name).join(' / ') || 'Inbox' : 'Inbox',
);
const kindLabel = computed(() => kinds.labelOf(kind.value));
const modalTitle = computed(() => props.context === 'graph' ? 'New graph node' : 'New note');
const contextLabel = computed(() => props.context === 'graph' ? 'Graph node' : 'Notebook entry');
const titlePlaceholder = computed(() => props.context === 'graph' ? 'Node title' : 'Note title');

function reset(): void {
    folderId.value = props.defaultFolderId ?? '';
    const effective = folders.effectiveFor(folderId.value || null);
    kind.value = effective.defaultKind as EntityKind;
    title.value = '';
    content.value = '';
}

watch(
    () => props.modelValue,
    async (open) => {
        if (!open) return;
        await Promise.all([folders.load(), kinds.load()]);
        reset();
    },
);

watch(folderId, (next) => {
    kind.value = folders.effectiveFor(next || null).defaultKind as EntityKind;
});

function close(): void {
    if (!props.busy) emit('update:modelValue', false);
}

function submit(): void {
    const cleanTitle = title.value.trim();
    if (!cleanTitle || props.busy) return;
    emit('submit', {
        title: cleanTitle,
        kind: kind.value,
        content: content.value.trim(),
        folderId: folderId.value || null,
    });
}
</script>

<template>
    <UiModal :model-value="modelValue" :title="modalTitle" size="md" :persistent="busy"
        @update:model-value="(value) => emit('update:modelValue', value)">
        <form class="note-create" @submit.prevent="submit">
            <div class="intent-card">
                <span class="intent-mark">
                    <Icon :name="context === 'graph' ? 'graph' : 'notes'" :size="16" />
                </span>
                <span class="intent-copy">
                    <strong>{{ contextLabel }}</strong>
                    <span>{{ destinationLabel }} / {{ kindLabel }}</span>
                </span>
            </div>

            <label class="field field-title">
                <span>Title</span>
                <UiInput v-model="title" :placeholder="titlePlaceholder" size="md" />
            </label>

            <div class="field-grid">
                <label class="field">
                    <span>Kind</span>
                    <UiSelect v-model="kind" :options="kindOptions" />
                </label>
                <label class="field">
                    <span>Folder</span>
                    <UiSelect v-model="folderId" :options="folderOptions" />
                </label>
            </div>

            <label class="field">
                <span>Opening text</span>
                <UiTextarea v-model="content" placeholder="Optional first thought…" :rows="4" />
            </label>

            <p v-if="error" class="form-error" role="alert">
                <Icon name="warning" :size="14" />
                <span>{{ error }}</span>
            </p>
        </form>
        <template #footer>
            <UiButton variant="ghost" size="sm" :disabled="busy" @click="close">Cancel</UiButton>
            <UiButton variant="primary" size="sm" :disabled="!title.trim() || busy" @click="submit">
                <template #icon-left>
                    <Icon name="plus" :size="13" />
                </template>
                {{ busy ? 'Creating…' : 'Create' }}
            </UiButton>
        </template>
    </UiModal>
</template>

<style scoped>
.note-create {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
}

.intent-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    color: var(--fg);
    font-size: var(--text-sm);
}

.intent-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--accent);
    flex: 0 0 auto;
}

.intent-copy {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
}

.intent-copy strong {
    color: var(--fg-strong);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
}

.intent-copy span {
    color: var(--fg-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.field,
.field-grid {
    min-width: 0;
}

.field {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.field>span {
    color: var(--fg-muted);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
}

.field-title :deep(input) {
    font-size: var(--text-md);
    font-weight: var(--font-weight-semibold);
}

.field-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-5);
}

.form-error {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-width-1) solid var(--danger);
    border-radius: var(--radius-sm);
    color: var(--fg-strong);
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    font-size: var(--text-sm);
}

.form-error :deep(svg) {
    color: var(--danger);
    flex: 0 0 auto;
    margin-top: 2px;
}
</style>