<script setup lang="ts">
import { UiButton, UiEmpty, Icon } from '@/components/ui';
import BacklinksPanel from './BacklinksPanel.vue';
import LinkedNotesPanel from './LinkedNotesPanel.vue';
import TagsPanel from './TagsPanel.vue';
import type { Note } from '@continuum/shared';
import type { BacklinkEntry } from '@/api';

const props = defineProps<{
    note: Note | null;
    notes: Note[];
    backlinks: BacklinkEntry[];
    backlinksLoading: boolean;
    collapsed: boolean;
}>();

const emit = defineEmits<{
    (e: 'update:collapsed', value: boolean): void;
    (e: 'select', id: string): void;
}>();

function onSelect(id: string): void { emit('select', id); }
function toggle(): void { emit('update:collapsed', !props.collapsed); }
</script>

<template>
    <aside class="right-sidebar" :class="{ collapsed }">
        <header class="header">
            <h3 v-if="!collapsed">Details</h3>
            <UiButton variant="ghost" size="sm" class="toggle-btn"
                :title="collapsed ? 'Expand details' : 'Collapse details'"
                :aria-label="collapsed ? 'Expand details' : 'Collapse details'" @click="toggle">
                <Icon :name="collapsed ? 'chevron-left' : 'chevron-right'" :size="14" />
            </UiButton>
        </header>

        <div v-if="!collapsed" class="body">
            <template v-if="note">
                <LinkedNotesPanel :content="note.content" :notes="notes" @select="onSelect" />
                <BacklinksPanel :backlinks="backlinks" :loading="backlinksLoading" @select="onSelect" />
                <TagsPanel :tags="note.tags ?? []" />
            </template>
            <UiEmpty v-else title="No note selected" description="Select a note from the sidebar to see its details." />
        </div>
    </aside>
</template>

<style scoped>
.right-sidebar {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    height: 100%;
    min-height: 0;
}

.header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-4);
    min-width: 0;
}

.right-sidebar.collapsed .header {
    justify-content: center;
}

.header h3 {
    margin: 0;
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--fg-subtle);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.toggle-btn {
    flex-shrink: 0;
}

.body {
    display: flex;
    flex-direction: column;
    gap: var(--space-8);
    overflow: auto;
    min-height: 0;
}
</style>
