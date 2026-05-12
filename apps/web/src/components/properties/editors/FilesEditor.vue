<script setup lang="ts">
/**
 * Files & media property editor.
 *
 * Renders a chip list of attached files plus a drop-zone / pick button.
 * Files are uploaded one-by-one through `api.uploads.create` and the
 * resulting `FileRef`s are appended to the value. Removing a file deletes
 * it from disk so we don't leak storage on dangling references.
 */
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { api } from '@/api';
import type { FileRef, FilesValue, PropertyDefinition } from '@continuum/shared';

const props = defineProps<{
    value: FilesValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: FilesValue] }>();

const files = computed<FileRef[]>(() => props.value?.value ?? []);

const inputEl = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const error = ref<string | null>(null);
const dragOver = ref(false);

function trigger(): void {
    inputEl.value?.click();
}

async function uploadAll(list: FileList | File[]): Promise<void> {
    const arr = Array.from(list);
    if (arr.length === 0) return;
    uploading.value = true;
    error.value = null;
    try {
        const next: FileRef[] = [...files.value];
        for (const file of arr) {
            const ref = await api.uploads.create(file);
            next.push(ref);
        }
        emit('update:value', { type: 'files', value: next });
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Upload failed';
    } finally {
        uploading.value = false;
        if (inputEl.value) inputEl.value.value = '';
    }
}

function onPick(e: Event): void {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length) void uploadAll(input.files);
}

function onDrop(e: DragEvent): void {
    e.preventDefault();
    dragOver.value = false;
    if (e.dataTransfer?.files?.length) void uploadAll(e.dataTransfer.files);
}

async function remove(id: string): Promise<void> {
    const next = files.value.filter((f) => f.id !== id);
    emit('update:value', { type: 'files', value: next });
    // Best-effort cleanup; ignore failures (e.g. file already removed).
    try {
        await api.uploads.remove(id);
    } catch {
        /* swallowed */
    }
}

function isImage(ref: FileRef): boolean {
    return ref.mime.startsWith('image/');
}
</script>

<template>
    <div class="prop-files" :class="{ 'is-drag': dragOver }"
        @dragenter.prevent="dragOver = true"
        @dragover.prevent="dragOver = true"
        @dragleave.prevent="dragOver = false"
        @drop="onDrop">
        <ul v-if="files.length > 0" class="prop-files__list">
            <li v-for="f in files" :key="f.id" class="prop-files__chip">
                <a :href="f.url" target="_blank" rel="noopener" class="prop-files__chip-link">
                    <Icon :name="isImage(f) ? 'image' : 'file'" :size="12" />
                    <span class="prop-files__name" :title="f.name">{{ f.name }}</span>
                </a>
                <button type="button" class="prop-files__remove" :aria-label="`Remove ${f.name}`"
                    @click.stop="remove(f.id)">
                    <Icon name="close" :size="10" />
                </button>
            </li>
        </ul>
        <button type="button" class="prop-files__add" :disabled="uploading" @click="trigger">
            <Icon name="plus" :size="12" />
            <span>{{ uploading ? 'Uploading…' : files.length === 0 ? 'Add file' : 'Add' }}</span>
        </button>
        <input ref="inputEl" type="file" class="prop-files__input" multiple @change="onPick" />
        <p v-if="error" class="prop-files__error">{{ error }}</p>
    </div>
</template>

<style scoped>
.prop-files {
    display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--duration-fast) var(--ease-standard);
    width: 100%;
}
.prop-files:hover { background: var(--bg-soft); }
.prop-files.is-drag {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    outline: 1px dashed var(--accent);
}
.prop-files__list {
    list-style: none; padding: 0; margin: 0;
    display: flex; flex-wrap: wrap; gap: var(--space-2);
}
.prop-files__chip {
    display: inline-flex; align-items: center; gap: var(--space-1);
    padding: 2px 2px 2px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
    font-size: var(--text-xs); color: var(--fg);
    max-width: 220px;
}
.prop-files__chip-link {
    display: inline-flex; align-items: center; gap: var(--space-1);
    color: inherit; text-decoration: none; min-width: 0;
}
.prop-files__chip-link:hover { color: var(--accent); }
.prop-files__name {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    max-width: 160px;
}
.prop-files__remove {
    display: inline-flex; align-items: center; justify-content: center;
    width: 16px; height: 16px; border-radius: 4px;
    border: none; background: transparent; color: var(--fg-subtle);
    cursor: pointer;
}
.prop-files__remove:hover { background: var(--bg); color: var(--fg-strong); }
.prop-files__add {
    display: inline-flex; align-items: center; gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm); border: var(--border-width-1) dashed var(--border);
    background: transparent; color: var(--fg-muted); cursor: pointer;
    font-size: var(--text-xs);
}
.prop-files__add:hover:not(:disabled) { background: var(--bg-soft); color: var(--fg); }
.prop-files__add:disabled { opacity: 0.6; cursor: progress; }
.prop-files__input { display: none; }
.prop-files__error {
    width: 100%; margin: 0; font-size: var(--text-xs); color: var(--danger, #ef4444);
}
</style>
