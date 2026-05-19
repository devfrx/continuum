<script setup lang="ts">
/**
 * GalleryView.vue — card grid renderer.
 *
 * Each row becomes a card laid out in a responsive CSS grid. An
 * optional cover image is taken from the note cover (enabled by
 * default), then from a `files` property (first file with an image MIME)
 * or a `url` property if `coverPropertyId` points at one. Cards display
 * the title and the first few non-cover property values; clicking a
 * card opens the underlying note.
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
} from '@continuum/shared';
import type { DatabaseViewSurfaceProps, DatabaseViewSurfaceEmits } from './types';
import { useDatabaseRowDisplay } from '../useDatabaseRowDisplay';
import { useConditionalColors } from '../conditionalColor';
import { readCardDisplay } from '../layout';
import { resolveCardProperties } from './cardProperties';
import DatabaseCardProperty from './DatabaseCardProperty.vue';
import { useDatabaseRowReorder } from './useDatabaseRowReorder';

const props = defineProps<DatabaseViewSurfaceProps>();
const emit = defineEmits<DatabaseViewSurfaceEmits>();
const { common, openRow: openRowById, iconOf, colorOf } = useDatabaseRowDisplay(() => props.activeView);
const { rowStyleFor, cellStyleFor } = useConditionalColors({
    activeView: computed(() => props.activeView),
    schema: computed(() => props.schema),
});

const {
    orderedRows,
    isDraggingRow,
    isDropTargetRow,
    rowSourceHandlers,
    rowTargetHandlers,
    listTargetHandlers,
} = useDatabaseRowReorder({
    databaseId: computed(() => props.database.id),
    rows: computed(() => props.rows),
    editable: computed(() => props.editable),
    onReordered: () => emit('cell-saved'),
});

const layout = computed<Record<string, unknown>>(
    () => (props.activeView.config.layout ?? {}) as Record<string, unknown>,
);

const hasExplicitCoverProperty = computed(() =>
    Object.prototype.hasOwnProperty.call(layout.value, 'coverPropertyId'),
);

const showNoteCover = computed<boolean>(() => layout.value.showNoteCover !== false);

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

/**
 * Card display knobs shared with the Board layout. `cardPreview`
 * decides which surface is shown at the top of each card; the cover
 * helpers below tailor their lookup to that choice so e.g. selecting
 * “Page properties” ignores the note cover even when present.
 */
const cardDisplay = computed(() => readCardDisplay(props.activeView.config.layout));

function propertyCoverUrl(row: DatabaseRowSnapshot): string | null {
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

function coverUrlFor(row: DatabaseRowSnapshot): string | null {
    switch (cardDisplay.value.cardPreview) {
        case 'none':
        case 'pageContent':
            // No usable body excerpt on the snapshot for `pageContent`;
            // keep the card text-only rather than fabricating media.
            return null;
        case 'properties':
            return propertyCoverUrl(row);
        case 'pageCover':
        default:
            if (showNoteCover.value) {
                const universal = row.note?.coverImage;
                if (universal) return universal;
            }
            return propertyCoverUrl(row);
    }
}

const hasCoverFrame = computed<boolean>(() =>
    orderedRows.value.some((row) => coverUrlFor(row) !== null),
);

const galleryClasses = computed(() => ({
    'db-gallery--wrap': common.value.wrapContent,
    [`db-gallery--size-${cardDisplay.value.cardSize}`]: true,
    [`db-gallery--layout-${cardDisplay.value.cardLayout}`]: true,
    'db-gallery--fit-media': cardDisplay.value.fitMedia,
}));

function detailProperties(): PropertyDefinition[] {
    const skip = new Set<string>();
    if (coverProperty.value) skip.add(coverProperty.value.key);
    return resolveCardProperties({
        schema: props.schema,
        view: props.activeView,
        skipKeys: skip,
        limit: 4,
    });
}

function hasEntry(row: DatabaseRowSnapshot, def: PropertyDefinition): boolean {
    const v = row.properties.find((p) => p.definition.id === def.id)?.value;
    if (!v) return false;
    if (v.type === 'multiSelect' && v.value.length === 0) return false;
    if ((v.type === 'text' || v.type === 'longText' || v.type === 'url' || v.type === 'email' || v.type === 'phone') && !v.value) return false;
    return true;
}

function openRow(row: DatabaseRowSnapshot): void {
    openRowById(row.noteId);
}
</script>

<template>
    <div class="db-gallery" :class="galleryClasses">
        <div v-if="!orderedRows.length" class="db-gallery__empty">
            <Icon name="view-gallery" :size="22" />
            <p>No rows yet — switch to Table or use the toolbar to add the first one.</p>
        </div>
        <div v-else class="db-gallery__grid" v-on="listTargetHandlers">
            <article
                v-for="row in orderedRows"
                :key="row.rowId"
                data-row-drop-target="true"
                class="db-gallery__card"
                :class="{
                    'db-gallery__card--coverless': !hasCoverFrame,
                    'is-dragging': isDraggingRow(row.rowId),
                    'is-drop-target': isDropTargetRow(row.rowId),
                }"
                :draggable="editable"
                :style="rowStyleFor(row)"
                v-on="{ ...rowSourceHandlers(row), ...rowTargetHandlers(row) }"
                @click="openRow(row)">
                <div
                    v-if="coverUrlFor(row)"
                    class="db-gallery__cover"
                    :style="{ backgroundImage: `url('${coverUrlFor(row)}')` }" />
                <div v-else-if="hasCoverFrame" class="db-gallery__cover db-gallery__cover--placeholder">
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
                    <div
                        v-if="cardDisplay.cardPreview !== 'none' && detailProperties().length"
                        class="db-gallery__props">
                        <DatabaseCardProperty
                            v-for="def in detailProperties()"
                            v-show="hasEntry(row, def)"
                            :key="def.id"
                            :row="row"
                            :property="def"
                            variant="stacked"
                            :cell-style="cellStyleFor(row, def.key)" />
                    </div>
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
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
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
    color: var(--text-primary);
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        background-color var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard),
        box-shadow var(--duration-fast) var(--ease-standard);
}

.db-gallery__card:hover {
    border-color: var(--border-strong);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm, 0 1px 3px rgba(0, 0, 0, 0.15));
}

.db-gallery__card[draggable='true'] {
    cursor: grab;
}

.db-gallery__card[draggable='true']:active {
    cursor: grabbing;
}

.db-gallery__card.is-dragging {
    opacity: 0.55;
}

.db-gallery__card.is-drop-target {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
}

.db-gallery__card--coverless {
    min-height: 142px;
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
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
}

.db-gallery__card--coverless .db-gallery__body {
    min-height: 100%;
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
    font-weight: var(--font-weight-semibold);
    color: inherit;
    line-height: var(--leading-tight);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-gallery__props {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding-top: var(--space-1);
    border-top: var(--border-width-1) dashed var(--border);
}

.db-gallery--wrap .db-gallery__title {
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

/* ── Card size variants ─────────────────────────────────────────── */
.db-gallery--size-small .db-gallery__grid {
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
}

.db-gallery--size-small .db-gallery__body {
    padding: var(--space-2);
    gap: var(--space-1);
}

.db-gallery--size-small .db-gallery__title {
    font-size: var(--text-xs);
}

.db-gallery--size-large .db-gallery__grid {
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
}

.db-gallery--size-large .db-gallery__body {
    padding: var(--space-4);
    gap: var(--space-3);
}

.db-gallery--size-large .db-gallery__title {
    font-size: var(--text-md);
}

/* ── Fit-media: letterbox the cover rather than crop ────────────── */
.db-gallery--fit-media .db-gallery__cover {
    background-size: contain;
    background-repeat: no-repeat;
    background-color: var(--surface-3, rgba(0, 0, 0, 0.18));
}

/* ── List layout (single column, wide cards) ────────────────────── */
.db-gallery--layout-list .db-gallery__grid {
    grid-template-columns: 1fr;
    gap: var(--space-2);
}

.db-gallery--layout-list .db-gallery__card {
    flex-direction: row;
    align-items: stretch;
}

.db-gallery--layout-list .db-gallery__cover {
    aspect-ratio: auto;
    flex: 0 0 160px;
    align-self: stretch;
}

.db-gallery--layout-list .db-gallery__body {
    flex: 1 1 auto;
}

.db-gallery--layout-list.db-gallery--size-small .db-gallery__cover {
    flex-basis: 96px;
}

.db-gallery--layout-list.db-gallery--size-large .db-gallery__cover {
    flex-basis: 240px;
}
</style>
