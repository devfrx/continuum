<script setup lang="ts">
/**
 * TimelineBar — a single interactive bar drawn over the axis.
 *
 * Visuals follow Notion's timeline: a coloured pill with the row title
 * and (optionally) the page icon. When `editable` is true the body
 * acts as a `grab` handle and two thin chevron handles appear on the
 * left/right edges (hidden on read-only / single-day variants).
 *
 * The component is fully presentational: it emits raw pointer events
 * so the parent can route them through `useTimelineInteractions`.
 */
import { Icon } from '@/components/ui';

defineProps<{
    title: string;
    icon?: string;
    iconColor?: string | null;
    /** Absolute left offset within the axis body in CSS pixels. */
    leftPx: number;
    /** Absolute width within the axis body in CSS pixels. */
    widthPx: number;
    /** Vertical offset (px) from the top of the axis body. */
    topPx: number;
    /** Bar height in px. */
    heightPx: number;
    /** Clipped on the left edge of the viewport. */
    clippedLeft?: boolean;
    /** Clipped on the right edge of the viewport. */
    clippedRight?: boolean;
    /** Show grab cursor + resize handles. */
    editable: boolean;
    /** Hide resize handles even when editable (date-only properties). */
    resizable: boolean;
    /** Render as a translucent ghost (used during drag preview). */
    ghost?: boolean;
    /** Conditional row styling (background / colour). */
    rowStyle?: Record<string, string>;
    /** Whether the page icon should render. */
    showIcon: boolean;
}>();

const emit = defineEmits<{
    'pointerdown-body': [event: PointerEvent];
    'pointerdown-left': [event: PointerEvent];
    'pointerdown-right': [event: PointerEvent];
    open: [];
    contextmenu: [event: MouseEvent];
}>();
</script>

<template>
    <div class="tl-bar" :class="{
        'is-ghost': ghost,
        'is-editable': editable,
        'is-clipped-l': clippedLeft,
        'is-clipped-r': clippedRight,
    }" :style="[
        rowStyle ?? {},
        {
            left: `${leftPx}px`,
            width: `${Math.max(2, widthPx)}px`,
            top: `${topPx}px`,
            height: `${heightPx}px`,
        },
    ]" @click.stop="emit('open')" @contextmenu.prevent.stop="(e) => emit('contextmenu', e)">
        <span v-if="editable && resizable" class="tl-bar__handle tl-bar__handle--left"
            @pointerdown.stop="(e) => emit('pointerdown-left', e)"
            @click.stop />
        <button type="button" class="tl-bar__body" :class="{ 'is-grab': editable }"
            @pointerdown="(e) => emit('pointerdown-body', e)">
            <Icon v-if="showIcon && icon" :name="icon" :size="11" :style="iconColor ? { color: iconColor } : undefined"
                class="tl-bar__icon" />
            <span class="tl-bar__title">{{ title || 'Untitled' }}</span>
        </button>
        <span v-if="editable && resizable" class="tl-bar__handle tl-bar__handle--right"
            @pointerdown.stop="(e) => emit('pointerdown-right', e)"
            @click.stop />
    </div>
</template>

<style scoped>
.tl-bar {
    position: absolute;
    display: flex;
    align-items: stretch;
    border: var(--border-width-1, 1px) solid var(--border-hover, rgba(255, 255, 255, 0.10));
    border-radius: var(--radius-xs, 4px);
    background: color-mix(in srgb, var(--surface-4, #323232) 86%, var(--surface-3, #2a2a2a));
    color: var(--fg, #ededed);
    overflow: hidden;
    box-shadow: var(--shadow-sm, 0 1px 2px rgba(0, 0, 0, 0.18));
    transition:
        border-color 120ms ease,
        box-shadow 120ms ease,
        transform 120ms ease;
}

.tl-bar:hover {
    border-color: var(--border-strong, rgba(255, 255, 255, 0.16));
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.22));
}

.tl-bar.is-ghost {
    opacity: 0.72;
    pointer-events: none;
    outline: var(--border-width-1, 1px) dashed var(--fg-muted, #a09b90);
    outline-offset: 2px;
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.22));
}

.tl-bar.is-clipped-l {
    border-top-left-radius: 0;
    border-bottom-left-radius: 0;
}

.tl-bar.is-clipped-r {
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
}

.tl-bar__body {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.32rem;
    padding: 0 0.55rem;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.72rem;
    text-align: left;
    cursor: pointer;
    user-select: none;
    touch-action: none;
}

.tl-bar__body.is-grab {
    cursor: grab;
}

.tl-bar__body.is-grab:active {
    cursor: grabbing;
}

.tl-bar__title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tl-bar__icon {
    flex-shrink: 0;
}

.tl-bar__handle {
    flex: 0 0 auto;
    width: 10px;
    position: relative;
    cursor: ew-resize;
    background: transparent;
    opacity: 0.82;
    transition:
        background 120ms ease,
        opacity 120ms ease;
    touch-action: none;
}

.tl-bar__handle::before {
    content: '';
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 50%;
    width: 3px;
    transform: translateX(-50%);
    border-radius: var(--radius-pill, 999px);
    background: color-mix(in srgb, currentColor 84%, transparent);
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.10);
}

.tl-bar:hover .tl-bar__handle {
    background: color-mix(in srgb, var(--surface-active, rgba(255, 255, 255, 0.06)) 65%, transparent);
    opacity: 1;
}

.tl-bar__handle:hover::before {
    width: 4px;
    background: var(--fg, #ededed);
}
</style>
