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
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { Icon } from '@/components/ui';
import type {
    DatabaseRowSnapshot,
    PropertyDefinition,
    PropertyOption,
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const router = useRouter();

const layout = computed<Record<string, unknown>>(
    () => (props.activeView.config.layout ?? {}) as Record<string, unknown>,
);

const coverPropertyId = computed<string | null>(() => {
    const explicit = typeof layout.value.coverPropertyId === 'string'
        ? layout.value.coverPropertyId
        : null;
    if (explicit) {
        const def = props.schema.find((p) => p.id === explicit);
        if (def) return def.id;
    }
    return props.schema.find((p) => p.type === 'files' || p.type === 'url')?.id ?? null;
});

const layoutMissingExplicit = computed(() => typeof layout.value.coverPropertyId !== 'string');

if (coverPropertyId.value && layoutMissingExplicit.value) {
    emit('view-config-changed', {
        layout: { ...layout.value, coverPropertyId: coverPropertyId.value },
    });
}

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
    void router.push({ path: '/', query: { note: row.noteId } });
}
</script>

<template>
    <div class="db-gallery">
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
                    <strong class="db-gallery__title">{{ row.note.title || 'Untitled' }}</strong>
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
    gap: 0.7rem;
}

.db-gallery__card {
    background: var(--bg-elev, #232323);
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    transition: border-color 80ms ease, transform 80ms ease;
}

.db-gallery__card:hover {
    border-color: var(--accent, #e8dcc8);
    transform: translateY(-1px);
}

.db-gallery__cover {
    aspect-ratio: 16 / 9;
    background-color: var(--bg-soft, #1c1c1c);
    background-size: cover;
    background-position: center;
}

.db-gallery__cover--placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-muted, #a09b90);
}

.db-gallery__body {
    padding: 0.55rem 0.65rem 0.65rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
}

.db-gallery__title {
    font-size: 0.85rem;
    color: var(--fg, #ededed);
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-gallery__line {
    margin: 0;
    font-size: 0.72rem;
    color: var(--fg-muted, #a09b90);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-gallery__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 2.5rem 1rem;
    color: var(--fg-muted, #a09b90);
    text-align: center;
}
</style>
