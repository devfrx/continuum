<script setup lang="ts">
/**
 * Read-only note peek used by database view row clicks.
 *
 * `sidePeek` and `centerPeek` render as detached floating panels with
 * the same edge spacing / radius language as the app sidebar. The
 * component is deliberately read-only: full editing stays in the
 * canonical Notes route, reachable through the expand action. Nested
 * database blocks still render via the host bridge, but receive
 * `editable=false` from the editor.
 */
import { computed, ref, watch } from 'vue';
import { ContinuumEditor, type IconCatalogEntry } from '@continuum/editor';
import { Icon, UiSelect } from '@/components/ui';
import { useKinds } from '@/composables/useKinds';
import type { Note } from '@continuum/shared';
import type { OpenInMode } from '@/components/databases/layout';
import DatabaseBlockEmbed from '@/components/databases/DatabaseBlockEmbed.vue';

const props = defineProps<{
  modelValue: boolean;
  note: Note | null;
  mode: Extract<OpenInMode, 'sidePeek' | 'centerPeek'>;
  iconCatalog: IconCatalogEntry[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  'open-full-page': [noteId: string];
}>();

const kinds = useKinds();
void kinds.load();

const content = ref('');
const contentJson = ref<unknown>(null);

watch(
  () => props.note,
  (note) => {
    content.value = note?.content ?? '';
    contentJson.value = note?.contentJson ?? null;
  },
  { immediate: true },
);

const iconName = computed<string>(() => kinds.iconOf(props.note?.kind ?? 'note'));
const iconColor = computed<string>(() => kinds.colorOf(props.note?.kind ?? 'note'));

function close(): void {
  emit('update:modelValue', false);
}

function openFullPage(): void {
  if (props.note) emit('open-full-page', props.note.id);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue && note"
      class="note-peek"
      :class="`note-peek--${mode}`"
      @mousedown.self="close">
      <article class="note-peek__panel" role="dialog" aria-modal="true" :aria-label="note.title || 'Untitled'">
        <header class="note-peek__header">
          <span class="note-peek__kind" :style="{ color: iconColor }">
            <Icon :name="iconName" :size="16" />
          </span>
          <h2>{{ note.title || 'Untitled' }}</h2>
          <button type="button" class="note-peek__icon-btn" title="Open full page" @click="openFullPage">
            <Icon name="maximize" :size="14" />
          </button>
          <button type="button" class="note-peek__icon-btn" title="Close" @click="close">
            <Icon name="close" :size="14" />
          </button>
        </header>
        <div class="note-peek__body">
          <ContinuumEditor
            class="note-peek__editor"
            v-model="content"
            v-model:json="contentJson"
            mode="wysiwyg"
            :editable="false"
            placeholder=""
            :icon-catalog="iconCatalog"
            :icon-component="Icon"
            :select-component="UiSelect"
            :database-component="DatabaseBlockEmbed" />
        </div>
      </article>
    </div>
  </Teleport>
</template>

<style scoped>
.note-peek {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  padding: var(--layout-sidebar-edge, var(--space-4));
  background: rgba(0, 0, 0, 0.32);
}

.note-peek--sidePeek {
  justify-content: flex-end;
  align-items: stretch;
}

.note-peek--centerPeek {
  justify-content: center;
  align-items: center;
}

.note-peek__panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--bg, #1a1a1a);
  color: var(--fg, #ededed);
  border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.1));
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.48);
  border-radius: var(--radius-lg, 12px);
  overflow: hidden;
}

.note-peek--sidePeek .note-peek__panel {
  width: min(540px, calc(100vw - (2 * var(--layout-sidebar-edge, var(--space-4)))));
  height: 100%;
  max-height: 100%;
}

.note-peek--centerPeek .note-peek__panel {
  width: min(860px, calc(100vw - (2 * var(--layout-sidebar-edge, var(--space-4)))));
  height: min(760px, calc(100vh - (2 * var(--layout-sidebar-edge, var(--space-4)))));
  max-height: calc(100vh - (2 * var(--layout-sidebar-edge, var(--space-4))));
}

.note-peek__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.85rem;
  border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.08));
  background: var(--bg-elev, #232323);
}

.note-peek__kind {
  display: inline-flex;
  flex: 0 0 auto;
}

.note-peek__header h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.95rem;
  font-weight: 600;
}

.note-peek__icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  background: transparent;
  color: var(--fg-muted, #a09b90);
  border-radius: 4px;
  cursor: pointer;
}

.note-peek__icon-btn:hover {
  background: var(--surface-hover, rgba(255, 255, 255, 0.06));
  color: var(--fg, #ededed);
}

.note-peek__body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 1rem 1.2rem 1.4rem;
}

.note-peek__editor {
  max-width: 760px;
  margin: 0 auto;
  min-height: 100%;
}
</style>
