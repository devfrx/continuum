<script setup lang="ts">
/**
 * Vue NodeView for the `database` block.
 *
 * The wrapper is intentionally minimal: the editor package owns the
 * Tiptap plumbing (selection, drag handle, attribute updates) but
 * delegates the actual database UI — toolbar, table, list, cell editing
 * — to a host-supplied component injected via `DATABASE_COMPONENT_KEY`.
 * That keeps the editor package free of any `apps/web` imports while
 * still letting the host reuse its property editor registry, modals and
 * design system to render the embed.
 *
 * Contract with the host component:
 *   props:
 *     - `attrs:    DatabaseBlockAttrs`    current node attributes
 *     - `editable: boolean`               passthrough from the editor
 *   emits:
 *     - `update:attrs` (patch: Partial<DatabaseBlockAttrs>) — partial
 *       attribute updates persisted into the doc.
 *     - `delete` — request to remove the node.
 */
import { computed, inject, type Component } from 'vue';
import { NodeViewWrapper, nodeViewProps } from '@tiptap/vue-3';
import type { DatabaseBlockAttrs } from '@continuum/shared';
import { DATABASE_COMPONENT_KEY } from '../hostBridge';

const props = defineProps(nodeViewProps);

const HostComponent = inject<Component | null>(DATABASE_COMPONENT_KEY, null);

const attrs = computed<DatabaseBlockAttrs>(() => ({
    blockId: props.node.attrs.blockId,
    databaseId: props.node.attrs.databaseId,
    viewId: props.node.attrs.viewId,
    schemaVersion: props.node.attrs.schemaVersion,
}));

const editable = computed(() => props.editor?.isEditable ?? true);

function patch(partial: Partial<DatabaseBlockAttrs>): void {
    props.updateAttributes(partial);
}

function remove(): void {
    if (typeof props.deleteNode === 'function') props.deleteNode();
}
</script>

<template>
    <NodeViewWrapper class="continuum-database" data-type="database">
        <div class="continuum-database__shell" contenteditable="false">
            <component
                v-if="HostComponent"
                :is="HostComponent"
                :attrs="attrs"
                :editable="editable"
                @update:attrs="patch"
                @delete="remove"
            />
            <div v-else class="continuum-database__missing">
                <p>
                    The host application did not provide a database renderer.
                    Pass <code>database-component</code> to
                    <code>&lt;ContinuumEditor&gt;</code> to render Notion-like
                    databases inline.
                </p>
            </div>
        </div>
    </NodeViewWrapper>
</template>

<style scoped>
.continuum-database {
    margin: 1rem 0;
}

.continuum-database__shell {
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
    border-radius: var(--radius-sm, 8px);
    overflow: hidden;
    background: var(--bg-elev, #232323);
    color: var(--fg, #ededed);
}

.continuum-database__missing {
    padding: 1.25rem;
    color: var(--fg-muted, #a09b90);
    font-size: 0.875rem;
}

.continuum-database__missing code {
    background: var(--surface-hover, rgba(255, 255, 255, 0.04));
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    font-family: var(--font-mono, ui-monospace, monospace);
    font-size: 0.85em;
}
</style>
