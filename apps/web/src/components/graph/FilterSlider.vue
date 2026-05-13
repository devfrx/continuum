<script setup lang="ts">
/**
 * Labelled range slider used by the "Filtri" panel.
 *
 * Pure presentation component:
 *   - Shows label, current numeric value (right-aligned, monospaced).
 *   - Renders a custom track + fill stack that lines up exactly with
 *     the native thumb position. The thumb-travel area is inset by
 *     half a thumb radius on each side, and the filled track lives in
 *     that same inset so the fill end always coincides with the thumb
 *     centre regardless of value.
 *   - Emits `update:model-value` with the parsed `Number` payload.
 *
 * Styling lives in this SFC so consumers don't need to redeclare the
 * `::-webkit-slider-thumb` / `::-moz-range-thumb` pseudo-elements.
 */
import { computed } from 'vue';

interface Props {
    label: string;
    modelValue: number;
    min: number;
    max: number;
    step?: number;
    /**
     * Optional formatter for the displayed value. Defaults to the raw
     * number when the step is integer-ish, otherwise to two decimals.
     */
    format?: (value: number) => string;
}

const props = withDefaults(defineProps<Props>(), { step: 1 });

const emit = defineEmits<{
    'update:model-value': [value: number];
}>();

const fillRatio = computed<number>(() => {
    const span = props.max - props.min;
    if (span <= 0) return 0;
    const ratio = (props.modelValue - props.min) / span;
    return Math.max(0, Math.min(1, ratio));
});

const displayValue = computed<string>(() => {
    if (props.format) return props.format(props.modelValue);
    const isIntStep = Number.isInteger(props.step) && props.step >= 1;
    if (isIntStep) return String(Math.round(props.modelValue));
    return props.modelValue.toFixed(2);
});

function onInput(event: Event): void {
    const next = Number((event.target as HTMLInputElement).value);
    if (Number.isFinite(next)) emit('update:model-value', next);
}
</script>

<template>
    <div class="filter-slider">
        <div class="filter-slider__head">
            <span class="filter-slider__label">{{ label }}</span>
            <span class="filter-slider__value">{{ displayValue }}</span>
        </div>
        <div class="filter-slider__rail" :style="{ '--fs-p': fillRatio }">
            <div class="filter-slider__track" aria-hidden="true"></div>
            <div class="filter-slider__fill" aria-hidden="true"></div>
            <input class="filter-slider__input" type="range" :min="min" :max="max" :step="step" :value="modelValue"
                @input="onInput" />
        </div>
    </div>
</template>

<style scoped>
.filter-slider {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.filter-slider__head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    font-size: var(--text-sm);
}

.filter-slider__label {
    color: var(--fg-muted);
    flex: 1;
    min-width: 0;
}

.filter-slider__value {
    color: var(--fg-strong, var(--fg));
    font-feature-settings: 'tnum' 1;
    font-variant-numeric: tabular-nums;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-medium);
    padding: 1px 6px;
    border-radius: var(--radius-xs, 4px);
    background: var(--surface-2, rgba(255, 255, 255, 0.05));
    min-width: 32px;
    text-align: right;
}

/*
 * Rail = thumb-travel reference. The native range input has its
 * thumb centre travelling from `thumbRadius` to `width - thumbRadius`
 * (8px in / 8px out for our 16px thumb). The fill width is computed
 * accordingly so the fill end coincides exactly with the thumb
 * centre at every value:
 *     fillWidth = thumbRadius + p * (railWidth - thumbDiameter)
 *               = 8px + p * (100% - 16px)
 */
.filter-slider__rail {
    position: relative;
    height: 18px;
    display: flex;
    align-items: center;
}

.filter-slider__track {
    position: absolute;
    inset: 50% 0 auto 0;
    transform: translateY(-50%);
    height: 6px;
    border-radius: 999px;
    border: 0;
    background: transparent;
    pointer-events: none;
}

.filter-slider__fill {
    position: absolute;
    top: 50%;
    left: 0;
    transform: translateY(-50%);
    height: 6px;
    width: calc(8px + var(--fs-p, 0) * (100% - 16px));
    border-radius: 999px;
    background: linear-gradient(to right,
            color-mix(in srgb, var(--accent) 88%, white 12%),
            var(--accent));
    pointer-events: none;
    /*
     * No `transition` on `width` — the fill follows the cursor on
     * every `input` event already, and a CSS animation here makes it
     * lag visibly behind the thumb when the user drags fast.
     */
}

.filter-slider__input {
    position: relative;
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    height: 18px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    outline: none;
    cursor: pointer;
}

.filter-slider__input::-webkit-slider-runnable-track {
    -webkit-appearance: none;
    background: transparent;
    height: 18px;
    border: 0;
    box-shadow: none;
}

.filter-slider__input::-moz-range-track {
    background: transparent;
    height: 18px;
    border: 0;
    box-shadow: none;
}

.filter-slider__input::-webkit-slider-thumb {
    appearance: none;
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    margin-top: 1px;
    border: none;
    border-radius: 50%;
    background: var(--accent-inverted, #613d2a);
    box-shadow: none;
    cursor: grab;
    transition: transform var(--duration-fast) var(--ease-standard);
}

.filter-slider__input::-webkit-slider-thumb:hover {
    transform: scale(1.1);
}

.filter-slider__input::-webkit-slider-thumb:active {
    cursor: grabbing;
    transform: scale(1.14);
}

.filter-slider__input::-moz-range-thumb {
    width: 16px;
    height: 16px;
    border: none;
    border-radius: 50%;
    background: var(--accent-inverted, #613d2a);
    box-shadow: none;
    cursor: grab;
}

.filter-slider__input:focus-visible::-webkit-slider-thumb {
    box-shadow: none;
}

.filter-slider__input:focus-visible::-moz-range-thumb {
    box-shadow: none;
}

.filter-slider__input::-moz-range-thumb:active {
    cursor: grabbing;
    transform: scale(1.14);
}
</style>
