<script setup lang="ts">
import { computed, ref } from 'vue';
import { Icon } from '@/components/ui';
import { api } from '@/api';
import {
  DEFAULT_COVER_POSITION,
  coverBackgroundPosition,
  normalizeCoverPosition,
} from '@/lib/noteCover';
import type { CoverPosition } from '@continuum/shared';

const props = defineProps<{
  image: string | null;
  position: CoverPosition | null;
  locked: boolean;
}>();

const emit = defineEmits<{
  change: [payload: { image: string | null; position: CoverPosition | null }];
}>();

const coverInputRef = ref<HTMLInputElement | null>(null);
const coverRef = ref<HTMLElement | null>(null);
const coverBusy = ref(false);
const coverError = ref<string | null>(null);
const dragPosition = ref<CoverPosition | null>(null);
const dragging = ref(false);

let dragPointerId: number | null = null;
let dragStartPoint: { x: number; y: number } | null = null;
let dragStartPosition: CoverPosition | null = null;
let dragHasMoved = false;

const effectivePosition = computed(() =>
  dragPosition.value ?? normalizeCoverPosition(props.position),
);

const coverStyle = computed(() => ({
  backgroundImage: props.image ? `url('${props.image}')` : undefined,
  backgroundPosition: coverBackgroundPosition(effectivePosition.value),
}));

function triggerCoverPick(): void {
  if (props.locked || coverBusy.value) return;
  coverInputRef.value?.click();
}

async function onCoverFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  coverError.value = null;
  coverBusy.value = true;
  try {
    const ref = await api.uploads.create(file);
    const image = ref.url ?? null;
    emit('change', {
      image,
      position: image ? { ...DEFAULT_COVER_POSITION } : null,
    });
  } catch (err) {
    coverError.value = err instanceof Error ? err.message : 'Upload failed';
  } finally {
    coverBusy.value = false;
  }
}

function removeCover(): void {
  if (props.locked) return;
  emit('change', { image: null, position: null });
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

function onCoverPointerDown(event: PointerEvent): void {
  if (props.locked || !props.image || event.button !== 0) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest('.note-cover__actions')) return;
  const cover = coverRef.value;
  if (!cover) return;
  event.preventDefault();
  cover.setPointerCapture(event.pointerId);
  dragPointerId = event.pointerId;
  dragStartPoint = { x: event.clientX, y: event.clientY };
  dragStartPosition = normalizeCoverPosition(props.position);
  dragHasMoved = false;
  dragPosition.value = dragStartPosition;
  dragging.value = true;
}

function onCoverPointerMove(event: PointerEvent): void {
  if (dragPointerId !== event.pointerId || !dragStartPoint || !dragStartPosition) return;
  const cover = coverRef.value;
  if (!cover) return;
  const rect = cover.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const deltaX = event.clientX - dragStartPoint.x;
  const deltaY = event.clientY - dragStartPoint.y;
  if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) dragHasMoved = true;
  const dx = (deltaX / rect.width) * 100;
  const dy = (deltaY / rect.height) * 100;
  dragPosition.value = {
    x: clampPercent(dragStartPosition.x - dx),
    y: clampPercent(dragStartPosition.y - dy),
  };
}

function finishDrag(event: PointerEvent, commit: boolean): void {
  if (dragPointerId !== event.pointerId) return;
  const cover = coverRef.value;
  if (cover?.hasPointerCapture(event.pointerId)) {
    cover.releasePointerCapture(event.pointerId);
  }
  const nextPosition = dragPosition.value;
  dragPointerId = null;
  dragStartPoint = null;
  dragStartPosition = null;
  const shouldCommit = commit && dragHasMoved;
  dragHasMoved = false;
  dragPosition.value = null;
  dragging.value = false;
  if (shouldCommit && props.image && nextPosition) {
    emit('change', { image: props.image, position: normalizeCoverPosition(nextPosition) });
  }
}
</script>

<template>
  <div class="note-cover-shell">
    <input ref="coverInputRef" type="file" accept="image/*" hidden @change="onCoverFileChosen" />

    <div
      v-if="image"
      ref="coverRef"
      class="note-cover"
      :class="{ 'is-dragging': dragging, 'is-locked': locked }"
      :style="coverStyle"
      role="img"
      aria-label="Note cover"
      title="Drag cover to reposition"
      @pointerdown="onCoverPointerDown"
      @pointermove="onCoverPointerMove"
      @pointerup="finishDrag($event, true)"
      @pointercancel="finishDrag($event, false)">
      <div v-if="!locked" class="note-cover__actions">
        <button type="button" class="note-cover__btn" :disabled="coverBusy" @click="triggerCoverPick">
          <Icon name="edit" :size="12" />
          <span>{{ coverBusy ? 'Uploading...' : 'Change cover' }}</span>
        </button>
        <button type="button" class="note-cover__btn note-cover__btn--danger" @click="removeCover">
          <Icon name="trash" :size="12" />
          <span>Remove</span>
        </button>
      </div>
    </div>

    <div v-else-if="!locked" class="note-cover-add">
      <button type="button" class="note-cover-add__btn" :disabled="coverBusy" @click="triggerCoverPick">
        <Icon name="plus" :size="12" />
        <span>{{ coverBusy ? 'Uploading...' : 'Add cover' }}</span>
      </button>
      <span v-if="coverError" class="note-cover-add__error">{{ coverError }}</span>
    </div>
  </div>
</template>

<style scoped>
.note-cover-shell {
  display: contents;
}

.note-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 4 / 1;
  max-height: 260px;
  border-radius: var(--radius-md, 6px);
  background-size: cover;
  background-repeat: no-repeat;
  background-color: var(--surface-hover, rgba(255, 255, 255, 0.04));
  margin-bottom: var(--space-3, 0.5rem);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.note-cover.is-dragging {
  cursor: grabbing;
}

.note-cover.is-locked {
  cursor: default;
}

.note-cover__actions {
  position: absolute;
  right: 0.6rem;
  bottom: 0.6rem;
  display: flex;
  gap: 0.35rem;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.note-cover:hover .note-cover__actions,
.note-cover:focus-within .note-cover__actions,
.note-cover.is-dragging .note-cover__actions {
  opacity: 1;
}

.note-cover__btn {
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

.note-cover__btn:hover:not(:disabled) {
  background: rgba(0, 0, 0, 0.75);
}

.note-cover__btn--danger:hover:not(:disabled) {
  color: var(--danger, #b85c5c);
}

.note-cover-add {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: var(--space-2, 0.35rem);
}

.note-cover-add__btn {
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

:global(.editor-header:hover) .note-cover-add__btn,
.note-cover-add__btn:focus-visible {
  opacity: 1;
}

.note-cover-add__btn:hover:not(:disabled) {
  background: var(--surface-hover, rgba(255, 255, 255, 0.04));
  color: var(--fg, #ededed);
}

.note-cover-add__error {
  color: var(--danger, #b85c5c);
  font-size: 0.7rem;
}
</style>