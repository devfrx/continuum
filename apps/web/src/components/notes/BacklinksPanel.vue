<script setup lang="ts">
import { colorForKind } from '@continuum/graph';
import { UiSection, UiCard, UiBadge, UiEmpty, Icon } from '@/components/ui';
import { graphDisplayLabel } from '@/utils/graphLabels';
import type { BacklinkEntry } from '@/api';

defineProps<{
    backlinks: BacklinkEntry[];
    loading: boolean;
}>();

const emit = defineEmits<{ (e: 'select', id: string): void }>();

function displayTitle(title: string): string {
    return graphDisplayLabel(title || 'Untitled', 42);
}
</script>

<template>
    <UiSection title="Backlinks">
        <div v-if="loading && !backlinks.length" class="loading">Loading…</div>
        <ul v-else-if="backlinks.length" class="link-list">
            <li v-for="b in backlinks" :key="b.id">
                <UiCard interactive class="card" @click="emit('select', b.id)">
                    <div class="row">
                        <span class="dot" :style="{ background: colorForKind(b.kind) }" />
                        <Icon name="connection" :size="14" class="row-ico" />
                        <span class="link-title">{{ displayTitle(b.title) }}</span>
                        <UiBadge tone="neutral" size="sm" class="badge">{{ b.kind }}</UiBadge>
                    </div>
                    <p class="snippet">{{ b.snippet }}</p>
                </UiCard>
            </li>
        </ul>
        <UiEmpty v-else title="No backlinks yet"
            description="Mention this note from another with [[Title]] to create one." />
    </UiSection>
</template>

<style scoped>
.link-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.card {
    width: 100%;
    padding: var(--space-4) !important;
    gap: var(--space-2) !important;
}

.loading {
    font-size: var(--text-sm);
    color: var(--fg-subtle);
    padding: var(--space-2) var(--space-1);
}

.row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
}

.link-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.badge {
    flex-shrink: 0;
}

.dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-circle);
    flex-shrink: 0;
    display: inline-block;
}

.row-ico {
    color: var(--fg-subtle);
    flex-shrink: 0;
}

.snippet {
    margin: var(--space-2) 0 0;
    font-size: var(--text-sm);
    color: var(--fg-muted);
    line-height: var(--leading-snug);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}
</style>
