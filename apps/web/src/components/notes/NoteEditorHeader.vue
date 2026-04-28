<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { UiButton, UiChip, UiSegmented, UiSelect, Icon } from '@/components/ui';
import { useKinds } from '@/composables/useKinds';
import type { EntityKind } from '@continuum/shared';

type EditorMode = 'wysiwyg' | 'markdown';

const props = defineProps<{
    title: string;
    kind: EntityKind;
    tags: string[];
    editorMode: EditorMode;
    savedAt: number | null;
    saving: boolean;
    nowTick: number;
}>();

const emit = defineEmits<{
    (e: 'update:title', value: string): void;
    (e: 'update:kind', value: EntityKind): void;
    (e: 'update:tags', value: string[]): void;
    (e: 'update:editorMode', value: EditorMode): void;
    (e: 'delete'): void;
}>();

const kindStore = useKinds();
onMounted(() => { void kindStore.load(); });

const kindOptions = computed(() =>
    kindStore.sorted.value.map((k) => ({ value: k.id, label: k.label })),
);
const modeOptions = [
    { value: 'wysiwyg', label: 'WYSIWYG' },
    { value: 'markdown', label: 'Markdown' },
];

const tagDraft = ref('');

const savedLabel = computed<string>(() => {
    if (props.saving) return 'Saving…';
    if (!props.savedAt) return 'Not saved yet';
    const diff = Math.max(0, Math.floor((props.nowTick - props.savedAt) / 1000));
    if (diff < 5) return 'Saved · just now';
    if (diff < 60) return `Saved · ${diff}s ago`;
    const m = Math.floor(diff / 60);
    if (m < 60) return `Saved · ${m}m ago`;
    const h = Math.floor(m / 60);
    return `Saved · ${h}h ago`;
});

function addTag(): void {
    const t = tagDraft.value.trim();
    if (!t) return;
    if (!props.tags.includes(t)) emit('update:tags', [...props.tags, t]);
    tagDraft.value = '';
}
function removeTag(tag: string): void {
    emit('update:tags', props.tags.filter((t) => t !== tag));
}
</script>

<template>
    <header class="editor-header">
        <input class="title-input" :value="title" placeholder="Untitled" spellcheck="false"
            @input="emit('update:title', ($event.target as HTMLInputElement).value)" />

        <div class="meta-row">
            <div class="meta-left">
                <div class="kind-chip" :style="{ '--kind-color': kindStore.colorOf(kind) }">
                    <span class="dot" :style="{ background: kindStore.colorOf(kind) }" />
                    <UiSelect :model-value="kind" :options="kindOptions" class="kind-select"
                        @update:model-value="(v: string | number) => emit('update:kind', String(v) as EntityKind)" />
                </div>

                <span class="meta-divider" aria-hidden="true" />

                <div class="tags-inline">
                    <UiChip v-for="t in tags" :key="t" closable @close="removeTag(t)">#{{ t }}</UiChip>
                    <input v-model="tagDraft" class="tag-input" placeholder="add tag…" @keydown.enter.prevent="addTag"
                        @keydown.,.prevent="addTag" />
                </div>
            </div>

            <div class="meta-right">
                <span class="status" :class="{ saving }">
                    <span class="status-dot" />{{ savedLabel }}
                </span>

                <UiSegmented :model-value="editorMode" :options="modeOptions" aria-label="Editor mode"
                    @update:model-value="(v: string) => emit('update:editorMode', v as EditorMode)" />

                <UiButton variant="ghost" size="sm" class="delete-btn" @click="emit('delete')" aria-label="Delete note">
                    <template #icon-left>
                        <Icon name="trash" :size="14" />
                    </template>
                    Delete
                </UiButton>
            </div>
        </div>
    </header>
</template>

<style scoped>
.editor-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-bottom: var(--space-5);
    border-bottom: var(--border-width-1) solid var(--border);
}

.title-input {
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg-strong);
    font-size: var(--text-3xl);
    font-weight: var(--font-weight-semibold);
    letter-spacing: var(--tracking-tight);
    padding: 0;
    line-height: var(--leading-tight);
    width: 100%;
}

.title-input::placeholder {
    color: var(--fg-subtle);
}

.title-input:focus-visible {
    outline: none;
}

.meta-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
}

.meta-left,
.meta-right {
    display: inline-flex;
    align-items: center;
    flex-wrap: wrap;
    gap: var(--space-3);
}

.meta-right {
    margin-left: auto;
}

.meta-divider {
    width: 1px;
    height: 18px;
    background: var(--border);
}

.kind-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px var(--space-3) 2px var(--space-3);
    font-size: var(--text-sm);
    height: 26px;
    transition: border-color var(--duration-fast) var(--ease-standard);
}

.kind-chip:hover {
    border-color: var(--border-strong);
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-circle);
    display: inline-block;
    flex-shrink: 0;
}

.tags-inline {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
}

.tag-input {
    background: transparent;
    border: none;
    outline: none;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--fg);
    width: 110px;
    padding: 2px 0;
}

.tag-input::placeholder {
    color: var(--fg-subtle);
}

.kind-select {
    width: auto;
    border: none;
    background: transparent;
    box-shadow: none;
}

.kind-select :deep(select) {
    padding: 0 var(--space-7) 0 0;
    font-size: var(--text-sm);
    text-transform: capitalize;
    background: transparent;
    border: none;
    height: 22px;
    font-weight: var(--font-weight-medium);
}

.status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-circle);
    background: var(--success);
}

.status.saving .status-dot {
    background: var(--accent);
    animation: pulse 1.2s ease-in-out infinite;
}

@keyframes pulse {

    0%,
    100% {
        opacity: 0.4;
    }

    50% {
        opacity: 1;
    }
}

.delete-btn {
    color: var(--fg-muted);
}

.delete-btn:hover {
    color: var(--danger);
}
</style>
