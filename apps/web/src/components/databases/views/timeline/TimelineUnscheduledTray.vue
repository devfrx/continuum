<script setup lang="ts">
/**
 * TimelineUnscheduledTray — collapsible footer that lists every row
 * the active date property does not place on the axis. Each badge is
 * a pointer-drag source the parent wires through
 * `useTimelineInteractions.beginDropFromTray`.
 */
import { Icon } from '@/components/ui';
import type { DatabaseRowSnapshot } from '@continuum/shared';

defineProps<{
    rows: DatabaseRowSnapshot[];
    iconOf: (kind: string) => string;
    colorOf: (kind: string) => string | null;
    showIcon: boolean;
    editable: boolean;
    rowStyleFor: (row: DatabaseRowSnapshot) => Record<string, string>;
}>();

const emit = defineEmits<{
    'pointerdown-badge': [event: PointerEvent, row: DatabaseRowSnapshot];
    open: [row: DatabaseRowSnapshot];
}>();
</script>

<template>
    <footer v-if="rows.length" class="tl-tray">
        <span class="tl-tray__label">Unscheduled · {{ rows.length }}</span>
        <button v-for="row in rows" :key="row.rowId" type="button" class="tl-tray__badge"
            :class="{ 'is-editable': editable }" :style="rowStyleFor(row)"
            @pointerdown="(e) => editable && emit('pointerdown-badge', e, row)"
            @click.stop="emit('open', row)">
            <Icon v-if="showIcon" :name="iconOf(row.note.kind)" :size="11" :style="{ color: colorOf(row.note.kind) ?? undefined }" />
            <span class="tl-tray__title">{{ row.note.title || 'Untitled' }}</span>
        </button>
        <span v-if="editable" class="tl-tray__hint">Drag a badge onto the timeline to schedule it.</span>
    </footer>
</template>

<style scoped>
.tl-tray {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.35rem;
    padding: 0.5rem 0.75rem;
    border-top: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
    background: var(--surface-subtle, rgba(255, 255, 255, 0.02));
}

.tl-tray__label {
    font-size: 0.7rem;
    color: var(--fg-muted, #a09b90);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-right: 0.25rem;
}

.tl-tray__badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.22rem 0.55rem;
    border: var(--border-width-1, 1px) solid var(--border-hover, rgba(255, 255, 255, 0.10));
    border-radius: var(--radius-pill, 999px);
    background: color-mix(in srgb, var(--surface-3, #2a2a2a) 92%, transparent);
    color: var(--fg, #ededed);
    font: inherit;
    font-size: 0.72rem;
    cursor: pointer;
    touch-action: none;
    user-select: none;
    box-shadow: var(--shadow-xs, 0 1px 1px rgba(0, 0, 0, 0.18));
}

.tl-tray__badge:hover {
    border-color: var(--border-strong, rgba(255, 255, 255, 0.16));
    background: color-mix(in srgb, var(--surface-4, #323232) 92%, transparent);
}

.tl-tray__badge.is-editable {
    cursor: grab;
}

.tl-tray__badge.is-editable:active {
    cursor: grabbing;
}

.tl-tray__title {
    max-width: 14ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tl-tray__hint {
    margin-left: auto;
    color: var(--fg-subtle, #6f6a60);
    font-size: 0.7rem;
}
</style>
