<script setup lang="ts">
/**
 * Vue NodeView for code blocks. Renders the highlighted code via TipTap's
 * standard `<NodeViewContent>` and overlays a small language selector
 * anchored to the top-right corner. Picking a language updates the node's
 * `language` attribute, which `lowlight` consumes for syntax colouring.
 */
import { computed } from 'vue';
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { CODE_LANGUAGES } from './extensions';

const props = defineProps(nodeViewProps);

const lang = computed<string>(() => (props.node.attrs.language as string) || 'plaintext');

function onLangChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    props.updateAttributes({ language: value });
}
</script>

<template>
    <NodeViewWrapper class="lore-code-block" :data-language="lang">
        <div class="lore-code-block__bar" contenteditable="false">
            <select class="lore-code-block__lang" :value="lang" @change="onLangChange">
                <option v-for="o in CODE_LANGUAGES" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
        </div>
        <pre><NodeViewContent as="code" /></pre>
    </NodeViewWrapper>
</template>

<style>
.lore-code-block {
    position: relative;
    margin: 0.6em 0;
}

.lore-code-block pre {
    background: var(--bg-soft);
    padding: var(--space-7) var(--space-8);
    padding-top: calc(var(--space-7) + 22px);
    border-radius: var(--radius-md);
    overflow-x: auto;
    font-family: var(--font-mono);
    border: var(--border-width-1) solid var(--border);
    margin: 0;
}

.lore-code-block__bar {
    position: absolute;
    top: var(--space-3);
    right: var(--space-4);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    z-index: 1;
}

.lore-code-block__lang {
    appearance: none;
    background: var(--bg-elev);
    color: var(--fg-muted);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px var(--space-5) 2px var(--space-3);
    font-size: var(--text-xs);
    font-family: var(--font-sans);
    cursor: pointer;
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.lore-code-block__lang:hover {
    border-color: var(--border-strong);
    color: var(--fg);
}

.lore-code-block__lang:focus {
    outline: none;
    border-color: var(--border-strong);
}
</style>
