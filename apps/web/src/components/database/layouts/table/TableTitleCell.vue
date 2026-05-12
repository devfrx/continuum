<script setup lang="ts">
/**
 * `TableTitleCell` — frozen first column showing the note's title.
 *
 * Single-click navigates the user to the note (delegated via `open`),
 * double-click switches the cell to inline-rename mode. Pressing
 * <kbd>Enter</kbd> persists the new title via `api.notes.update`;
 * <kbd>Escape</kbd> reverts. Sticks to the left edge of the scroll
 * container so the title stays visible while horizontally scrolling
 * other columns.
 */
import { nextTick, ref, watch } from 'vue';
import { api } from '@/api';

const props = defineProps<{
  noteId: string;
  title: string;
}>();

const emit = defineEmits<{
  open: [noteId: string];
  renamed: [noteId: string];
}>();

const editing = ref(false);
const draft = ref(props.title);
const input = ref<HTMLInputElement | null>(null);

watch(
  () => props.title,
  (next) => {
    if (!editing.value) draft.value = next;
  },
);

function onClick(): void {
  if (editing.value) return;
  emit('open', props.noteId);
}

function startEdit(): void {
  editing.value = true;
  draft.value = props.title;
  void nextTick(() => input.value?.select());
}

async function commit(): Promise<void> {
  const next = draft.value.trim();
  editing.value = false;
  if (!next || next === props.title) return;
  await api.notes.update(props.noteId, { title: next });
  emit('renamed', props.noteId);
}

function cancel(): void {
  editing.value = false;
  draft.value = props.title;
}
</script>

<template>
  <div class="t-title" :class="{ 'is-editing': editing }" @click="onClick" @dblclick.stop="startEdit">
    <input
      v-if="editing"
      ref="input"
      v-model="draft"
      class="t-title__input"
      type="text"
      @click.stop
      @keydown.enter.prevent="commit"
      @keydown.escape.prevent="cancel"
      @blur="commit"
    />
    <span v-else class="t-title__text" :title="title">{{ title || 'Untitled' }}</span>
  </div>
</template>

<style scoped>
.t-title {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 var(--space-2);
  border-right: var(--border-width-1) solid var(--border);
  border-bottom: var(--border-width-1) solid var(--border);
  background: var(--bg);
  cursor: pointer;
  position: sticky;
  left: 28px;
  z-index: 1;
  min-width: 0;
}
.t-title:hover {
  background: color-mix(in srgb, var(--bg-soft) 60%, transparent);
}
.t-title.is-editing {
  cursor: text;
}
.t-title__text {
  font-size: var(--text-sm);
  color: var(--fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}
.t-title__input {
  width: 100%;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  outline: none;
  font: inherit;
  color: var(--fg);
}
</style>
