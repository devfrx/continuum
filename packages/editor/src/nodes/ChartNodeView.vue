<script setup lang="ts">
/**
 * Vue NodeView for the Chart block.
 *
 * Composition:
 *   - `<ChartCanvas>` renders the Chart.js instance (single-responsibility,
 *     does not know about editing).
 *   - `<ChartToolbar>` exposes the kind picker, options toggles, and a
 *     "Edit data" button.
 *   - `<ChartDataEditor>` (lazily shown) edits labels and datasets in a
 *     compact form panel.
 *
 * All three sub-components live in this folder and consume the typed
 * attribute objects defined in `chartTypes.ts`.
 */
import { ref, computed, inject, type Component } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { SELECT_COMPONENT_KEY } from '../hostBridge';
import {
    type ChartAttrs,
    type ChartKind,
    type ChartData,
    type ChartOptions,
} from './chartTypes';
import ChartCanvas from './ChartCanvas.vue';
import ChartToolbar from './ChartToolbar.vue';
import ChartDataEditor from './ChartDataEditor.vue';

const props = defineProps(nodeViewProps);

const SelectComponent = inject<Component | null>(SELECT_COMPONENT_KEY, null);

const editing = ref(false);

/**
 * Chart blocks live inside the editor doc, so the lock state of the
 * host note flows through `editor.isEditable`. When the editor is
 * read-only, every write affordance (title input, toolbar controls,
 * inline data editor) must be inert — both visually and behaviourally
 * — so a locked note can never mutate the chart through the embed.
 */
const editable = computed(() => props.editor?.isEditable ?? true);

const attrs = computed<ChartAttrs>(() => ({
    kind: props.node.attrs.kind as ChartKind,
    data: props.node.attrs.data as ChartData,
    options: props.node.attrs.options as ChartOptions,
}));

function patch(partial: Partial<ChartAttrs>): void {
    if (!editable.value) return;
    props.updateAttributes(partial);
}

function onKind(kind: ChartKind): void {
    patch({ kind });
}

function onOptions(options: ChartOptions): void {
    patch({ options: { ...attrs.value.options, ...options } });
}

function onData(data: ChartData): void {
    patch({ data });
}

function onTitle(title: string): void {
    if (!editable.value) return;
    patch({ options: { ...attrs.value.options, title } });
}

function onToggleEdit(): void {
    if (!editable.value) return;
    editing.value = !editing.value;
}

function remove(): void {
    if (!editable.value) return;
    if (typeof props.deleteNode === 'function') props.deleteNode();
}
</script>

<template>
    <NodeViewWrapper class="continuum-chart" :class="{ 'is-readonly': !editable }" data-type="chart">
        <div class="continuum-chart__shell" contenteditable="false">
            <header class="continuum-chart__head">
                <input type="text" class="continuum-chart__title" :value="attrs.options.title ?? ''"
                    placeholder="Chart title" :readonly="!editable" :disabled="!editable"
                    @input="(e) => onTitle((e.target as HTMLInputElement).value)" />
                <ChartToolbar :kind="attrs.kind" :options="attrs.options" :select-component="SelectComponent"
                    :editing="editing" :editable="editable" @update:kind="onKind" @update:options="onOptions"
                    @toggle-edit="onToggleEdit" @remove="remove" />
            </header>

            <div class="continuum-chart__canvas-wrap">
                <ChartCanvas :kind="attrs.kind" :data="attrs.data" :options="attrs.options" />
            </div>

            <ChartDataEditor v-if="editing && editable" :data="attrs.data" @update:data="onData" />
        </div>
    </NodeViewWrapper>
</template>

<style scoped>
.continuum-chart {
    margin: var(--space-4, 16px) 0;
}

.continuum-chart__shell {
    display: flex;
    flex-direction: column;
    gap: var(--space-3, 12px);
    padding: var(--space-4, 16px);
    background: var(--bg-soft, #f6f6f6);
    border: var(--border-width-1, 1px) solid var(--border, #e0e0e0);
    border-radius: var(--radius-md, 8px);
}

.continuum-chart__head {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    justify-content: space-between;
}

.continuum-chart__title {
    flex: 1 1 auto;
    appearance: none;
    background: transparent;
    border: none;
    color: var(--fg, inherit);
    font-size: var(--text-md, 15px);
    font-weight: var(--font-weight-semibold, 600);
    padding: 4px 6px;
    border-radius: var(--radius-xs, 4px);
    min-width: 0;
}

.continuum-chart__title:focus {
    outline: none;
    background: var(--bg-elev, rgba(0, 0, 0, 0.04));
}

.continuum-chart__canvas-wrap {
    position: relative;
    width: 100%;
    height: 320px;
}
</style>
