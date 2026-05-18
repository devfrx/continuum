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
import { useRouter } from 'vue-router';
import type { DatabaseRowSnapshot, PropertyOption } from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './views/types';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const router = useRouter();

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
    void router.push({ path: '/', query: { note: row.noteId } });
}
</script>

<template>
    <ul class="db-list">
        <li v-if="!props.rows.length" class="db-list__empty">No rows yet.</li>
        <li v-for="row in props.rows" :key="row.rowId" class="db-list__row">
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
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
}

.db-list__main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    cursor: pointer;
}

.db-list__title {
    font-size: 0.9rem;
    color: var(--fg, #ededed);
}

.db-list__meta {
    font-size: 0.75rem;
    color: var(--fg-muted, #a09b90);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-list__action {
    border: none;
    background: transparent;
    cursor: pointer;
    color: var(--fg-muted, #a09b90);
    padding: 0.25rem;
    border-radius: 4px;
    opacity: 0;
    transition: opacity 80ms ease;
}

.db-list__row:hover .db-list__action {
    opacity: 1;
}

.db-list__empty {
    padding: 1.25rem;
    text-align: center;
    color: var(--fg-muted, #a09b90);
    font-size: 0.85rem;
}
</style>
