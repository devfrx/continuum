<script setup lang="ts">
/**
 * Number property editor.
 *
 * Editing is always done against the raw numeric value via a plain
 * text input, so users keep keyboard control (arrow keys, paste,
 * fractional digits, …). The presentation layer reads
 * `NumberConfig.format` / `displayAs` / `divideBy` / `color` /
 * `showNumber` to render:
 *
 *   – plain number, locale-grouped number, percent or currency text
 *     via `Intl.NumberFormat` (so locales like `it-IT` get the right
 *     thousand / decimal separators automatically); or
 *   – a horizontal progress pill (`bar`) or SVG ring (`ring`) when
 *     the property models a 0..N quantity.
 *
 * Focus restores the raw input so editing is never lossy. Blur
 * commits + falls back to the formatted overlay.
 */
import { computed, ref, watch } from 'vue';
import {
    PROPERTY_TYPE_PLACEHOLDERS,
    type NumberConfig,
    type NumberValue,
    type PropertyDefinition,
} from '@continuum/shared';

const props = defineProps<{
    value: NumberValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{
    'update:value': [v: NumberValue];
    'clear:value': [];
}>();

const cfg = computed<NumberConfig>(() => props.definition.config as NumberConfig);

/** Raw numeric value (or undefined for empty cells). */
const numericValue = computed<number | undefined>(() => props.value?.value ?? undefined);

/** Format the raw input the user sees while typing — never apply
 *  thousand separators here, only the explicit precision. */
function rawInputText(n: number | undefined): string {
    if (n === undefined || Number.isNaN(n)) return '';
    if (cfg.value.precision !== undefined) return n.toFixed(cfg.value.precision);
    return String(n);
}

/**
 * Build the rich, format-aware display string used when the cell is
 * not being edited.
 */
function formatDisplay(n: number | undefined): string {
    if (n === undefined || Number.isNaN(n)) return '';
    const format = cfg.value.format ?? 'number';
    const precision = cfg.value.precision;
    const fractionOpts =
        precision !== undefined
            ? { minimumFractionDigits: precision, maximumFractionDigits: precision }
            : {};
    try {
        if (format === 'number') {
            const text = new Intl.NumberFormat(undefined, {
                useGrouping: false,
                ...fractionOpts,
            }).format(n);
            return cfg.value.unit ? `${text} ${cfg.value.unit}` : text;
        }
        if (format === 'numberWithSeparators') {
            const text = new Intl.NumberFormat(undefined, {
                useGrouping: true,
                ...fractionOpts,
            }).format(n);
            return cfg.value.unit ? `${text} ${cfg.value.unit}` : text;
        }
        if (format === 'percent') {
            // Notion semantics: the stored value IS the percentage
            // (12.5 → "12.5%"), so format as decimal and append `%`.
            const text = new Intl.NumberFormat(undefined, {
                useGrouping: true,
                ...fractionOpts,
            }).format(n);
            return `${text}%`;
        }
        if (format.startsWith('currency:')) {
            const currency = format.slice('currency:'.length);
            return new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency,
                ...fractionOpts,
            }).format(n);
        }
    } catch {
        // Fall through to plain text on bad currency codes etc.
    }
    return rawInputText(n);
}

const draft = ref<string>(rawInputText(numericValue.value));
const input = ref<HTMLInputElement | null>(null);
const isFocused = ref(false);

watch(
    () => numericValue.value,
    (n) => {
        const formatted = rawInputText(n);
        if (formatted !== draft.value && document.activeElement !== input.value) {
            draft.value = formatted;
        }
    },
);

function commit(): void {
    isFocused.value = false;
    if (!draft.value.trim()) {
        if (props.value !== null) emit('clear:value');
        return;
    }
    const parsed = Number(draft.value);
    if (!Number.isFinite(parsed)) {
        draft.value = rawInputText(numericValue.value);
        return;
    }
    let v = parsed;
    if (cfg.value.min !== undefined) v = Math.max(cfg.value.min, v);
    if (cfg.value.max !== undefined) v = Math.min(cfg.value.max, v);
    emit('update:value', { type: 'number', value: v });
}

function onInput(e: Event): void {
    draft.value = (e.target as HTMLInputElement).value;
}

function onFocus(): void {
    isFocused.value = true;
    draft.value = rawInputText(numericValue.value);
}

// ── Progress / ring presentation ──────────────────────────────────────────
const displayAs = computed(() => cfg.value.displayAs ?? 'number');
const isProgressive = computed(() => displayAs.value !== 'number');
const showNumber = computed(() => cfg.value.showNumber ?? true);
const fillColor = computed(() => cfg.value.color || 'var(--accent)');
const trackColor = 'var(--accent-soft, rgba(127,127,127,0.16))';

const progress = computed<number>(() => {
    const n = numericValue.value;
    if (n === undefined || Number.isNaN(n)) return 0;
    const divisor = cfg.value.divideBy ?? 100;
    if (divisor <= 0) return 0;
    return Math.max(0, Math.min(1, n / divisor));
});

const barPercent = computed(() => `${(progress.value * 100).toFixed(1)}%`);
const displayText = computed(() => formatDisplay(numericValue.value));

// Ring geometry — kept inline so the editor stays a single file.
const RING_SIZE = 22;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const ringDashOffset = computed(
    () => RING_CIRCUMFERENCE * (1 - progress.value),
);
</script>

<template>
    <div class="prop-num" :class="{
        'prop-num--bar': displayAs === 'bar' && !isFocused,
        'prop-num--ring': displayAs === 'ring' && !isFocused,
    }">
        <input ref="input" class="prop-num__input"
            :class="{ 'prop-num__input--ghost': isProgressive && !isFocused }" type="text"
            inputmode="decimal"
            :value="isFocused ? draft : (isProgressive ? '' : displayText)"
            :placeholder="PROPERTY_TYPE_PLACEHOLDERS.number" @input="onInput" @focus="onFocus"
            @blur="commit" @keydown.enter.prevent="commit" />

        <template v-if="isProgressive && !isFocused">
            <span v-if="displayAs === 'bar'" class="prop-num__bar" role="progressbar"
                :aria-valuenow="(progress * 100).toFixed(1)" aria-valuemin="0" aria-valuemax="100"
                :style="{ background: trackColor }">
                <span class="prop-num__bar-fill"
                    :style="{ width: barPercent, background: fillColor }" />
            </span>

            <svg v-else class="prop-num__ring" :width="RING_SIZE" :height="RING_SIZE"
                viewBox="0 0 22 22" aria-hidden="true">
                <circle :cx="RING_SIZE / 2" :cy="RING_SIZE / 2" :r="RING_RADIUS"
                    :stroke="trackColor" :stroke-width="RING_STROKE" fill="none" />
                <circle :cx="RING_SIZE / 2" :cy="RING_SIZE / 2" :r="RING_RADIUS"
                    :stroke="fillColor" :stroke-width="RING_STROKE"
                    :stroke-dasharray="RING_CIRCUMFERENCE" :stroke-dashoffset="ringDashOffset"
                    fill="none" stroke-linecap="round"
                    :transform="`rotate(-90 ${RING_SIZE / 2} ${RING_SIZE / 2})`" />
            </svg>

            <span v-if="showNumber" class="prop-num__overlay">{{ displayText }}</span>
        </template>

        <span v-else-if="!isProgressive && cfg.unit && !isFocused" class="prop-num__unit">{{ cfg.unit }}</span>
    </div>
</template>

<style scoped>
.prop-num {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--duration-fast) var(--ease-standard);
}

.prop-num--bar,
.prop-num--ring {
    position: relative;
}

.prop-num:hover,
.prop-num:focus-within {
    background: var(--bg-soft);
}

.prop-num__input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    text-align: left;
    min-width: 0;
}

.prop-num__input::placeholder {
    color: var(--fg-subtle);
}

/* When the cell shows a bar/ring we collapse the input to a clickable
   overlay so the user can still focus it (Tab key, click). */
.prop-num__input--ghost {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: text;
}

.prop-num__bar {
    flex: 1;
    height: 8px;
    border-radius: var(--radius-pill, 999px);
    overflow: hidden;
    display: block;
    min-width: 40px;
}

.prop-num__bar-fill {
    display: block;
    height: 100%;
    border-radius: inherit;
    transition: width var(--duration-fast) var(--ease-standard);
}

.prop-num__ring {
    flex: 0 0 auto;
}

.prop-num__overlay {
    color: var(--fg);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    pointer-events: none;
}

.prop-num__unit {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
}
</style>
