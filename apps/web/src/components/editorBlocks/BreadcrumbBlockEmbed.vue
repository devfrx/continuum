<script setup lang="ts">
import type { BreadcrumbBlockAttrs, EditorNoteContext } from '@continuum/editor';
import Icon from '@/components/ui/Icon.vue';
import { FolderBreadcrumb } from '@/components/folders';

const props = defineProps<{
  attrs: BreadcrumbBlockAttrs;
  context: EditorNoteContext | null;
  editable: boolean;
}>();

const emit = defineEmits<{
  'update:attrs': [patch: Partial<BreadcrumbBlockAttrs>];
  delete: [];
}>();

function selectFolder(folderId: string | null): void {
  props.context?.onSelectFolder?.(folderId);
}

function toggleLeaf(): void {
  if (!props.editable) return;
  emit('update:attrs', { showLeaf: !props.attrs.showLeaf });
}
</script>

<template>
  <section class="breadcrumb-block">
    <header class="breadcrumb-block__head">
      <span class="breadcrumb-block__label">
        <Icon name="breadcrumbs" :size="14" />
        <span>Breadcrumbs</span>
      </span>
      <div v-if="editable" class="breadcrumb-block__actions">
        <button type="button" class="breadcrumb-block__btn" @click="toggleLeaf">
          {{ attrs.showLeaf ? 'Hide note' : 'Show note' }}
        </button>
        <button type="button" class="breadcrumb-block__icon-btn" title="Delete block" @click="emit('delete')">
          <Icon name="trash" :size="12" />
        </button>
      </div>
    </header>

    <FolderBreadcrumb
      v-if="context"
      class="breadcrumb-block__trail"
      :folder-id="context.folderId"
      :leaf="attrs.showLeaf ? context.title || 'Untitled' : undefined"
      @select="selectFolder"
    />
    <div v-else class="breadcrumb-block__placeholder">
      <Icon name="folder" :size="13" />
      <span>Template context</span>
    </div>
  </section>
</template>

<style scoped>
.breadcrumb-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  background: var(--bg-elev);
}

.breadcrumb-block__head,
.breadcrumb-block__label,
.breadcrumb-block__actions,
.breadcrumb-block__placeholder {
  display: flex;
  align-items: center;
}

.breadcrumb-block__head { justify-content: space-between; gap: var(--space-3); }
.breadcrumb-block__label { gap: var(--space-2); color: var(--fg-muted); font-size: var(--text-xs); font-weight: var(--font-weight-semibold); text-transform: uppercase; letter-spacing: var(--tracking-wide); }
.breadcrumb-block__actions { gap: var(--space-1); flex-shrink: 0; }

.breadcrumb-block__btn,
.breadcrumb-block__icon-btn {
  min-height: 26px;
  border-radius: var(--radius-sm);
  border: var(--border-width-1) solid var(--border);
  background: transparent;
  color: var(--fg-muted);
  cursor: pointer;
  font-size: var(--text-xs);
}

.breadcrumb-block__btn { padding: 0 var(--space-2); }
.breadcrumb-block__icon-btn { width: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.breadcrumb-block__btn:hover,
.breadcrumb-block__icon-btn:hover { background: var(--bg-soft); color: var(--fg); }
.breadcrumb-block__trail { padding: var(--space-1) 0; }
.breadcrumb-block__placeholder { gap: var(--space-2); color: var(--fg-subtle); font-size: var(--text-sm); }
</style>
