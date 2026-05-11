<script setup lang="ts">
/**
 * Bottom-left card showing the selected node's metadata + the
 * action row (Open / Focus / Pin / Link / Isolate / Export).
 */
import { Icon, UiButton, UiCard } from '@/components/ui';
import type { AppIconName as IconName } from '@/assets/icons';
import type { SelectedInfo } from '@/composables/graph/useGraphSelection';

interface Props {
    selected: SelectedInfo;
    highlighted: boolean;
    kindColor: string;
    kindLabel: string;
    iconName: IconName;
}
defineProps<Props>();

const emit = defineEmits<{
    close: [];
    open: [id: string];
    focus: [];
    'toggle-highlight': [];
    link: [];
    isolate: [];
    export: [];
}>();
</script>

<template>
    <div class="selected-wrap" @click.stop>
        <UiCard padded>
            <div class="sel-head">
                <span class="dot" :style="{ background: kindColor }" />
                <Icon :name="iconName" size="14" />
                <span class="sel-kind">{{ kindLabel }}</span>
                <button type="button" class="sel-close" title="Close (Esc)" aria-label="Close details"
                    @click="emit('close')">
                    <Icon name="close" size="14" />
                </button>
            </div>
            <strong class="sel-title">{{ selected.label }}</strong>
            <div class="sel-meta">
                <span>In {{ selected.inDegree }}</span>
                <span class="dot-sep">·</span>
                <span>Out {{ selected.outDegree }}</span>
                <span class="dot-sep">·</span>
                <span>Wikilinks {{ selected.wikilinkCount }}</span>
                <span class="dot-sep">·</span>
                <span>Related {{ selected.relatedCount }}</span>
            </div>
            <div class="sel-actions">
                <UiButton variant="primary" size="sm" @click="emit('open', selected.id)">
                    <template #icon-left>
                        <Icon name="node" size="14" />
                    </template>
                    Open
                </UiButton>
                <UiButton variant="subtle" size="sm" @click="emit('focus')">
                    <template #icon-left>
                        <Icon name="fit-screen" size="14" />
                    </template>
                    Focus
                </UiButton>
                <UiButton variant="subtle" size="sm" @click="emit('toggle-highlight')">
                    <template #icon-left>
                        <Icon name="sparkles" size="14" />
                    </template>
                    {{ highlighted ? 'Unpin' : 'Pin' }}
                </UiButton>
                <UiButton variant="ghost" size="sm" @click="emit('link')">
                    <template #icon-left>
                        <Icon name="link" size="14" />
                    </template>
                    Link
                </UiButton>
                <UiButton variant="ghost" size="sm" @click="emit('isolate')">
                    <template #icon-left>
                        <Icon name="eye-off" size="14" />
                    </template>
                    Isolate
                </UiButton>
                <UiButton variant="ghost" size="sm" @click="emit('export')">
                    <template #icon-left>
                        <Icon name="download" size="14" />
                    </template>
                    Export
                </UiButton>
            </div>
        </UiCard>
    </div>
</template>

<style scoped>
.selected-wrap {
    position: absolute;
    bottom: var(--space-5);
    left: var(--space-5);
    width: 292px;
    z-index: var(--z-raised);
}

.sel-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-sm);
    color: var(--fg-muted);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
}

.sel-kind {
    text-transform: capitalize;
}

.sel-close {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: var(--radius-sm);
    background: transparent;
    border: var(--border-width-1) solid transparent;
    color: var(--fg-muted);
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.sel-close:hover {
    background: var(--bg-elev-2);
    color: var(--fg);
    border-color: var(--border);
}

.sel-close:focus-visible {
    outline: none;
    box-shadow: var(--shadow-focus);
}

.sel-title {
    font-size: var(--text-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--fg-strong);
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sel-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    font-size: var(--text-sm);
    color: var(--fg-muted);
}

.sel-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-3);
    margin-top: var(--space-2);
}

.sel-actions :deep(.ui-btn) {
    min-width: 0;
    width: 100%;
}

.sel-actions :deep(.ui-btn:first-child) {
    grid-column: 1 / -1;
}

.dot-sep {
    color: var(--fg-subtle);
}

.dot {
    width: 10px;
    height: 10px;
    border-radius: var(--radius-circle);
    display: inline-block;
    flex-shrink: 0;
}

@media (max-width: 720px) {
    .selected-wrap {
        width: auto;
        left: var(--space-3);
        right: var(--space-3);
        bottom: calc(var(--space-3) + 44px);
    }
}
</style>
