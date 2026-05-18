<script setup lang="ts">
/**
 * GalleryView.vue — card grid renderer.
 *
 * Each row becomes a card laid out in a responsive CSS grid. An
 * optional cover image is taken from a `files` property (first file
 * with an image MIME) or a `url` property if `coverPropertyId` points
 * at one. Cards display the title and the first few non-cover property
 * values; clicking a card opens the underlying note.
 *
 * The cover property is configurable via `activeView.config.layout.coverPropertyId`.
 * When unset, the renderer auto-picks the first `files` property and
 * persists the choice through `view-config-changed` so the saved view
 * stays explicit.
 */
import { computed, watch } from 'vue';
import { Icon } from '@/components/ui';
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
    PropertyOption,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';
import { useDatabaseRowDisplay } from '../useDatabaseRowDisplay';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);

const layout = computed<Record<string, unknown>>(
    () => (props.activeView.config.layout ?? {}) as Record<string, unknown>,
);

const hasExplicitCoverProperty = computed(() =>
    Object.prototype.hasOwnProperty.call(layout.value, 'coverPropertyId'),
);

const coverPropertyId = computed<string | null>(() => {
    if (hasExplicitCoverProperty.value) {
        const explicit = layout.value.coverPropertyId;
        if (typeof explicit !== 'string') return null;
        const def = props.schema.find((p) => p.id === explicit);
        if (def) return def.id;
    }
    return props.schema.find((p) => p.type === 'files' || p.type === 'url')?.id ?? null;
});

const layoutNeedsPersist = computed(() => {
    const propertyId = coverPropertyId.value;
    return !!propertyId && layout.value.coverPropertyId !== propertyId;
});

watch(
    [coverPropertyId, layoutNeedsPersist],
    ([propertyId, needsPersist]) => {
        if (!propertyId || !needsPersist) return;
        emit('view-config-changed', {
            layout: { coverPropertyId: propertyId },
        });
    },
    { immediate: true },
);

const coverProperty = computed<PropertyDefinition | null>(
    () => props.schema.find((p) => p.id === coverPropertyId.value) ?? null,
);

function coverUrlFor(row: DatabaseRowSnapshot): string | null {
    // Universal per-note cover always wins — it's the field the user
    // explicitly set from the editor header and the most predictable
    // source. Fall back to the configured property heuristic only when
    // the note has no cover image set.
    const universal = row.note?.coverImage;
    if (universal) return universal;
    const def = coverProperty.value;
    if (!def) return null;
    const entry = row.properties.find((p) => p.definition.id === def.id);
    const value = entry?.value;
    if (!value) return null;
    if (value.type === 'files') {
        const first = value.value.find((f) => f.mime.startsWith('image/'));
        return first?.url ?? null;
    }
    if (value.type === 'url') return value.value || null;
    return null;
}

function detailLines(row: DatabaseRowSnapshot): string[] {
    const skip = new Set<string>();
    if (coverProperty.value) skip.add(coverProperty.value.id);
    const out: string[] = [];
    for (const entry of row.properties) {
        if (skip.has(entry.definition.id)) continue;
        const value = entry.value;
        if (!value) continue;
        if (value.type === 'text' || value.type === 'longText') out.push(value.value);
        else if (value.type === 'number') out.push(String(value.value));
        else if (value.type === 'checkbox') out.push(value.value ? '✓' : '✗');
        else if (value.type === 'date') out.push(value.value);
        else if (value.type === 'select' || value.type === 'status') {
            const cfg = (entry.definition.config ?? {}) as { options?: PropertyOption[] };
            const opt = cfg.options?.find((o) => o.id === value.value);
            out.push(opt?.label ?? value.value);
        }
        else if (value.type === 'multiSelect') {
            const cfg = (entry.definition.config ?? {}) as { options?: PropertyOption[] };
            out.push(value.value.map((id) => cfg.options?.find((o) => o.id === id)?.label ?? id).join(', '));
        }
        else if (value.type === 'url' || value.type === 'email' || value.type === 'phone') out.push(value.value);
        if (out.length >= 3) break;
    }
    return out;
}

function openRow(row: DatabaseRowSnapshot): void {
    openRowById(row.noteId);
}
</script>

<template>
    <div class="db-gallery" :class="{ 'db-gallery--wrap': common.wrapContent }">
        <div v-if="!rows.length" class="db-gallery__empty">
            <Icon name="view-gallery" :size="22" />
            <p>No rows yet — switch to Table or use the toolbar to add the first one.</p>
        </div>
        <div v-else class="db-gallery__grid">
            <article
                v-for="row in rows"
                :key="row.rowId"
                class="db-gallery__card"
                @click="openRow(row)">
                <div
                    v-if="coverUrlFor(row)"
                    class="db-gallery__cover"
                    :style="{ backgroundImage: `url('${coverUrlFor(row)}')` }" />
                <div v-else class="db-gallery__cover db-gallery__cover--placeholder">
                    <Icon name="image" :size="22" />
                </div>
                <div class="db-gallery__body">
                    <div class="db-gallery__title-row">
                        <Icon
                            v-if="common.showPageIcon"
                            :name="iconOf(row.note.kind)"
                            :size="13"
                            class="db-gallery__icon"
                            :style="{ color: colorOf(row.note.kind) }" />
                        <strong class="db-gallery__title">{{ row.note.title || 'Untitled' }}</strong>
                    </div>
                    <p v-for="(line, i) in detailLines(row)" :key="i" class="db-gallery__line">
                        {{ line }}
                    </p>
                </div>
            </article>
        </div>
    </div>
</template>

<style scoped>
.db-gallery {
    padding: 0.6rem;
}

.db-gallery__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: var(--space-3);
}

.db-gallery__card {
    background: var(--surface-1);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    overflow: hidden;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard);
}

.db-gallery__card:hover {
    border-color: var(--border-strong);
    background: var(--surface-hover);
    transform: translateY(-1px);
}

.db-gallery__cover {
    aspect-ratio: 16 / 9;
    background-color: var(--surface-2);
    background-size: cover;
    background-position: center;
}

.db-gallery__cover--placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-muted);
}

.db-gallery__body {
    padding: var(--space-2) var(--space-3) var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
}

.db-gallery__title-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
}

.db-gallery__icon {
    flex: 0 0 auto;
    color: var(--text-secondary);
}

.db-gallery__title {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    color: var(--text-primary);
    line-height: var(--leading-tight);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-gallery__line {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-gallery--wrap .db-gallery__title,
.db-gallery--wrap .db-gallery__line {
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    word-break: break-word;
}

.db-gallery__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-10, 40px) var(--space-5);
    color: var(--text-muted);
    text-align: center;
}
</style>
