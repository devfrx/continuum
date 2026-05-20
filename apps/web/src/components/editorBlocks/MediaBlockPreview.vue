<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { MediaBlockAttrs } from '@continuum/editor';
import Icon from '@/components/ui/Icon.vue';
import { formatFileSize, mediaDisplayName, safeIframeEmbedUrl, type MediaPreviewSource } from './mediaBlockUtils';

const props = defineProps<{
  attrs: MediaBlockAttrs;
  source: MediaPreviewSource;
}>();

const iframeUrl = computed(() => (props.source.mode === 'embed' ? safeIframeEmbedUrl(props.source.url) : null));
// When the embed has a poster image we render a click-to-play facade first; loading the
// provider iframe only after a user gesture sidesteps the cross-origin sub-iframes that
// providers like YouTube create on init (which are what trigger `frame-ancestors 'none'`
// console noise even though the visible player works fine).
const playerActivated = ref(false);
const showFacade = computed(() => Boolean(iframeUrl.value && props.source.posterUrl) && !playerActivated.value);
const activeIframeUrl = computed(() => {
  if (!iframeUrl.value) return null;
  if (!playerActivated.value || props.source.provider !== 'YouTube') return iframeUrl.value;
  const url = new URL(iframeUrl.value);
  url.searchParams.set('autoplay', '1');
  return url.toString();
});

watch(
  () => `${props.attrs.url ?? ''}|${props.source.url}`,
  () => {
    playerActivated.value = false;
  },
);

function activatePlayer(): void {
  playerActivated.value = true;
}

function onFacadeKey(event: KeyboardEvent): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    activatePlayer();
  }
}
</script>

<template>
  <div class="media-preview" :class="`media-preview--${attrs.kind}`">
    <video
      v-if="attrs.kind === 'video' && source.mode === 'direct'"
      class="media-preview__video"
      :src="source.url"
      controls
      preload="metadata"
    />

    <button
      v-else-if="attrs.kind === 'video' && showFacade"
      type="button"
      class="media-preview__facade"
      :style="{ backgroundImage: `url(${source.posterUrl})` }"
      :aria-label="`Play ${mediaDisplayName(props.attrs)}`"
      @click.stop.prevent="activatePlayer"
      @keydown="onFacadeKey"
    >
      <span class="media-preview__facade-play" aria-hidden="true">
        <Icon name="play" :size="22" />
      </span>
      <span v-if="source.provider" class="media-preview__facade-badge">{{ source.provider }}</span>
    </button>

    <iframe
      v-else-if="attrs.kind === 'video' && activeIframeUrl"
      class="media-preview__embed"
      :src="activeIframeUrl"
      :title="mediaDisplayName(props.attrs)"
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
      referrerpolicy="strict-origin-when-cross-origin"
    />

    <div v-else-if="attrs.kind === 'audio'" class="media-preview__audio-card">
      <div class="media-preview__glyph"><Icon name="audio" :size="18" /></div>
      <div class="media-preview__audio-main">
        <span class="media-preview__name" :title="mediaDisplayName(props.attrs)">
          {{ mediaDisplayName(props.attrs) }}
        </span>
        <audio class="media-preview__audio" :src="source.url" controls preload="metadata" />
      </div>
    </div>

    <a v-else class="media-preview__file" :href="source.url" target="_blank" rel="noopener">
      <span class="media-preview__glyph"><Icon name="file" :size="18" /></span>
      <span class="media-preview__file-main">
        <span class="media-preview__name" :title="mediaDisplayName(props.attrs)">
          {{ mediaDisplayName(props.attrs) }}
        </span>
        <span class="media-preview__meta">
          {{ [attrs.mime, formatFileSize(attrs.size)].filter(Boolean).join(' · ') || 'File' }}
        </span>
      </span>
      <Icon name="download" :size="14" />
    </a>
  </div>
</template>

<style scoped>
.media-preview { min-width: 0; }

.media-preview__video,
.media-preview__embed,
.media-preview__facade {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 420px;
  background: #000;
  border: 0;
  border-radius: var(--radius-sm);
}

.media-preview__facade {
  position: relative;
  padding: 0;
  background-color: #000;
  background-position: center;
  background-size: cover;
  background-repeat: no-repeat;
  cursor: pointer;
  overflow: hidden;
}
.media-preview__facade::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 30%, rgba(0, 0, 0, 0.55) 100%);
  pointer-events: none;
}
.media-preview__facade:hover .media-preview__facade-play,
.media-preview__facade:focus-visible .media-preview__facade-play {
  transform: translate(-50%, -50%) scale(1.05);
  background: var(--accent);
  color: var(--fg-on-accent, #fff);
}
.media-preview__facade:focus { outline: none; }
.media-preview__facade:focus-visible { box-shadow: var(--shadow-focus); }

.media-preview__facade-play {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  border-radius: 999px;
  transform: translate(-50%, -50%);
  transition:
    transform var(--duration-fast) var(--ease-standard),
    background-color var(--duration-fast) var(--ease-standard);
  z-index: 1;
}

.media-preview__facade-badge {
  position: absolute;
  bottom: var(--space-2);
  right: var(--space-2);
  padding: 2px var(--space-2);
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: var(--text-2xs);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
  border-radius: var(--radius-xs);
  z-index: 1;
}

.media-preview__audio-card,
.media-preview__file {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  min-width: 0;
  padding: var(--space-3);
  background: var(--bg-soft);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-sm);
}

.media-preview__file { color: var(--fg); text-decoration: none; }
.media-preview__file:hover { border-color: var(--accent-border); background: var(--bg-elev); }

.media-preview__glyph {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  background: var(--bg-elev);
  color: var(--accent);
}

.media-preview__audio-main,
.media-preview__file-main {
  min-width: 0;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.media-preview__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  color: var(--fg);
  font-weight: var(--font-weight-semibold);
}

.media-preview__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--fg-subtle);
  font-size: var(--text-xs);
}

.media-preview__audio { width: 100%; height: 32px; }
</style>
