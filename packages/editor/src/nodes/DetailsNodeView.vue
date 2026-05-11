<script setup lang="ts">
/**
 * Vue NodeView for the `details` (Toggle) node.
 *
 * Schema: `details → (detailsSummary, detailsContent)`. Tiptap renders both
 * children inside the single `<NodeViewContent>` slot below; CSS in this
 * file styles the first child as the summary row and hides the second when
 * the block is collapsed.
 *
 * The chevron lives outside the editable region so clicks on it never reach
 * ProseMirror (which would otherwise place a cursor instead of toggling).
 */
import { computed } from 'vue';
import { NodeViewWrapper, NodeViewContent, nodeViewProps } from '@tiptap/vue-3';

const props = defineProps(nodeViewProps);

const isOpen = computed<boolean>(() => Boolean(props.node.attrs.open));

function toggle(): void {
    props.updateAttributes({ open: !isOpen.value });
}
</script>

<template>
    <NodeViewWrapper as="div" class="continuum-details" :data-open="isOpen ? 'true' : 'false'">
        <button type="button" class="continuum-details__chevron" :aria-expanded="isOpen ? 'true' : 'false'"
            contenteditable="false" @click.stop.prevent="toggle" @mousedown.stop.prevent>
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6.5a1 1 0 0 1 1.6-.8l6 4.5a1 1 0 0 1 0 1.6l-6 4.5A1 1 0 0 1 9 17.5v-11Z"
                    fill="currentColor" />
            </svg>
        </button>
        <NodeViewContent class="continuum-details__body" />
    </NodeViewWrapper>
</template>

<style scoped>
.continuum-details {
    position: relative;
    margin: 0.6em 0;
    padding: var(--space-3) var(--space-4) var(--space-3) calc(22px + var(--space-3) + var(--space-3));
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
}

.continuum-details__chevron {
    position: absolute;
    top: calc(var(--space-3) + 4px);
    left: var(--space-3);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    background: transparent;
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-xs);
    color: var(--fg-muted);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard);
}

.continuum-details__chevron:hover {
    background: var(--bg-elev);
    color: var(--fg-strong);
}

.continuum-details[data-open='true']>.continuum-details__chevron {
    transform: rotate(90deg);
}

.continuum-details__body {
    display: block;
}

/* Hide content children when collapsed (keep first child = summary visible). */
.continuum-details[data-open='false']>.continuum-details__body> :nth-child(n+2) {
    display: none;
}

/* First child is the summary row — editable label. */
.continuum-details__body> :first-child {
    font-weight: var(--font-weight-semibold);
    color: var(--fg-strong);
    margin: 0;
    padding: var(--space-1) 0;
    list-style: none;
    outline: none;
    cursor: text;
}

.continuum-details__body> :first-child::-webkit-details-marker,
.continuum-details__body> :first-child::marker {
    display: none;
    content: '';
}

.continuum-details__body> :nth-child(n+2) {
    margin-top: var(--space-2);
}
</style>
