<script setup lang="ts">
import { computed, ref } from 'vue';
import type { MediaBlockAttrs } from '@continuum/editor';
import Icon from '@/components/ui/Icon.vue';
import { api } from '@/api';
import MediaBlockPreview from './MediaBlockPreview.vue';
import {
  MEDIA_BLOCK_META,
  attrsFromUpload,
  attrsFromLink,
  emptyMediaBlockAttrs,
  mediaDisplayName,
  resolveMediaPreview,
} from './mediaBlockUtils';

const props = defineProps<{
  attrs: MediaBlockAttrs;
  editable: boolean;
}>();

const emit = defineEmits<{
  'update:attrs': [patch: Partial<MediaBlockAttrs>];
  delete: [];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const urlDraft = ref('');
const linkOpen = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);
const dragOver = ref(false);

const meta = computed(() => MEDIA_BLOCK_META[props.attrs.kind]);
const currentPreview = computed(() => resolveMediaPreview(props.attrs));
const hasSource = computed(() => currentPreview.value !== null);

function triggerUpload(): void {
  if (!props.editable || busy.value) return;
  fileInput.value?.click();
}

function openLinkEditor(): void {
  if (!props.editable) return;
  urlDraft.value = props.attrs.source === 'link' ? props.attrs.url ?? '' : '';
  linkOpen.value = !linkOpen.value;
  error.value = null;
}

async function upload(file: File): Promise<void> {
  busy.value = true;
  error.value = null;
  try {
    const uploaded = await api.uploads.create(file);
    emit('update:attrs', attrsFromUpload(props.attrs.kind, uploaded));
    linkOpen.value = false;
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Upload failed';
  } finally {
    busy.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

function onFilePicked(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void upload(file);
}

function onDrop(event: DragEvent): void {
  event.preventDefault();
  dragOver.value = false;
  if (!props.editable || busy.value) return;
  const file = event.dataTransfer?.files?.[0];
  if (file) void upload(file);
}

function saveLink(): void {
  const patch = attrsFromLink(props.attrs.kind, urlDraft.value);
  if (!patch) {
    error.value = 'Enter a valid URL.';
    return;
  }
  emit('update:attrs', patch);
  linkOpen.value = false;
  error.value = null;
}

function clearSource(): void {
  if (!props.editable) return;
  emit('update:attrs', emptyMediaBlockAttrs(props.attrs.kind));
  linkOpen.value = false;
  error.value = null;
}

function updateCaption(value: string): void {
  if (!props.editable) return;
  emit('update:attrs', { caption: value });
}

function onCaptionInput(event: Event): void {
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (input) updateCaption(input.value);
}
</script>

<template>
  <section
    class="media-block"
    :class="[`media-block--${attrs.kind}`, { 'is-drag': dragOver, 'is-empty': !hasSource }]"
    @dragenter.prevent="dragOver = true"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @drop="onDrop"
  >
    <header class="media-block__head">
      <span class="media-block__kind">
        <Icon :name="meta.icon" :size="14" />
        <span>{{ meta.label }}</span>
      </span>
      <span v-if="attrs.source" class="media-block__source">{{ attrs.source }}</span>
      <div v-if="editable" class="media-block__actions">
        <button type="button" class="media-block__btn" :disabled="busy" @click="triggerUpload">
          <Icon name="upload" :size="13" />
          <span>{{ hasSource ? 'Replace' : 'Upload' }}</span>
        </button>
        <button type="button" class="media-block__btn" @click="openLinkEditor">
          <Icon name="link" :size="13" />
          <span>Link</span>
        </button>
        <button v-if="hasSource" type="button" class="media-block__icon-btn" title="Clear" @click="clearSource">
          <Icon name="close" :size="12" />
        </button>
        <button type="button" class="media-block__icon-btn" title="Delete block" @click="emit('delete')">
          <Icon name="trash" :size="12" />
        </button>
      </div>
    </header>

    <div v-if="currentPreview" class="media-block__body">
      <MediaBlockPreview :attrs="attrs" :source="currentPreview" />
      <input
        v-if="editable"
        class="media-block__caption"
        type="text"
        :value="attrs.caption"
        placeholder="Caption"
        @input="onCaptionInput"
      />
      <p v-else-if="attrs.caption" class="media-block__caption-text">{{ attrs.caption }}</p>
    </div>

    <div v-else class="media-block__empty">
      <span class="media-block__empty-icon"><Icon :name="meta.icon" :size="20" /></span>
      <span class="media-block__empty-title">{{ mediaDisplayName(attrs) }}</span>
    </div>

    <form v-if="linkOpen && editable" class="media-block__link-row" @submit.prevent="saveLink">
      <input
        v-model="urlDraft"
        class="media-block__url"
        type="url"
        placeholder="https://..."
        autocomplete="off"
      />
      <button type="submit" class="media-block__btn media-block__btn--primary">Use link</button>
    </form>

    <p v-if="error" class="media-block__error">{{ error }}</p>
    <input ref="fileInput" class="media-block__file-input" type="file" :accept="meta.accept" @change="onFilePicked" />
  </section>
</template>

<style scoped>
.media-block { display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-3); background: var(--bg-elev); border: var(--border-width-1) solid var(--border); border-radius: var(--radius-md); }
.media-block.is-drag { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 10%, var(--bg-elev)); }

.media-block__head,
.media-block__actions,
.media-block__kind,
.media-block__link-row { display: flex; align-items: center; }

.media-block__head { justify-content: space-between; gap: var(--space-3); min-width: 0; }
.media-block__actions { gap: var(--space-1); flex-shrink: 0; }
.media-block__body { display: grid; gap: var(--space-2); min-width: 0; }
.media-block__kind { gap: var(--space-2); min-width: 0; color: var(--fg-muted); font-size: var(--text-xs); font-weight: var(--font-weight-semibold); text-transform: uppercase; letter-spacing: var(--tracking-wide); }
.media-block__source { margin-right: auto; color: var(--fg-subtle); font-size: var(--text-2xs); text-transform: uppercase; }

.media-block__btn,
.media-block__icon-btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--space-1); min-height: 26px; border-radius: var(--radius-sm); border: var(--border-width-1) solid var(--border); background: transparent; color: var(--fg-muted); cursor: pointer; font-size: var(--text-xs); }

.media-block__btn { padding: 0 var(--space-2); }
.media-block__icon-btn { width: 26px; padding: 0; }
.media-block__btn:hover:not(:disabled),
.media-block__icon-btn:hover { background: var(--bg-soft); color: var(--fg); }
.media-block__btn:disabled { opacity: 0.6; cursor: progress; }
.media-block__btn--primary { background: var(--accent); color: var(--fg-on-accent); border-color: transparent; }

.media-block__empty { display: flex; align-items: center; gap: var(--space-3); min-height: 86px; padding: var(--space-4); border: var(--border-width-1) dashed var(--border); border-radius: var(--radius-sm); color: var(--fg-muted); }
.media-block__empty-icon { width: 38px; height: 38px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--radius-sm); background: var(--bg-soft); color: var(--accent); }
.media-block__empty-title { font-size: var(--text-sm); font-weight: var(--font-weight-semibold); }
.media-block__link-row { gap: var(--space-2); }

.media-block__url,
.media-block__caption { width: 100%; min-width: 0; height: 30px; padding: 0 var(--space-2); appearance: none; background: var(--bg-soft); border: var(--border-width-1) solid var(--border); border-radius: var(--radius-sm); color: var(--fg); font-size: var(--text-sm); }
.media-block__caption { background: transparent; border-color: transparent; color: var(--fg-muted); }
.media-block__caption:focus,
.media-block__caption:focus-visible,
.media-block__url:focus,
.media-block__url:focus-visible { outline: none; box-shadow: none; }
.media-block__caption-text { margin: 0; color: var(--fg-muted); font-size: var(--text-sm); }
.media-block__error { margin: 0; color: var(--danger, #b85c5c); font-size: var(--text-xs); }
.media-block__file-input { display: none; }
</style>
