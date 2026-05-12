<script setup lang="ts">
/**
 * GalleryLayout — responsive grid of cards.
 *
 * Card width preset comes from `view.layout.cardSize`:
 *   small=180px, medium=240px, large=320px (auto-fill).
 * Cover image is pulled from the optional `coverPropertyKey` (`files`).
 */
import { computed } from 'vue';
import type {
  CardSize,
  DatabaseView,
  ImageFit,
  NoteWithProperties,
  QueryGroupBucket,
} from '@continuum/shared';
import { useProperties } from '@/composables/useProperties';
import GalleryCard from './GalleryCard.vue';

const props = defineProps<{
  view: DatabaseView | null;
  rows: NoteWithProperties[];
  groups: QueryGroupBucket[];
  loading: boolean;
  hasMore: boolean;
  loadMore: () => Promise<void>;
  reloadRow: (noteId: string) => Promise<void>;
}>();

const emit = defineEmits<{ (e: 'open', noteId: string): void }>();

const properties = useProperties();
const defs = computed(() =>
  props.view?.kindId ? properties.forKind(props.view.kindId) : [],
);

const SIZE_PX: Record<CardSize, string> = {
  small: '180px',
  medium: '240px',
  large: '320px',
};

const cardSize = computed<CardSize>(() =>
  props.view?.layout.type === 'gallery' ? props.view.layout.cardSize : 'medium',
);
const coverKey = computed<string | undefined>(() =>
  props.view?.layout.type === 'gallery' ? props.view.layout.coverPropertyKey : undefined,
);
const fitImage = computed<ImageFit>(() =>
  props.view?.layout.type === 'gallery' ? props.view.layout.fitImage : 'cover',
);

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(auto-fill, minmax(${SIZE_PX[cardSize.value]}, 1fr))`,
}));
</script>

<template>
  <div class="gallery-layout">
    <div class="gallery-layout__grid" :style="gridStyle">
      <GalleryCard
        v-for="row in props.rows"
        :key="row.note.id"
        :row="row"
        :defs="defs"
        :cover-key="coverKey"
        :fit-image="fitImage"
        @open="emit('open', $event)"
      />
    </div>
    <div v-if="props.hasMore" class="gallery-layout__more">
      <button type="button" :disabled="props.loading" @click="props.loadMore()">
        {{ props.loading ? 'Loading…' : 'Load more' }}
      </button>
    </div>
    <p v-if="!props.loading && props.rows.length === 0" class="gallery-layout__empty">
      No items yet.
    </p>
  </div>
</template>

<style scoped>
.gallery-layout { padding: 16px; overflow-y: auto; height: 100%; }
.gallery-layout__grid { display: grid; gap: 16px; }
.gallery-layout__more { padding: 16px; text-align: center; }
.gallery-layout__empty {
  padding: 24px; text-align: center; color: var(--text-muted);
}
</style>
