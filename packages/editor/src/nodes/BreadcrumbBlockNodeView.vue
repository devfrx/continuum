<script setup lang="ts">
/**
 * NodeView wrapper for `breadcrumbBlock`.
 *
 * The editor package owns node selection, attr updates and deletion;
 * the host owns the actual folder UI because it already has the folder
 * store and route/navigation semantics.
 */
import { computed, inject, type Component } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import type { BreadcrumbBlockAttrs } from './breadcrumbBlockTypes';
import {
  BREADCRUMB_COMPONENT_KEY,
  EDITOR_NOTE_CONTEXT_KEY,
  type EditorNoteContext,
} from '../hostBridge';

const props = defineProps(nodeViewProps);

const HostComponent = inject<Component | null>(BREADCRUMB_COMPONENT_KEY, null);
const noteContextRef = inject(EDITOR_NOTE_CONTEXT_KEY, null);

const attrs = computed<BreadcrumbBlockAttrs>(() => ({
  showLeaf: props.node.attrs.showLeaf !== false,
  schemaVersion: Number(props.node.attrs.schemaVersion ?? 1),
}));

const context = computed<EditorNoteContext | null>(() => noteContextRef?.value ?? null);
const editable = computed(() => props.editor?.isEditable ?? true);

function patch(partial: Partial<BreadcrumbBlockAttrs>): void {
  if (!editable.value) return;
  props.updateAttributes(partial);
}

function remove(): void {
  if (!editable.value) return;
  if (typeof props.deleteNode === 'function') props.deleteNode();
}
</script>

<template>
  <NodeViewWrapper class="continuum-breadcrumb-block" data-type="breadcrumb-block">
    <div class="continuum-breadcrumb-block__shell" contenteditable="false">
      <component
        v-if="HostComponent"
        :is="HostComponent"
        :attrs="attrs"
        :context="context"
        :editable="editable"
        @update:attrs="patch"
        @delete="remove"
      />
      <div v-else class="continuum-breadcrumb-block__missing">
        Breadcrumb renderer unavailable.
      </div>
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.continuum-breadcrumb-block { margin: 0.75rem 0; }
.continuum-breadcrumb-block__shell { color: var(--fg, #ededed); }
.continuum-breadcrumb-block__missing {
  padding: 0.75rem 1rem;
  border: var(--border-width-1, 1px) dashed var(--border, rgba(255, 255, 255, 0.12));
  border-radius: var(--radius-md, 8px);
  color: var(--fg-muted, #a09b90);
  font-size: 0.8125rem;
}
</style>
