<script setup lang="ts">
/**
 * FolderForm — modal form to create or edit a folder.
 *
 * Modality B inheritance is rendered as a placeholder on each optional
 * field: when the user leaves `defaultKind`, `icon`, or `color` empty the
 * helper text shows the value that will be inherited from the nearest
 * ancestor (`(inherits: …)`), so the user always knows what will happen
 * in absence of an explicit override.
 */
import { computed, ref, watch } from 'vue';
import {
    KIND_ICON_GROUPS,
    UiButton,
    UiIconPicker,
    UiInput,
    UiModal,
    UiSelect,
    Icon,
    type KindIconGroup,
} from '@/components/ui';
import { useKinds } from '@/composables/useKinds';
import { useFolders, ROOT_FALLBACK } from '@/composables/useFolders';
import type { Folder, FolderNode } from '@continuum/shared';

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

const folders = useFolders();
const kinds = useKinds();

const isEdit = computed(() => props.folder !== null);

const name = ref('');
const defaultKind = ref<string>('');
const icon = ref<string>('');
const color = ref<string>('');

const FOLDER_ICON_GROUPS: readonly KindIconGroup[] = [
    {
        label: 'Folders',
        icons: ['folder', 'folder-open', 'folder-with-files', 'folder-add', 'folder-favourite', 'inbox'],
    },
    ...KIND_ICON_GROUPS,
];

// Inherited preview = effective values for the parent (create) or the
// folder's parent (edit). These drive the "(inherits: …)" placeholders.
const inheritedFrom = computed<string | null>(() => {
    if (isEdit.value && props.folder) {
        return folders.byId(props.folder.id)?.parentId ?? null;
    }
    return props.parentId;
});
const inherited = computed(() => folders.effectiveFor(inheritedFrom.value) ?? ROOT_FALLBACK);

const kindOptions = computed(() => [
    { value: '', label: `(inherits: ${kinds.labelOf(inherited.value.defaultKind)})` },
    ...kinds.sorted.value.map((k) => ({ value: k.id, label: k.label })),
]);

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

function onColorPick(ev: Event): void {
    color.value = (ev.target as HTMLInputElement).value;
}

const selectedIcon = computed<string>({
    get: () => icon.value || inherited.value.icon,
    set: (value) => {
        icon.value = value === inherited.value.icon ? '' : value;
    },
});
const iconModeLabel = computed(() => (icon.value ? 'Custom icon' : 'Inherited icon'));

const submitting = ref(false);
const error = ref<string | null>(null);

/**
 * Persists the form. In create mode this calls `folders.create` (which
 * also refreshes the local tree); in edit mode `folders.update`. We
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
            saved = await folders.update(props.folder.id, payload);
        } else {
            saved = await folders.create({ ...payload, parentId: props.parentId });
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

            <label class="field">
                <span class="field__label">Default kind</span>
                <UiSelect v-model="defaultKind" :options="kindOptions"
                    @update:model-value="(v) => (defaultKind = String(v))" />
                <span class="field__hint">
                    Used when creating notes inside this folder without picking a kind.
                </span>
            </label>

            <div class="field">
                <span class="field__label">Icon</span>
                <div class="icon-row">
                    <span class="icon-preview" :style="{ color: color || inherited.color }">
                        <Icon :name="selectedIcon" :size="18" />
                    </span>
                    <span class="icon-summary">
                        <strong>{{ iconModeLabel }}</strong>
                        <span>{{ selectedIcon }}</span>
                    </span>
                    <button v-if="icon" type="button" class="color-clear" title="Clear (inherit)" @click="icon = ''">
                        <Icon name="close" :size="12" />
                    </button>
                </div>
                <UiIconPicker v-model="selectedIcon" :groups="FOLDER_ICON_GROUPS" :show-preview="false" />
                <span class="field__hint">
                    Pick an override, or clear it to inherit <code>{{ inherited.icon }}</code>.
                </span>
            </div>

            <label class="field">
                <span class="field__label">Color</span>
                <div class="color-row">
                    <input type="color" :value="color || inherited.color" class="color-swatch" @input="onColorPick" />
                    <UiInput v-model="color" :placeholder="`(inherits: ${inherited.color})`" class="color-hex" />
                    <button type="button" v-if="color" class="color-clear" title="Clear (inherit)" @click="color = ''">
                        <Icon name="close" :size="12" />
                    </button>
                </div>
            </label>

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

.field__hint {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
}

.color-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.icon-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.icon-preview {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
}

.icon-summary {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
}

.icon-summary strong {
    color: var(--fg);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
}

.icon-summary span {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.field :deep(.ui-icon-picker) {
    gap: var(--space-4);
}

.field :deep(.ui-icon-picker__grid) {
    max-height: 176px;
}

.form-error {
    margin: 0;
    color: var(--danger);
    font-size: var(--text-sm);
}

.color-swatch {
    width: 36px;
    height: 36px;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    background: transparent;
    padding: 2px;
}

.color-hex {
    flex: 1;
}

.color-clear {
    appearance: none;
    background: transparent;
    border: var(--border-width-1) solid var(--border);
    color: var(--fg-muted);
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.color-clear:hover {
    color: var(--fg);
    background: var(--bg-soft);
}
</style>
