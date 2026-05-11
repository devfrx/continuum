<script setup lang="ts">
/**
 * Vue NodeView for code blocks. Renders the highlighted code via TipTap's
 * standard `<NodeViewContent>` and overlays a small toolbar (language
 * picker + copy) anchored to the top-right corner. Picking a language
 * updates the node's `language` attribute, which `lowlight` consumes for
 * syntax colouring.
 *
 * The language picker uses the host application's themed `<UiSelect>`
 * when injected via `SELECT_COMPONENT_KEY`; otherwise it falls back to a
 * plain `<select>` so the package remains usable in isolation.
 */
import { computed, inject, ref, type Component } from 'vue';
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import { CODE_LANGUAGES } from './codeLanguages';
import { SELECT_COMPONENT_KEY } from './hostBridge';

const props = defineProps(nodeViewProps);

const lang = computed<string>(() => (props.node.attrs.language as string) || 'plaintext');
const langLabel = computed<string>(
    () => CODE_LANGUAGES.find((o) => o.value === lang.value)?.label ?? lang.value,
);

const SelectComponent = inject<Component | null>(SELECT_COMPONENT_KEY, null);

const copied = ref(false);
let copyTimer: ReturnType<typeof setTimeout> | null = null;

function onLangChange(value: string | number): void {
    props.updateAttributes({ language: String(value) });
}

function onNativeLangChange(e: Event): void {
    onLangChange((e.target as HTMLSelectElement).value);
}

async function onCopy(): Promise<void> {
    const text = props.node.textContent ?? '';
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        // Clipboard API can fail in unfocused / non-secure contexts.
        // Fall back to a hidden textarea + execCommand round-trip so the
        // user still gets a working copy in those edge cases.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
    }
    copied.value = true;
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copied.value = false; }, 1400);
}
</script>

<template>
    <NodeViewWrapper class="continuum-code-block" :data-language="lang">
        <div class="continuum-code-block__bar" contenteditable="false">
            <component v-if="SelectComponent" :is="SelectComponent" class="continuum-code-block__ui-select"
                :model-value="lang" :options="CODE_LANGUAGES" aria-label="Code language" variant="bare"
                @update:model-value="onLangChange" />
            <div v-else class="continuum-code-block__lang-wrap">
                <span class="continuum-code-block__lang-label">{{ langLabel }}</span>
                <select class="continuum-code-block__lang" :value="lang" :aria-label="'Code language'"
                    @change="onNativeLangChange">
                    <option v-for="o in CODE_LANGUAGES" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
            </div>
            <button type="button" class="continuum-code-block__copy" :title="copied ? 'Copied!' : 'Copy code'"
                :aria-label="copied ? 'Copied' : 'Copy code'" @click="onCopy">
                {{ copied ? 'Copied' : 'Copy' }}
            </button>
        </div>
        <pre><NodeViewContent as="code" :class="`language-${lang}`" /></pre>
    </NodeViewWrapper>
</template>
