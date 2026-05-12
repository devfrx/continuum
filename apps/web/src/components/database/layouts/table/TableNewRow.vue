<script setup lang="ts">
/**
 * `TableNewRow` — sticky-bottom "+ New" row that creates a fresh note of
 * the active kind. The newly created note bubbles up to the layout so the
 * caller can refetch (or optimistically prepend) and the user can start
 * filling its title immediately.
 */
import { ref } from 'vue';
import type { Note } from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import { api } from '@/api';

const props = defineProps<{
  kindId: string;
}>();

const emit = defineEmits<{ created: [note: Note] }>();

const busy = ref(false);

async function create(): Promise<void> {
  if (busy.value) return;
  busy.value = true;
  try {
    const note = await api.notes.create({ kind: props.kindId, title: 'Untitled' });
    emit('created', note);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <button type="button" class="t-new" :disabled="busy" @click="create">
    <Icon name="plus" :size="14" />
    <span>New</span>
  </button>
</template>

<style scoped>
.t-new {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-2);
  height: 100%;
  background: transparent;
  border: none;
  border-bottom: var(--border-width-1) solid var(--border);
  color: var(--fg-muted);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
  position: sticky;
  left: 0;
}
.t-new:hover:not(:disabled) {
  background: color-mix(in srgb, var(--bg-soft) 60%, transparent);
  color: var(--fg);
}
.t-new:disabled {
  cursor: progress;
  opacity: 0.6;
}
</style>
