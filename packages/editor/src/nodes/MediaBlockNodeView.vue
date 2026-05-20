<script setup lang="ts">
/**
 * NodeView wrapper for `mediaBlock`.
 *
 * Upload and link UI is host-owned; this wrapper only forwards attrs and
 * mutation callbacks while preserving ProseMirror's atom selection model.
 */
import { computed, inject, type Component } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { MEDIA_COMPONENT_KEY } from '../hostBridge';
import { normalizeMediaBlockAttrs, type MediaBlockAttrs } from './mediaBlockTypes';

const props = defineProps(nodeViewProps);

const HostComponent = inject<Component | null>(MEDIA_COMPONENT_KEY, null);

const attrs = computed<MediaBlockAttrs>(() => normalizeMediaBlockAttrs({
  kind: props.node.attrs.kind,
  source: props.node.attrs.source,
  url: props.node.attrs.url,
  name: props.node.attrs.name,
  mime: props.node.attrs.mime,
  size: props.node.attrs.size,
  uploadId: props.node.attrs.uploadId,
  caption: props.node.attrs.caption,
  schemaVersion: props.node.attrs.schemaVersion,
}));

const editable = computed(() => props.editor?.isEditable ?? true);

function patch(partial: Partial<MediaBlockAttrs>): void {
  if (!editable.value) return;
  props.updateAttributes(partial);
}

function remove(): void {
  if (!editable.value) return;
  if (typeof props.deleteNode === 'function') props.deleteNode();
}

function stopEditorDrag(event: DragEvent): void {
  event.stopPropagation();
}
</script>

<template>
  <NodeViewWrapper class="continuum-media-block" :class="`continuum-media-block--${attrs.kind}`" data-type="media-block">
    <div
      class="continuum-media-block__shell"
      contenteditable="false"
      @dragstart="stopEditorDrag"
      @drag="stopEditorDrag"
      @dragenter="stopEditorDrag"
      @dragover="stopEditorDrag"
      @dragleave="stopEditorDrag"
      @drop="stopEditorDrag"
      @dragend="stopEditorDrag"
    >
      <component
        v-if="HostComponent"
        :is="HostComponent"
        :attrs="attrs"
        :editable="editable"
        @update:attrs="patch"
        @delete="remove"
      />
      <div v-else class="continuum-media-block__missing">
        Media renderer unavailable.
      </div>
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.continuum-media-block { margin: 1rem 0; }
.continuum-media-block__shell { color: var(--fg, #ededed); }
.continuum-media-block__missing {
  padding: 1rem;
  border: var(--border-width-1, 1px) dashed var(--border, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-md, 8px);
  color: var(--fg-muted, #a09b90);
  font-size: 0.8125rem;
}
</style>
