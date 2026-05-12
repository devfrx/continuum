<script setup lang="ts">
/**
 * GalleryCard — single card used by {@link GalleryLayout}.
 *
 * Renders an optional cover image, the note title, and a chip list of any
 * non-cover, non-title properties present on the row.
 */
import type {
  NoteWithProperties,
  PropertyDefinition,
} from '@continuum/shared';
import {
  coverImageUrl,
  findPropertyValue,
  formatPropertyValue,
} from '../_shared/propertyHelpers';

const props = defineProps<{
  row: NoteWithProperties;
  defs: PropertyDefinition[];
  coverKey: string | undefined;
  fitImage: 'cover' | 'contain';
}>();

const emit = defineEmits<{ (e: 'open', noteId: string): void }>();

function url(): string | null {
  return coverImageUrl(props.row, props.coverKey, props.defs);
}

function chips(): { key: string; label: string; text: string }[] {
  return props.defs
    .filter((d) => d.key !== props.coverKey)
    .flatMap((d) => {
      const text = formatPropertyValue(findPropertyValue(props.row, d.key));
      return text ? [{ key: d.key, label: d.label, text }] : [];
    })
    .slice(0, 6);
}
</script>

<template>
  <article class="gallery-card" @click="emit('open', props.row.note.id)">
    <div
      v-if="url()"
      class="gallery-card__cover"
      :class="{ 'gallery-card__cover--contain': props.fitImage === 'contain' }"
      :style="{ backgroundImage: `url(${url()})` }"
    />
    <div v-else class="gallery-card__cover gallery-card__cover--empty" />
    <div class="gallery-card__body">
      <h3 class="gallery-card__title">{{ props.row.note.title || 'Untitled' }}</h3>
      <div class="gallery-card__chips">
        <span
          v-for="c in chips()"
          :key="c.key"
          class="gallery-card__chip"
          :title="c.label"
        >{{ c.text }}</span>
      </div>
    </div>
  </article>
</template>

<style scoped>
.gallery-card {
  display: flex; flex-direction: column;
  background: var(--bg-soft); border: var(--border-width-1) solid var(--border);
  border-radius: 8px; overflow: hidden; cursor: pointer;
  transition: transform 80ms ease, border-color 80ms ease;
}
.gallery-card:hover { border-color: var(--accent, var(--text-muted)); transform: translateY(-1px); }
.gallery-card__cover {
  height: 140px; background-size: cover; background-position: center;
  background-repeat: no-repeat; background-color: var(--bg-elev);
}
.gallery-card__cover--contain { background-size: contain; }
.gallery-card__cover--empty {
  background: linear-gradient(135deg, var(--bg-elev), var(--bg-soft));
}
.gallery-card__body { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
.gallery-card__title { margin: 0; font-size: 14px; font-weight: 600; color: var(--text); }
.gallery-card__chips { display: flex; flex-wrap: wrap; gap: 4px; }
.gallery-card__chip {
  font-size: 11px; padding: 2px 6px; border-radius: 6px;
  background: var(--bg-elev); color: var(--text-muted);
}
</style>
