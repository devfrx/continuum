<script setup lang="ts">
/**
 * views/PlaceholderView.vue — friendly empty-state for view types whose
 * renderer hasn't shipped yet.
 *
 * The component reads its label / icon / description from the registry
 * entry that ships it, so adding a real renderer later only requires
 * changing the entry's `status` and `component` — no consumer change.
 */
import { computed } from 'vue';
import { Icon } from '@/components/ui';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';
import { viewRegistry } from './registry';

const props = defineProps<DatabaseViewSurfaceProps>();
defineEmits<DatabaseViewSurfaceEmits>();

const entry = computed(() => viewRegistry[props.activeView.type]);
</script>

<template>
    <div class="view-placeholder">
        <div class="view-placeholder__icon">
            <Icon :name="entry.icon" :size="34" />
        </div>
        <h3 class="view-placeholder__title">{{ entry.label }} view</h3>
        <p class="view-placeholder__lead">{{ entry.description }}</p>
        <p class="view-placeholder__hint">
            Available in a follow-up release. The data source itself stays fully usable —
            switch to <strong>Table</strong>, <strong>Board</strong>, <strong>Gallery</strong>,
            <strong>List</strong> or <strong>Calendar</strong> to work with the rows now.
        </p>
        <p v-if="rows.length" class="view-placeholder__counter">
            {{ rows.length }} row{{ rows.length === 1 ? '' : 's' }} in this data source.
        </p>
    </div>
</template>

<style scoped>
.view-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: var(--space-2);
    padding: var(--space-10, 40px) var(--space-5);
    color: var(--text-muted);
}

.view-placeholder__icon {
    width: 56px;
    height: 56px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    border: var(--border-width-1) dashed var(--border-strong);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    margin-bottom: var(--space-2);
}

.view-placeholder__title {
    margin: 0;
    color: var(--text-primary);
    font-size: var(--text-lg);
    font-weight: var(--font-weight-semibold);
}

.view-placeholder__lead {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-secondary);
    max-width: 36ch;
}

.view-placeholder__hint {
    margin: 0;
    font-size: var(--text-xs);
    max-width: 48ch;
    color: var(--text-muted);
    line-height: var(--leading-snug, 1.45);
}

.view-placeholder__counter {
    margin-top: var(--space-2);
    font-size: var(--text-2xs);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    font-weight: var(--font-weight-semibold);
}
</style>
