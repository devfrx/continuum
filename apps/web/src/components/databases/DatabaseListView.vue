<script setup lang="ts">
/**
 * Compact list renderer. Each row is rendered as a horizontal entry
 * with the note title on the left and a one-line resolved-property
 * summary on the right. Title click opens the underlying note.
 *
 * Implements the shared `DatabaseViewSurfaceProps` contract so it can
 * be mounted by the central view registry. Most surface props are
 * unused (`schema`, `activeView`, `draftRequest`) but declared for
 * `<component :is>` interchangeability with the other renderers.
 */
import { Icon } from '@/components/ui';
import type { DatabaseRowSnapshot, PropertyOption } from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './views/types';
import { useDatabaseRowDisplay } from './useDatabaseRowDisplay';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);

function summarize(row: DatabaseRowSnapshot): string {
    const parts: string[] = [];
    for (const entry of row.properties.slice(0, 3)) {
        const value = entry.value;
        if (!value) continue;
        if (value.type === 'text' || value.type === 'longText') parts.push(value.value);
        else if (value.type === 'number') parts.push(String(value.value));
        else if (value.type === 'checkbox') parts.push(value.value ? '✓' : '✗');
        else if (value.type === 'date') parts.push(value.value);
        else if (value.type === 'select' || value.type === 'status') {
            const cfg = (entry.definition.config ?? {}) as { options?: PropertyOption[] };
            const opt = cfg.options?.find((o) => o.id === value.value);
            parts.push(opt?.label ?? value.value);
        } else if (value.type === 'multiSelect') {
            const cfg = (entry.definition.config ?? {}) as { options?: PropertyOption[] };
            parts.push(value.value.map((id) => cfg.options?.find((o) => o.id === id)?.label ?? id).join(', '));
        } else if (value.type === 'url' || value.type === 'email' || value.type === 'phone') {
            parts.push(value.value);
        }
    }
    return parts.join(' · ');
}

function openRow(row: DatabaseRowSnapshot): void {
    openRowById(row.noteId);
}
</script>

<template>
    <ul class="db-list" :class="{ 'db-list--wrap': common.wrapContent }">
        <li v-if="!props.rows.length" class="db-list__empty">No rows yet.</li>
        <li v-for="row in props.rows" :key="row.rowId" class="db-list__row">
            <Icon
                v-if="common.showPageIcon"
                :name="iconOf(row.note.kind)"
                :size="14"
                class="db-list__icon"
                :style="{ color: colorOf(row.note.kind) }" />
            <div class="db-list__main" @click="openRow(row)">
                <strong class="db-list__title">{{ row.note.title || 'Untitled' }}</strong>
                <span class="db-list__meta">{{ summarize(row) }}</span>
            </div>
            <button
                v-if="props.editable"
                type="button"
                class="db-list__action"
                title="Remove from database"
                @click.stop="emit('remove-row', row.rowId)">
                <Icon name="trash" :size="12" />
            </button>
        </li>
    </ul>
</template>

<style scoped>
.db-list {
    list-style: none;
    padding: 0;
    margin: 0;
}

.db-list__row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border-bottom: var(--border-width-1) solid var(--border);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.db-list__row:hover {
    background: var(--surface-hover);
}

.db-list__icon {
    flex: 0 0 auto;
    color: var(--text-secondary);
}

.db-list__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    cursor: pointer;
    gap: 1px;
}

.db-list__title {
    font-size: var(--text-md);
    color: var(--text-primary);
    font-weight: var(--font-weight-medium);
    line-height: var(--leading-tight);
}

.db-list__meta {
    font-size: var(--text-xs);
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: var(--leading-tight);
}

.db-list--wrap .db-list__title,
.db-list--wrap .db-list__meta {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    word-break: break-word;
}

.db-list__action {
    border: 0;
    background: transparent;
    cursor: pointer;
    color: var(--text-muted);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    opacity: 0;
    transition:
        opacity var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.db-list__row:hover .db-list__action {
    opacity: 1;
}

.db-list__action:hover {
    color: var(--danger);
    background: var(--danger-faint);
}

.db-list__empty {
    padding: var(--space-6);
    text-align: center;
    color: var(--text-muted);
    font-size: var(--text-sm);
}
</style>
