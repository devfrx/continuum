<script setup lang="ts">
/** NodeView for the Tabs block; tab bodies remain native editor content. */
import { computed, inject, onMounted, ref, type Component } from 'vue';
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { TextSelection } from '@tiptap/pm/state';
import { ICON_COMPONENT_KEY } from '../hostBridge';
import { createTabId, createTabPanelAttrs, normalizeTabPanelAttrs, type TabPanelAttrs } from './tabsTypes';

interface PanelView {
  attrs: TabPanelAttrs;
  from: number;
  to: number;
}

const props = defineProps(nodeViewProps);
const IconComponent = inject<Component | null>(ICON_COMPONENT_KEY, null);
const localActiveId = ref<string | null>(null);
const editable = computed(() => props.editor?.isEditable ?? true);

const panels = computed<PanelView[]>(() => {
  const parentPos = getParentPos();
  const out: PanelView[] = [];
  props.node.forEach((node, offset) => {
    if (node.type.name !== 'tabPanel') return;
    const from = parentPos === null ? 0 : parentPos + 1 + offset;
    out.push({ attrs: normalizeTabPanelAttrs(node.attrs), from, to: from + node.nodeSize });
  });
  return out;
});

const activePanelId = computed(() => {
  const ids = new Set(panels.value.map((panel) => panel.attrs.id));
  if (localActiveId.value && ids.has(localActiveId.value)) return localActiveId.value;
  const activeAttr = panels.value.find((panel) => panel.attrs.active)?.attrs.id ?? null;
  if (activeAttr && ids.has(activeAttr)) return activeAttr;
  const persisted = typeof props.node.attrs.activeTabId === 'string' ? props.node.attrs.activeTabId : null;
  if (persisted && ids.has(persisted)) return persisted;
  return panels.value[0]?.attrs.id ?? null;
});

const activePanel = computed(() => panels.value.find((panel) => panel.attrs.id === activePanelId.value) ?? null);

function getParentPos(): number | null {
  if (typeof props.getPos !== 'function') return null;
  const pos = props.getPos();
  return typeof pos === 'number' ? pos : null;
}

function setActiveTab(id: string): void {
  localActiveId.value = id;
  if (!editable.value) return;
  activatePanel(id);
}

function ensureActivePanelState(): void {
  if (!editable.value || panels.value.length === 0) return;
  const activePanels = panels.value.filter((panel) => panel.attrs.active);
  const activeId = activePanelId.value;
  if (!activeId) return;
  if (activePanels.length === 1 && activePanels[0]?.attrs.id === activeId) return;
  activatePanel(activeId);
}

function addTab(): void {
  if (!editable.value) return;
  const parentPos = getParentPos();
  const tabPanel = props.editor.schema.nodes.tabPanel;
  const paragraph = props.editor.schema.nodes.paragraph;
  if (parentPos === null || !tabPanel || !paragraph) return;
  const attrs = createTabPanelAttrs({ id: createTabId(), title: `Tab ${panels.value.length + 1}`, active: true });
  const panelNode = tabPanel.create(attrs, paragraph.create());
  const insertPos = parentPos + props.node.nodeSize - 1;
  const tr = props.editor.state.tr;
  for (const panel of panels.value) {
    tr.setNodeMarkup(panel.from, undefined, createTabPanelAttrs({ ...panel.attrs, active: false }));
  }
  tr.insert(insertPos, panelNode);
  tr.setNodeMarkup(parentPos, undefined, { ...props.node.attrs, activeTabId: attrs.id });
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 2))).scrollIntoView();
  props.editor.view.dispatch(tr);
  props.editor.view.focus();
  localActiveId.value = attrs.id;
}

function removeTab(id: string): void {
  if (!editable.value || panels.value.length <= 1) return;
  const parentPos = getParentPos();
  const index = panels.value.findIndex((panel) => panel.attrs.id === id);
  const panel = panels.value[index];
  const nextPanel = panels.value[index + 1] ?? panels.value[index - 1] ?? null;
  if (parentPos === null || !panel || !nextPanel) return;
  const tr = props.editor.state.tr;
  for (const item of panels.value) {
    tr.setNodeMarkup(item.from, undefined, createTabPanelAttrs({
      ...item.attrs,
      active: item.attrs.id === nextPanel.attrs.id,
    }));
  }
  tr.setNodeMarkup(parentPos, undefined, { ...props.node.attrs, activeTabId: nextPanel.attrs.id });
  tr.delete(panel.from, panel.to);
  tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(panel.from + 2, tr.doc.content.size))));
  props.editor.view.dispatch(tr.scrollIntoView());
  localActiveId.value = nextPanel.attrs.id;
}

function renameTab(id: string, title: string): void {
  if (!editable.value) return;
  const panel = panels.value.find((item) => item.attrs.id === id);
  if (!panel) return;
  props.editor.view.dispatch(
    props.editor.state.tr.setNodeMarkup(panel.from, undefined, createTabPanelAttrs({ ...panel.attrs, title })),
  );
}

function renameActiveTab(event: Event): void {
  const panel = activePanel.value;
  const input = event.target instanceof HTMLInputElement ? event.target : null;
  if (!panel || !input) return;
  renameTab(panel.attrs.id, input.value);
}

function activatePanel(id: string): void {
  const parentPos = getParentPos();
  if (parentPos === null) return;
  const tr = props.editor.state.tr;
  for (const panel of panels.value) {
    tr.setNodeMarkup(panel.from, undefined, createTabPanelAttrs({ ...panel.attrs, active: panel.attrs.id === id }));
  }
  tr.setNodeMarkup(parentPos, undefined, { ...props.node.attrs, activeTabId: id });
  props.editor.view.dispatch(tr);
}

onMounted(ensureActivePanelState);
</script>

<template>
  <NodeViewWrapper class="continuum-tabs" data-type="tabs" :data-active-tab-id="activePanelId ?? ''">
    <div class="continuum-tabs__inner">
      <div class="continuum-tabs__chrome" contenteditable="false">
        <div class="continuum-tabs__topline">
          <span class="continuum-tabs__label">
            <component v-if="IconComponent" :is="IconComponent" name="tabs" :size="14" />
            <span>Tabs</span>
          </span>
          <div v-if="editable && activePanel" class="continuum-tabs__tools">
            <input class="continuum-tabs__title" :value="activePanel.attrs.title" placeholder="Tab name"
              @input="renameActiveTab" />
            <button type="button" class="continuum-tabs__icon-btn" title="Delete tab" :disabled="panels.length <= 1"
              @click.stop.prevent="removeTab(activePanel.attrs.id)">
              <component v-if="IconComponent" :is="IconComponent" name="trash" :size="13" />
              <span v-else>x</span>
            </button>
          </div>
        </div>
        <div class="continuum-tabs__bar" role="tablist" aria-label="Tabs">
          <button v-for="panel in panels" :key="panel.attrs.id" type="button" class="continuum-tabs__tab"
            :class="{ 'is-active': panel.attrs.id === activePanelId }" role="tab"
            :aria-selected="panel.attrs.id === activePanelId" @click.stop.prevent="setActiveTab(panel.attrs.id)">
            <span>{{ panel.attrs.title }}</span>
          </button>
          <button v-if="editable" type="button" class="continuum-tabs__icon-btn" title="Add tab" @click.stop.prevent="addTab">
            <component v-if="IconComponent" :is="IconComponent" name="plus" :size="13" />
            <span v-else>+</span>
          </button>
        </div>
      </div>
      <NodeViewContent class="continuum-tabs__content" />
    </div>
  </NodeViewWrapper>
</template>

<style scoped>
.continuum-tabs { display: block; margin: 1rem 0; padding: var(--space-3); background: color-mix(in srgb, var(--bg-elev) 92%, var(--bg-soft)); border: var(--border-width-1) solid var(--border); border-radius: var(--radius-md); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.08); }
.continuum-tabs__inner,
.continuum-tabs__chrome { display: grid; gap: var(--space-2); }
.continuum-tabs__chrome { margin-bottom: var(--space-2); }
.continuum-tabs__topline,
.continuum-tabs__bar,
.continuum-tabs__tools { display: flex; align-items: center; gap: var(--space-1); min-width: 0; }
.continuum-tabs__topline { justify-content: space-between; gap: var(--space-3); }
.continuum-tabs__label { display: inline-flex; align-items: center; gap: var(--space-2); color: var(--fg-subtle); font-size: var(--text-2xs); font-weight: var(--font-weight-semibold); letter-spacing: var(--tracking-wide); text-transform: uppercase; }
.continuum-tabs__bar { overflow-x: auto; padding: 3px; background: var(--bg-soft); border: var(--border-width-1) solid color-mix(in srgb, var(--border) 70%, transparent); border-radius: var(--radius-sm); }
.continuum-tabs__tab,
.continuum-tabs__icon-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 28px; border: var(--border-width-1) solid transparent; border-radius: var(--radius-sm); background: transparent; color: var(--fg-muted); cursor: pointer; font-size: var(--text-xs); }
.continuum-tabs__tab { flex: 0 0 auto; max-width: 180px; padding: 0 var(--space-3); }
.continuum-tabs__tab span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.continuum-tabs__tab:hover,
.continuum-tabs__icon-btn:hover:not(:disabled) { background: var(--bg-soft); color: var(--fg); }
.continuum-tabs__tab.is-active { background: var(--bg-elev); border-color: var(--accent-border); color: var(--fg-strong); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.08); }
.continuum-tabs__icon-btn { flex: 0 0 auto; width: 28px; padding: 0; }
.continuum-tabs__icon-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.continuum-tabs__title { width: min(220px, 100%); height: 28px; padding: 0 var(--space-2); appearance: none; background: transparent; border: var(--border-width-1) solid transparent; border-radius: var(--radius-sm); color: var(--fg); font-size: var(--text-xs); }
.continuum-tabs__title:focus,
.continuum-tabs__title:focus-visible { outline: none; border-color: transparent; box-shadow: none; }
:deep(.continuum-tabs__content > [data-type='tab-panel']) { min-height: 108px; padding: var(--space-4); background: var(--bg-soft); border: var(--border-width-1) solid color-mix(in srgb, var(--border) 74%, transparent); border-radius: var(--radius-sm); }
:deep(.continuum-tabs__content > [data-type='tab-panel'][data-active='false']) { display: none; }
:deep(.continuum-tabs__content > [data-type='tab-panel'] > :first-child) { margin-top: 0; }
:deep(.continuum-tabs__content > [data-type='tab-panel'] > :last-child) { margin-bottom: 0; }
</style>