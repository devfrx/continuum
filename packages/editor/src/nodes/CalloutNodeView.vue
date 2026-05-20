<script setup lang="ts">
/**
 * Vue NodeView for Callout â€” exposes a clickable icon button that opens
 * a picker with two tabs:
 *
 *   - **App icons** â€” a searchable grid sourced from the host
 *     application's icon registry (injected via `ICON_CATALOG_KEY`).
 *   - **Custom URL** â€” paste an external image URL (e.g. icons8) to use
 *     as the callout glyph.
 *
 * The selection is persisted in the node's single `icon` attribute using
 * a tiny prefixed scheme (`name:<id>`, `url:<href>`, otherwise treated as
 * a literal grapheme for back-compat with older notes).
 */
import { ref, computed, inject, onMounted, onBeforeUnmount, type Component } from 'vue';
import { NodeViewContent, NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import {
    ICON_CATALOG_KEY,
    ICON_COMPONENT_KEY,
    type IconCatalogEntry,
} from '../hostBridge';
import { useContinuumScrollLock } from '../composables/useContinuumScrollLock';

const props = defineProps(nodeViewProps);

/** Default fallback when no host icon catalog is provided. */
const FALLBACK_EMOJI = '\u{1F4A1}';

const iconCatalog = inject<IconCatalogEntry[]>(ICON_CATALOG_KEY, []);
const IconComponent = inject<Component | null>(ICON_COMPONENT_KEY, null);

interface ParsedIcon {
    kind: 'name' | 'url' | 'emoji';
    value: string;
}

function parseIcon(raw: unknown): ParsedIcon {
    const s = typeof raw === 'string' && raw.length > 0 ? raw : FALLBACK_EMOJI;
    if (s.startsWith('name:')) return { kind: 'name', value: s.slice(5) };
    if (s.startsWith('url:')) return { kind: 'url', value: s.slice(4) };
    return { kind: 'emoji', value: s };
}

function serializeIcon(parsed: ParsedIcon): string {
    if (parsed.kind === 'name') return `name:${parsed.value}`;
    if (parsed.kind === 'url') return `url:${parsed.value}`;
    return parsed.value;
}

const current = computed<ParsedIcon>(() => parseIcon(props.node.attrs.icon));

const open = ref(false);
useContinuumScrollLock(open);
const tab = ref<'icons' | 'url'>('icons');
const search = ref('');
const urlValue = ref('');
const root = ref<HTMLElement | null>(null);

const filteredIcons = computed<IconCatalogEntry[]>(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return iconCatalog;
    return iconCatalog.filter((entry) => {
        return (
            entry.id.toLowerCase().includes(q) ||
            entry.label.toLowerCase().includes(q) ||
            (entry.group?.toLowerCase().includes(q) ?? false)
        );
    });
});

function toggle(): void {
    open.value = !open.value;
    if (open.value) {
        search.value = '';
        urlValue.value = current.value.kind === 'url' ? current.value.value : '';
        // Default to the URL tab when no catalog was provided so the
        // picker is still useful in standalone embeddings.
        tab.value = iconCatalog.length === 0 ? 'url' : 'icons';
    }
}

function pickName(id: string): void {
    props.updateAttributes({ icon: serializeIcon({ kind: 'name', value: id }) });
    open.value = false;
}

function pickUrl(): void {
    const href = urlValue.value.trim();
    if (!href) return;
    // Reject obviously unsafe schemes; allow http(s) and data: URLs only.
    if (!/^(https?:|data:image\/)/i.test(href)) return;
    props.updateAttributes({ icon: serializeIcon({ kind: 'url', value: href }) });
    open.value = false;
}

function onUrlKey(ev: KeyboardEvent): void {
    if (ev.key === 'Enter') {
        ev.preventDefault();
        pickUrl();
    } else if (ev.key === 'Escape') {
        open.value = false;
    }
}

function onDocClick(ev: MouseEvent): void {
    if (!open.value) return;
    if (root.value && !root.value.contains(ev.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener('mousedown', onDocClick));
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick));
</script>

<template>
    <NodeViewWrapper class="continuum-callout" data-type="callout">
        <div ref="root" class="continuum-callout__icon-wrap" contenteditable="false">
            <button type="button" class="continuum-callout__icon-btn" :title="'Change icon'" :aria-label="'Change icon'"
                @click="toggle">
                <component v-if="current.kind === 'name' && IconComponent" :is="IconComponent" :name="current.value"
                    :size="20" />
                <img v-else-if="current.kind === 'url'" :src="current.value" alt="" class="continuum-callout__icon-img"
                    referrerpolicy="no-referrer" />
                <span v-else class="continuum-callout__icon-emoji">{{ current.value }}</span>
            </button>

            <div v-if="open" class="continuum-callout__picker" role="dialog" aria-label="Pick callout icon"
                data-continuum-scroll-lock-allow="true">
                <div class="continuum-callout__tabs" role="tablist">
                    <button v-if="iconCatalog.length > 0" type="button" role="tab" :aria-selected="tab === 'icons'"
                        class="continuum-callout__tab" :class="{ active: tab === 'icons' }" @click="tab = 'icons'">App
                        icons</button>
                    <button type="button" role="tab" :aria-selected="tab === 'url'" class="continuum-callout__tab"
                        :class="{ active: tab === 'url' }" @click="tab = 'url'">Custom URL</button>
                </div>

                <div v-if="tab === 'icons'" class="continuum-callout__icons-tab">
                    <input v-model="search" type="text" class="continuum-callout__search" placeholder="Search iconsâ€¦"
                        autofocus />
                    <div class="continuum-callout__grid">
                        <button v-for="entry in filteredIcons" :key="entry.id" type="button"
                            class="continuum-callout__swatch" :class="{
                                active: current.kind === 'name' && current.value === entry.id,
                            }" :title="entry.label" :aria-label="entry.label" @click="pickName(entry.id)">
                            <component v-if="IconComponent" :is="IconComponent" :name="entry.id" :size="18" />
                            <span v-else class="continuum-callout__swatch-fallback">{{ entry.id.slice(0, 2) }}</span>
                        </button>
                    </div>
                    <div v-if="filteredIcons.length === 0" class="continuum-callout__empty">No icons match.</div>
                </div>

                <div v-else class="continuum-callout__url-tab">
                    <label class="continuum-callout__label" for="continuum-callout-url">Image URL</label>
                    <input id="continuum-callout-url" v-model="urlValue" type="url" class="continuum-callout__url-input"
                        placeholder="https://img.icons8.com/â€¦" autofocus @keydown="onUrlKey" />
                    <div class="continuum-callout__url-row">
                        <div class="continuum-callout__url-preview" aria-hidden="true">
                            <img v-if="urlValue.trim()" :src="urlValue.trim()" alt="" referrerpolicy="no-referrer" />
                            <span v-else class="continuum-callout__url-placeholder">?</span>
                        </div>
                        <button type="button" class="continuum-callout__url-btn" :disabled="!urlValue.trim()"
                            @click="pickUrl">Use this image</button>
                    </div>
                    <p class="continuum-callout__hint">Paste a link from icons8, flaticon, or any direct image URL.</p>
                </div>
            </div>
        </div>
        <NodeViewContent class="continuum-callout__body" />
    </NodeViewWrapper>
</template>

