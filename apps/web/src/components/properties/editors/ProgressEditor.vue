<script setup lang="ts">
/**
 * Progress property editor.
 *
 * Renders a horizontal bar with an inline numeric input. Supports the
 * `min`, `max` and `showPercent` config knobs. Click+drag on the bar to
 * scrub, or type a value directly into the input.
 */
import { computed, ref, watch } from 'vue';
import type { ProgressConfig, ProgressValue, PropertyDefinition } from '@continuum/shared';

const props = defineProps<{
    value: ProgressValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: ProgressValue] }>();

const cfg = computed(() => props.definition.config as ProgressConfig);
const min = computed(() => cfg.value.min ?? 0);
const max = computed(() => cfg.value.max ?? 100);
const range = computed(() => Math.max(1, max.value - min.value));

const draft = ref<string>(String(props.value?.value ?? min.value));
watch(
    () => props.value?.value,
    (n) => {
        if (document.activeElement !== inputEl.value) draft.value = String(n ?? min.value);
    },
);
const inputEl = ref<HTMLInputElement | null>(null);

const current = computed(() => clamp(Number(draft.value || 0)));
const percent = computed(() => ((current.value - min.value) / range.value) * 100);
const display = computed(() =>
    cfg.value.showPercent ? `${Math.round(percent.value)}%` : String(current.value),
);

function clamp(n: number): number {
    if (!Number.isFinite(n)) return min.value;
    return Math.max(min.value, Math.min(max.value, n));
}

function commit(): void {
    const v = clamp(Number(draft.value));
    draft.value = String(v);
    if ((props.value?.value ?? null) === v) return;
    emit('update:value', { type: 'progress', value: v });
}

const barEl = ref<HTMLDivElement | null>(null);
let dragging = false;

function setFromEvent(e: PointerEvent): void {
    const el = barEl.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const next = Math.round(min.value + ratio * range.value);
    if (next === Number(draft.value)) return;
    draft.value = String(next);
    emit('update:value', { type: 'progress', value: next });
}

function onPointerDown(e: PointerEvent): void {
    dragging = true;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setFromEvent(e);
}
function onPointerMove(e: PointerEvent): void {
    if (dragging) setFromEvent(e);
}
function onPointerUp(e: PointerEvent): void {
    dragging = false;
    (e.target as Element).releasePointerCapture?.(e.pointerId);
}
</script>

<template>
    <div class="prop-prog">
        <div ref="barEl" class="prop-prog__bar" role="slider" :aria-valuemin="min" :aria-valuemax="max"
            :aria-valuenow="current" tabindex="0" @pointerdown="onPointerDown" @pointermove="onPointerMove"
            @pointerup="onPointerUp">
            <div class="prop-prog__fill" :style="{ width: `${percent}%` }" />
        </div>
        <input ref="inputEl" v-model="draft" class="prop-prog__input" type="text" inputmode="numeric"
            @blur="commit" @keydown.enter.prevent="commit" />
        <span class="prop-prog__display">{{ display }}</span>
    </div>
</template>

<style scoped>
.prop-prog {
    display: flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--duration-fast) var(--ease-standard);
    width: 100%;
}
.prop-prog:hover { background: var(--bg-soft); }
.prop-prog__bar {
    position: relative; flex: 1; height: 8px; min-width: 80px;
    background: var(--bg-soft);
    border: var(--border-width-1) solid var(--border);
    border-radius: 999px; cursor: pointer; touch-action: none;
}
.prop-prog__fill {
    height: 100%; border-radius: 999px;
    background: var(--accent);
    transition: width var(--duration-fast) var(--ease-standard);
}
.prop-prog__input {
    width: 56px; background: transparent; border: none; outline: none;
    color: var(--fg); font: inherit; font-size: var(--text-sm); text-align: right;
}
.prop-prog__display {
    font-size: var(--text-xs); color: var(--fg-subtle);
    min-width: 38px; text-align: right;
}
</style>
