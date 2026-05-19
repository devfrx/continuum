<script setup lang="ts">
/**
 * TimelineAxis — the horizontally scrollable month header + day grid
 * background. Owns no business logic: emits the resolved axis element
 * via `register` so the parent can wire `useTimelineGeometry`, and
 * exposes a default slot where bars are painted absolutely.
 *
 * Layout
 * ──────
 *  ┌────────────────────────── axisEl ──────────────────────────┐
 *  │  1  2  3  4  5 …                                          │  ← header strip
 *  ├────────────────────────────────────────────────────────────┤
 *  │   ··· (slot content, abs-positioned bars) ···             │
 *  └────────────────────────────────────────────────────────────┘
 */
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';

export interface AxisDay {
    /** 1-based day number. */
    day: number;
    /** ISO `YYYY-MM-DD`. */
    iso: string;
    isToday: boolean;
    isWeekend: boolean;
}

const props = defineProps<{
    days: AxisDay[];
    /** Minimum rendered axis width in px (enables horizontal scroll). */
    minWidthPx?: number;
    /** Height of the bars area in px (excluding the day header). */
    bodyHeightPx: number;
}>();

// `props` is referenced in the template; the binding alias keeps TS happy
// when the script-setup compiler statically analyses unused variables.
void props;

const emit = defineEmits<{
    register: [axisEl: HTMLElement | null];
}>();

const axisEl = ref<HTMLElement | null>(null);

onMounted(() => emit('register', axisEl.value));
onBeforeUnmount(() => emit('register', null));
watch(axisEl, (el) => emit('register', el));
</script>

<template>
    <div class="tl-axis-wrap">
        <div class="tl-axis" ref="axisEl" :style="{
            minWidth: `${minWidthPx ?? 760}px`,
            gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
        }">
            <span v-for="d in days" :key="d.iso" class="tl-axis__day"
                :class="{ 'is-today': d.isToday, 'is-weekend': d.isWeekend }">
                {{ d.day }}
            </span>
            <div class="tl-axis__body" :style="{
                gridColumn: `1 / span ${days.length}`,
                gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                height: `${bodyHeightPx}px`,
            }">
                <span v-for="d in days" :key="`bg-${d.iso}`" class="tl-axis__col"
                    :class="{ 'is-today': d.isToday, 'is-weekend': d.isWeekend }" />
                <div class="tl-axis__slot">
                    <slot />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.tl-axis-wrap {
    overflow-x: auto;
    padding: 0.4rem 0.75rem 0.6rem;
    flex: 1 1 auto;
    min-height: 0;
}

.tl-axis {
    display: grid;
    grid-auto-rows: auto;
    row-gap: 0;
    position: relative;
}

.tl-axis__day {
    padding: 0.3rem 0;
    text-align: center;
    font-size: 0.7rem;
    color: var(--fg-muted, #a09b90);
    border-bottom: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.06));
    user-select: none;
}

.tl-axis__day.is-today {
    color: var(--accent, #6aa9ff);
    font-weight: 600;
}

.tl-axis__day.is-weekend {
    color: var(--fg-subtle, #6f6a60);
}

.tl-axis__body {
    position: relative;
    display: grid;
    grid-auto-rows: 1fr;
    background:
        linear-gradient(to right, var(--border-faint, rgba(255, 255, 255, 0.04)) 1px, transparent 1px) 0 0 / 100% 100%;
}

.tl-axis__col {
    border-right: 1px solid var(--border-faint, rgba(255, 255, 255, 0.04));
}

.tl-axis__col.is-weekend {
    background: var(--surface-subtle, rgba(255, 255, 255, 0.015));
}

.tl-axis__col.is-today {
    background: color-mix(in srgb, var(--accent, #6aa9ff) 8%, transparent);
}

.tl-axis__slot {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

/* The slot is overlay-only; children re-enable pointer events themselves */
.tl-axis__slot> :deep(*) {
    pointer-events: auto;
}
</style>
