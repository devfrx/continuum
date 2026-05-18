<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { UiChip, UiSegmented, UiSelect, Icon } from '@/components/ui';
import { FolderBreadcrumb } from '@/components/folders';
import { useKinds } from '@/composables/useKinds';
import { api } from '@/api';
import type { EntityKind } from '@continuum/shared';

type EditorMode = 'wysiwyg' | 'markdown';

const props = defineProps<{
    title: string;
    kind: EntityKind;
    tags: string[];
    /** Folder this note lives in; `null` = root ("Inbox"). */
    folderId: string | null;
    editorMode: EditorMode;
    fullWidth: boolean;
    /** When true, the note is finalized: editing is disabled across the header. */
    locked: boolean;
    /**
     * Optional cover image (relative `/uploads/...` or absolute URL).
     * `null` = no cover. Shown above the breadcrumb/title strip and
     * mirrored by Gallery views.
     */
    coverImage: string | null;
    savedAt: number | null;
    saving: boolean;
    nowTick: number;
}>();

const emit = defineEmits<{
    (e: 'update:title', value: string): void;
    (e: 'update:kind', value: EntityKind): void;
    (e: 'update:tags', value: string[]): void;
    (e: 'update:editorMode', value: EditorMode): void;
    (e: 'update:fullWidth', value: boolean): void;
    (e: 'update:locked', value: boolean): void;
    (e: 'update:coverImage', value: string | null): void;
    (e: 'navigate-folder', folderId: string | null): void;
    (e: 'delete'): void;
    (e: 'apply-template'): void;
    (e: 'save-as-template'): void;
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

const widthToggleLabel = computed(() =>
    props.fullWidth ? 'Use reading width' : 'Use full width',
);
const widthToggleIcon = computed(() => (props.fullWidth ? 'minimize' : 'maximize'));

const lockToggleLabel = computed(() =>
    props.locked ? 'Unlock note (allow edits)' : 'Lock note (mark as finalized)',
);
const lockIcon = computed(() => (props.locked ? 'lock' : 'lock-open'));

const tagDraft = ref('');

const savedLabel = computed<string>(() => {
    if (props.locked) return 'Locked';
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
    if (props.locked) return;
    const t = tagDraft.value.trim();
    if (!t) return;
    if (!props.tags.includes(t)) emit('update:tags', [...props.tags, t]);
    tagDraft.value = '';
}
function removeTag(tag: string): void {
    if (props.locked) return;
    emit('update:tags', props.tags.filter((t) => t !== tag));
}

// ── Cover image ──────────────────────────────────────────────────────────
// Universal per-note cover affordance. Stored on the note itself
// (`notes.cover_image`) so every view that renders a note can pick it up
// (editor header, Gallery cards, future page-link previews). Uploading
// reuses `api.uploads.create` — same path as inline image insertion.
const coverInputRef = ref<HTMLInputElement | null>(null);
const coverBusy = ref(false);
const coverError = ref<string | null>(null);

function triggerCoverPick(): void {
    if (props.locked || coverBusy.value) return;
    coverInputRef.value?.click();
}

async function onCoverFileChosen(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-uploading the same file
    if (!file) return;
    coverError.value = null;
    coverBusy.value = true;
    try {
        const ref = await api.uploads.create(file);
        emit('update:coverImage', ref.url ?? null);
    } catch (err) {
        coverError.value = err instanceof Error ? err.message : 'Upload failed';
    } finally {
        coverBusy.value = false;
    }
}

function removeCover(): void {
    if (props.locked) return;
    emit('update:coverImage', null);
}
</script>

<template>
    <header class="editor-header" :class="{ 'is-locked': locked, 'has-cover': !!coverImage }">
        <input ref="coverInputRef" type="file" accept="image/*" hidden @change="onCoverFileChosen" />

        <div v-if="coverImage" class="cover" :style="{ backgroundImage: `url('${coverImage}')` }">
            <div v-if="!locked" class="cover__actions">
                <button type="button" class="cover__btn" :disabled="coverBusy" @click="triggerCoverPick">
                    <Icon name="edit" :size="12" />
                    <span>{{ coverBusy ? 'Uploading…' : 'Change cover' }}</span>
                </button>
                <button type="button" class="cover__btn cover__btn--danger" @click="removeCover">
                    <Icon name="trash" :size="12" />
                    <span>Remove</span>
                </button>
            </div>
        </div>
        <div v-else-if="!locked" class="cover-add">
            <button type="button" class="cover-add__btn" :disabled="coverBusy" @click="triggerCoverPick">
                <Icon name="plus" :size="12" />
                <span>{{ coverBusy ? 'Uploading…' : 'Add cover' }}</span>
            </button>
            <span v-if="coverError" class="cover-add__error">{{ coverError }}</span>
        </div>

        <FolderBreadcrumb :folder-id="folderId" class="header-breadcrumb"
            @select="(id) => emit('navigate-folder', id)" />

        <input class="title-input" :value="title" placeholder="Untitled" spellcheck="false" :readonly="locked"
            @input="emit('update:title', ($event.target as HTMLInputElement).value)" />

        <div class="meta-row">
            <div class="meta-left">
                <div class="kind-chip" :style="{ '--kind-color': kindStore.colorOf(kind) }">
                    <span class="kind-dot" :style="{ background: kindStore.colorOf(kind) }" />
                    <UiSelect :model-value="kind" :options="kindOptions" variant="bare" class="kind-select"
                        :disabled="locked"
                        @update:model-value="(v: string | number) => emit('update:kind', String(v) as EntityKind)" />
                </div>

                <div class="tags-inline">
                    <UiChip v-for="t in tags" :key="t" :closable="!locked" @close="removeTag(t)">#{{ t }}</UiChip>
                    <input v-if="!locked" v-model="tagDraft" class="tag-input" placeholder="add tag…"
                        @keydown.enter.prevent="addTag" @keydown.,.prevent="addTag" />
                </div>
            </div>

            <div class="meta-right">
                <span class="status" :class="{ saving, locked }" :title="savedLabel">
                    <span class="status-dot" />
                    <span class="status-label">{{ savedLabel }}</span>
                </span>

                <template v-if="!locked">
                    <span class="meta-divider" aria-hidden="true" />

                    <UiSegmented :model-value="editorMode" :options="modeOptions" aria-label="Editor mode"
                        class="mode-segmented"
                        @update:model-value="(v: string) => emit('update:editorMode', v as EditorMode)" />
                </template>

                <button type="button" class="width-btn" :class="{ 'is-active': fullWidth }"
                    :title="widthToggleLabel" :aria-label="widthToggleLabel" :aria-pressed="fullWidth"
                    @click="emit('update:fullWidth', !fullWidth)">
                    <Icon :name="widthToggleIcon" :size="15" />
                </button>

                <button type="button" class="lock-btn" :class="{ 'is-active': locked }" :title="lockToggleLabel"
                    :aria-label="lockToggleLabel" :aria-pressed="locked"
                    @click="emit('update:locked', !locked)">
                    <Icon :name="lockIcon" :size="15" />
                </button>

                <button type="button" class="width-btn" title="Apply template" aria-label="Apply template"
                    :disabled="locked" @click="emit('apply-template')">
                    <Icon name="templates" :size="15" />
                </button>

                <button type="button" class="width-btn" title="Save as template" aria-label="Save as template"
                    @click="emit('save-as-template')">
                    <Icon name="save" :size="15" />
                </button>

                <button type="button" class="delete-btn" :title="locked ? 'Unlock note to delete' : 'Delete note'"
                    aria-label="Delete note" :disabled="locked" @click="emit('delete')">
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

/* ── Icon-only actions ───────────────────────────────────────────── */
.width-btn,
.lock-btn,
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

.width-btn:hover,
.width-btn.is-active,
.lock-btn:hover {
    background: var(--bg-soft);
    border-color: var(--border);
    color: var(--fg);
}

.lock-btn.is-active {
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    border-color: color-mix(in srgb, var(--accent) 32%, transparent);
    color: var(--accent);
}

.width-btn:focus-visible,
.lock-btn:focus-visible,
.delete-btn:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
}

.delete-btn:hover:not(:disabled) {
    background: color-mix(in srgb, var(--danger) 12%, transparent);
    border-color: color-mix(in srgb, var(--danger) 28%, transparent);
    color: var(--danger);
}

.delete-btn:focus-visible {
    color: var(--danger);
}

.delete-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}

/* ── Locked editor surface ───────────────────────────────────────── */
.editor-header.is-locked .title-input {
    color: var(--fg-muted);
    cursor: default;
}

.editor-header.is-locked .tag-input {
    display: none;
}

.status.locked .status-dot {
    background: var(--accent);
}

/* ── Cover image ─────────────────────────────────────────────────────── */
.cover {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 1;
    max-height: 260px;
    border-radius: var(--radius-md, 6px);
    background-size: cover;
    background-position: center;
    background-color: var(--surface-hover, rgba(255, 255, 255, 0.04));
    margin-bottom: var(--space-3, 0.5rem);
}

.cover__actions {
    position: absolute;
    right: 0.6rem;
    bottom: 0.6rem;
    display: flex;
    gap: 0.35rem;
    opacity: 0;
    transition: opacity 0.12s ease;
}

.cover:hover .cover__actions {
    opacity: 1;
}

.cover__btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.55rem;
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.12));
    background: rgba(0, 0, 0, 0.55);
    color: var(--fg, #ededed);
    border-radius: 4px;
    font-size: 0.75rem;
    cursor: pointer;
    backdrop-filter: blur(4px);
}

.cover__btn:hover:not(:disabled) {
    background: rgba(0, 0, 0, 0.75);
}

.cover__btn--danger:hover:not(:disabled) {
    color: var(--danger, #b85c5c);
}

.cover-add {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: var(--space-2, 0.35rem);
}

.cover-add__btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.25rem 0.5rem;
    border: none;
    background: transparent;
    color: var(--fg-muted, #a09b90);
    font-size: 0.75rem;
    cursor: pointer;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 0.12s ease;
}

.editor-header:hover .cover-add__btn {
    opacity: 1;
}

.cover-add__btn:hover:not(:disabled) {
    background: var(--surface-hover, rgba(255, 255, 255, 0.04));
    color: var(--fg, #ededed);
}

.cover-add__error {
    color: var(--danger, #b85c5c);
    font-size: 0.7rem;
}
</style>
