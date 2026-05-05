<script setup lang="ts">
/**
 * FolderBreadcrumb — single-line "Inbox › A › B › C" path display.
 *
 * Each segment except the last is interactive: clicking jumps the host
 * view back to that ancestor folder via the `select` event. The leftmost
 * segment ("Inbox") represents the root scope (`folderId = null`).
 */
import { computed, onMounted } from 'vue';
import { Icon } from '@/components/ui';
import { useFolders } from '@/composables/useFolders';

const props = defineProps<{
    /** Current folder id; `null` = root only ("Inbox"). */
    folderId: string | null;
    /** Optional trailing label (e.g. the active note's title). */
    leaf?: string;
}>();

const emit = defineEmits<{
    (e: 'select', folderId: string | null): void;
}>();

const folders = useFolders();
onMounted(() => { void folders.load(); });

const path = computed(() => folders.breadcrumb(props.folderId));
</script>

<template>
    <nav class="breadcrumb" aria-label="Folder path">
        <button type="button" class="seg seg--root" @click="emit('select', null)" title="All notes">
            <Icon name="inbox" :size="12" />
            <span>Inbox</span>
        </button>

        <span v-for="(folder, idx) in path" :key="folder.id" class="hop">
            <Icon name="chevron-right" :size="10" class="sep" />
            <button type="button" class="seg" :class="{ 'seg--current': !leaf && idx === path.length - 1 }"
                @click="emit('select', folder.id)" :title="folder.name">
                <span>{{ folder.name }}</span>
            </button>
        </span>

        <span v-if="leaf" class="hop">
            <Icon name="chevron-right" :size="10" class="sep" />
            <span class="seg seg--leaf" :title="leaf">{{ leaf }}</span>
        </span>
    </nav>
</template>

<style scoped>
.breadcrumb {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    overflow: hidden;
    font-size: var(--text-xs);
    color: var(--fg-subtle);
}

.seg {
    appearance: none;
    background: transparent;
    border: none;
    color: var(--fg-muted);
    cursor: pointer;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-xs);
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs);
    line-height: 1;
}

.seg:hover {
    background: var(--bg-soft);
    color: var(--fg);
}

.seg--current {
    color: var(--fg-strong);
    cursor: default;
}

.seg--current:hover {
    background: transparent;
}

.hop {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
}

.seg--leaf {
    color: var(--fg-strong);
    cursor: default;
    padding: var(--space-1) var(--space-2);
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.sep {
    color: var(--fg-subtle);
    flex-shrink: 0;
}
</style>
