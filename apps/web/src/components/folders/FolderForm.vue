<script setup lang="ts">
/**
 * FolderForm — modal form to create or edit a folder.
 *
 * Layout shell that wires together the dedicated field components:
 *   • {@link FolderKindField}   — default kind selector
 *   • {@link FolderIconField}   — icon picker
 *   • {@link FolderColorField}  — color picker
 *
 * Inheritance hints (the "(inherits: …)" placeholders shown for empty
 * optional fields) are resolved by {@link useFolderInheritancePreview}.
 */
import { computed, ref, toRef, watch } from 'vue';
import { UiButton, UiInput, UiModal } from '@/components/ui';
import { useFolders } from '@/composables/useFolders';
import { createFolder, updateFolder } from '@/composables/foldersApi';
import { useFolderInheritancePreview } from '@/composables/useFolderInheritancePreview';
import type { Folder, FolderNode } from '@continuum/shared';
import FolderKindField from './FolderKindField.vue';
import FolderIconField from './FolderIconField.vue';
import FolderColorField from './FolderColorField.vue';

const props = defineProps<{
    modelValue: boolean;
    /** Explicit caller intent; mirrors `folder !== null` but keeps attrs from falling through. */
    mode?: 'create' | 'edit';
    /** Existing folder being edited, or `null` when creating a new one. */
    folder: FolderNode | null;
    /** Parent folder id — only used when creating; ignored in edit mode. */
    parentId: string | null;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: boolean): void;
    /** Fired after the create/update API call resolves with the persisted folder. */
    (e: 'saved', folder: Folder): void;
}>();

// Touch the folder store so it's loaded — fields below depend on the tree.
useFolders();

const isEdit = computed(() => props.folder !== null);

const name = ref('');
const defaultKind = ref<string>('');
const icon = ref<string>('');
const color = ref<string>('');

const { inherited } = useFolderInheritancePreview({
    folder: toRef(props, 'folder'),
    parentId: toRef(props, 'parentId'),
});

watch(
    () => [props.modelValue, props.folder],
    ([open]) => {
        if (!open) return;
        if (props.folder) {
            name.value = props.folder.name;
            defaultKind.value = props.folder.defaultKind ?? '';
            icon.value = props.folder.icon ?? '';
            color.value = props.folder.color ?? '';
        } else {
            name.value = '';
            defaultKind.value = '';
            icon.value = '';
            color.value = '';
        }
    },
    { immediate: true },
);

function close(): void { emit('update:modelValue', false); }

const submitting = ref(false);
const error = ref<string | null>(null);

/**
 * Persists the form. In create mode this calls `createFolder` (which
 * also refreshes the local tree); in edit mode `updateFolder`. We
 * surface duplicate-slug 409s as a friendly inline message instead of
 * letting the modal close on a failed save.
 */
async function submit(): Promise<void> {
    if (!name.value.trim() || submitting.value) return;
    submitting.value = true;
    error.value = null;
    try {
        const payload = {
            name: name.value.trim(),
            defaultKind: defaultKind.value || null,
            icon: icon.value || null,
            color: color.value || null,
        };
        let saved: Folder;
        if (isEdit.value && props.folder) {
            saved = await updateFolder(props.folder.id, payload);
        } else {
            saved = await createFolder({ ...payload, parentId: props.parentId });
        }
        emit('saved', saved);
        close();
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to save folder.';
        error.value = message.includes('409') ? 'A sibling folder with that name already exists.' : message;
    } finally {
        submitting.value = false;
    }
}

const title = computed(() => (isEdit.value ? 'Edit folder' : 'New folder'));
</script>

<template>
    <UiModal :model-value="modelValue" :title="title" size="md"
        @update:model-value="(v) => emit('update:modelValue', v)">
        <form class="folder-form" @submit.prevent="submit">
            <label class="field">
                <span class="field__label">Name</span>
                <UiInput v-model="name" placeholder="e.g. Characters" autofocus required />
            </label>

            <FolderKindField v-model="defaultKind" :inherited="inherited" />

            <FolderIconField v-model="icon" :inherited="inherited" :color="color || inherited.color" />

            <FolderColorField v-model="color" :inherited="inherited" />

            <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        </form>

        <template #footer>
            <UiButton variant="ghost" size="sm" :disabled="submitting" @click="close">Cancel</UiButton>
            <UiButton variant="primary" size="sm" :disabled="!name.trim() || submitting" @click="submit">
                {{ submitting ? 'Saving…' : isEdit ? 'Save' : 'Create' }}
            </UiButton>
        </template>
    </UiModal>
</template>

<style scoped>
.folder-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
}

.field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.field__label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--fg-subtle);
    font-weight: var(--font-weight-semibold);
}

.form-error {
    margin: 0;
    color: var(--danger);
    font-size: var(--text-sm);
}
</style>
