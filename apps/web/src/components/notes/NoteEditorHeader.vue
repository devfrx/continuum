<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { UiChip, UiSegmented, UiSelect, Icon } from '@/components/ui';
import { FolderBreadcrumb } from '@/components/folders';
import { useKinds } from '@/composables/useKinds';
import type { EntityKind } from '@continuum/shared';

type EditorMode = 'wysiwyg' | 'markdown';

const props = defineProps<{
    title: string;
    kind: EntityKind;
    tags: string[];
    /** Folder this note lives in; `null` = root ("Inbox"). */
    folderId: string | null;
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
    (e: 'navigate-folder', folderId: string | null): void;
    (e: 'delete'): void;
}>();

const kindStore = useKinds();
onMounted(() => { void kindStore.load(); });

const kindOptions = computed(() =>
    kindStore.sorted.value.map((k) => ({ value: k.id, label: k.label })),
);
const modeOptions = [
    { value: 'wysiwyg', label: 'WYSIWYG' },
    { value: 'markdown', label: 'Source' },
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
        <FolderBreadcrumb :folder-id="folderId" class="header-breadcrumb"
            @select="(id) => emit('navigate-folder', id)" />

        <input class="title-input" :value="title" placeholder="Untitled" spellcheck="false"
            @input="emit('update:title', ($event.target as HTMLInputElement).value)" />

        <div class="meta-row">
            <div class="meta-left">
                <div class="kind-chip" :style="{ '--kind-color': kindStore.colorOf(kind) }">
                    <span class="kind-dot" :style="{ background: kindStore.colorOf(kind) }" />
                    <UiSelect :model-value="kind" :options="kindOptions" variant="bare" class="kind-select"
                        @update:model-value="(v: string | number) => emit('update:kind', String(v) as EntityKind)" />
                </div>

                <div class="tags-inline">
                    <UiChip v-for="t in tags" :key="t" closable @close="removeTag(t)">#{{ t }}</UiChip>
                    <input v-model="tagDraft" class="tag-input" placeholder="add tag…" @keydown.enter.prevent="addTag"
                        @keydown.,.prevent="addTag" />
                </div>
            </div>

            <div class="meta-right">
                <span class="status" :class="{ saving }" :title="savedLabel">
                    <span class="status-dot" />
                    <span class="status-label">{{ savedLabel }}</span>
                </span>

                <span class="meta-divider" aria-hidden="true" />

                <UiSegmented :model-value="editorMode" :options="modeOptions" aria-label="Editor mode"
                    class="mode-segmented"
                    @update:model-value="(v: string) => emit('update:editorMode', v as EditorMode)" />

                <button type="button" class="delete-btn" :title="'Delete note'" aria-label="Delete note"
                    @click="emit('delete')">
                    <Icon name="trash" :size="15" />
                </button>
            </div>
        </div>
    </header>
</template>

<style scoped>
/**
 * Editor header.
 *
 * Layout principle: every control in the meta-row is normalised to a single
 * shared height (`--ctrl-h: 28px`) so the dot, kind chip, tag chips, status
 * pill, segmented toggle, and delete button all sit on the same baseline.
 * The left cluster groups identity (kind + tags); the right cluster groups
 * editor state (save status + mode + destructive action) with one slim
 * divider between status and the segmented control.
 */
.editor-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding-bottom: var(--space-5);
    border-bottom: var(--border-width-1) solid var(--border);

    /* Single source of truth for control height in this header. */
    --ctrl-h: 28px;
}

.title-input {
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg-strong);
    font-size: var(--text-2xl);
    font-weight: var(--font-weight-semibold);
    letter-spacing: var(--tracking-tight);
    padding: 0;
    line-height: var(--leading-tight);
    width: 100%;
}

.header-breadcrumb {
    margin-bottom: calc(var(--space-1) * -1);
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
    gap: var(--space-3);
    min-height: var(--ctrl-h);
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
    height: 16px;
    background: var(--border);
    flex-shrink: 0;
}

/* ── Kind chip ───────────────────────────────────────────────────── */
.kind-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    padding: 0 var(--space-1) 0 var(--space-3);
    height: var(--ctrl-h);
    font-size: var(--text-sm);
    transition: border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard);
}

.kind-chip:hover,
.kind-chip:focus-within {
    border-color: var(--border-strong);
    background: var(--bg-elevated);
}

.kind-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-circle);
    display: inline-block;
    flex-shrink: 0;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--kind-color, var(--accent)) 18%, transparent);
}

/**
 * The kind selector is a `bare` UiSelect embedded in the chip. The chip
 * provides border + bg; the trigger inside should add only its own
 * label + chevron padding so the two surfaces don't double up.
 */
.kind-select {
    width: auto;
}

.kind-select :deep(.ui-select__trigger) {
    padding: 0 var(--space-2) 0 0;
    height: calc(var(--ctrl-h) - 4px);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    color: var(--fg-strong);
    text-transform: capitalize;
}

.kind-select :deep(.ui-select__trigger:hover),
.kind-select :deep(.ui-select.is-open .ui-select__trigger) {
    background: transparent;
}

/* ── Tags ────────────────────────────────────────────────────────── */
.tags-inline {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--ctrl-h);
}

.tag-input {
    background: transparent;
    border: none;
    outline: none;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--fg);
    width: 110px;
    height: var(--ctrl-h);
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.tag-input:hover {
    background: var(--bg-soft);
}

.tag-input:focus {
    background: var(--bg-soft);
}

.tag-input::placeholder {
    color: var(--fg-subtle);
}

/* ── Save status ─────────────────────────────────────────────────── */
.status {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--ctrl-h);
    padding: 0 var(--space-2);
    font-size: var(--text-xs);
    color: var(--fg-muted);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    font-weight: var(--font-weight-medium);
    letter-spacing: var(--tracking-wide);
}

.status-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-circle);
    background: var(--success);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--success) 22%, transparent);
    flex-shrink: 0;
}

.status.saving {
    color: var(--accent);
}

.status.saving .status-dot {
    background: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 22%, transparent);
    animation: pulse 1.2s ease-in-out infinite;
}

.status-label {
    line-height: 1;
}

@keyframes pulse {

    0%,
    100% {
        opacity: 0.45;
    }

    50% {
        opacity: 1;
    }
}

/* ── Segmented toggle ────────────────────────────────────────────── */
.mode-segmented {
    /* Drive UiSegmented's intrinsic height via its public custom prop. */
    --ui-seg-h: var(--ctrl-h);
}

/* ── Delete (icon-only ghost) ────────────────────────────────────── */
.delete-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--ctrl-h);
    height: var(--ctrl-h);
    padding: 0;
    background: transparent;
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    color: var(--fg-subtle);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.delete-btn:hover {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    border-color: color-mix(in srgb, var(--danger) 28%, transparent);
    color: var(--danger);
}

.delete-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
    color: var(--danger);
}
</style>
