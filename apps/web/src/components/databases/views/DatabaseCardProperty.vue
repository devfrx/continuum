<script setup lang="ts">
/**
 * DatabaseCardProperty.vue — label + read-only value cell shared by
 * card-shaped renderers (Board, Gallery, Feed, List).
 *
 * Defers all type-specific rendering to the global `DatabaseCell`
 * (which itself routes through `propertyEditorRegistry`) so the look
 * of a select chip, a checkbox or a date stays identical across the
 * Table and every card layout — no parallel display logic to drift.
 *
 * The cell is intentionally read-only on cards: card surfaces are
 * primarily for browsing, the Table view remains the editing surface.
 * Clicks bubble up to the parent card (which opens the row); we stop
 * propagation only on focus-friendly inputs that the registry might
 * still render in readonly mode.
 *
 * The whole element receives the `:style` payload returned by the
 * conditional-colour composable so per-property text/background rules
 * tint exactly the cell the rule targets — same semantics as the
 * Table where the `:style` lands on each grid cell.
 */
import type { DatabaseRowSnapshot, PropertyDefinition } from '@continuum/shared';
import DatabaseCell from '../DatabaseCell.vue';

const props = defineProps<{
    row: DatabaseRowSnapshot;
    property: PropertyDefinition;
    /** Style payload from `useConditionalColors.cellStyleFor(row, key)`. */
    cellStyle?: Record<string, string>;
    /** Hide the label row (used by compact / inline variants). */
    hideLabel?: boolean;
    /** Layout variant tuned by each database surface. */
    variant?: 'label-value' | 'stacked' | 'inline';
}>();

function entry() {
    return props.row.properties.find((p) => p.definition.id === props.property.id) ?? null;
}
</script>

<template>
    <div
        class="db-card-prop"
        :class="[
            `db-card-prop--${variant ?? 'label-value'}`,
            { 'db-card-prop--hide-label': hideLabel },
        ]"
        :style="cellStyle">
        <span v-if="!hideLabel" class="db-card-prop__label">{{ property.label }}</span>
        <div class="db-card-prop__value">
            <DatabaseCell
                :note-id="row.noteId"
                :entry="entry()"
                :editable="false"
                @click.stop />
        </div>
    </div>
</template>

<style scoped>
.db-card-prop {
    display: grid;
    grid-template-columns: minmax(72px, 96px) 1fr;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    border-radius: var(--radius-sm);
    padding: 1px var(--space-1);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.db-card-prop--stacked {
    grid-template-columns: 1fr;
    align-items: stretch;
    gap: 2px;
    padding-block: var(--space-1);
}

.db-card-prop--inline,
.db-card-prop--hide-label {
    grid-template-columns: 1fr;
    display: inline-grid;
    width: auto;
    max-width: 100%;
    padding: 0;
}

.db-card-prop__label {
    font-size: var(--text-xs);
    color: var(--db-conditional-text, var(--text-muted));
    font-weight: var(--font-weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.db-card-prop__value {
    min-width: 0;
    font-size: var(--text-sm);
    color: inherit;
    display: flex;
    align-items: center;
}

.db-card-prop__value :deep(.db-cell) {
    min-height: 24px;
    width: 100%;
}

.db-card-prop--stacked .db-card-prop__value :deep(.db-cell) {
    min-height: 22px;
}

.db-card-prop :deep(.prop-prog),
.db-card-prop :deep(.prop-cb),
.db-card-prop :deep(.prop-date),
.db-card-prop :deep(.prop-range),
.db-card-prop :deep(.prop-num),
.db-card-prop :deep(.prop-url),
.db-card-prop :deep(.prop-email),
.db-card-prop :deep(.prop-phone) {
    padding: 0;
}

.db-card-prop :deep(.prop-prog__bar) {
    min-width: 0;
}

.db-card-prop--inline :deep(.prop-ms__trigger),
.db-card-prop--inline :deep(.prop-sel__trigger),
.db-card-prop--inline :deep(.prop-status__trigger) {
    width: auto;
}
</style>
