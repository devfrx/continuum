<script setup lang="ts">
/**
 * NumberSettingsPanel.vue — per-property settings for `number`.
 *
 * Exposes Notion-style attributes:
 *   – Format        — Number / Number with separators / Percent / currency:<ISO>
 *   – Decimals      — Default / 0 / 1 / 2 / 3 / 4
 *   – Show as       — Number / Bar / Ring
 *   – Color         — Bar/Ring fill colour (only when displayAs ≠ 'number')
 *   – Divide by     — divisor used to scale the value into 0..1 (default 100)
 *   – Show number   — toggle the numeric overlay on top of Bar/Ring
 *
 * Persistence is delegated to {@link PropertySettingsPopover} via the
 * shared `usePropertySettings` composable, so every change is debounced
 * and round-tripped through `api.properties.update`.
 */
import { computed } from 'vue';
import { UiSelect, UiInput, UiSwitch, UiSegmented, Icon } from '@/components/ui';
import PropertySettingsRow from '../PropertySettingsRow.vue';
import {
    SUPPORTED_NUMBER_CURRENCIES,
    type NumberConfig,
    type NumberDisplay,
    type NumberFormat,
    type PropertyDefinition,
} from '@continuum/shared';

const props = defineProps<{
    definition: PropertyDefinition;
    config: NumberConfig;
}>();

const emit = defineEmits<{ 'update:config': [value: NumberConfig] }>();

/** Localised display name for an ISO 4217 currency code, with graceful fallback. */
function currencyLabel(code: string): string {
    try {
        const formatter = new Intl.DisplayNames(undefined, { type: 'currency' });
        const name = formatter.of(code);
        return name ? `${name} (${code})` : code;
    } catch {
        return code;
    }
}

const formatOptions = computed<{ label: string; value: NumberFormat }[]>(() => [
    { label: 'Number', value: 'number' },
    { label: 'Number with separators', value: 'numberWithSeparators' },
    { label: 'Percent', value: 'percent' },
    ...SUPPORTED_NUMBER_CURRENCIES.map((code) => ({
        label: currencyLabel(code),
        value: `currency:${code}` as NumberFormat,
    })),
]);

const decimalOptions = [
    { label: 'Default', value: '' },
    { label: '0', value: '0' },
    { label: '1', value: '1' },
    { label: '2', value: '2' },
    { label: '3', value: '3' },
    { label: '4', value: '4' },
];

const displayAsOptions = [
    { label: 'Number', value: 'number' },
    { label: 'Bar', value: 'bar' },
    { label: 'Ring', value: 'ring' },
];

const colorOptions = [
    { label: 'Default', value: '' },
    { label: 'Green', value: '#7A9E7E' },
    { label: 'Blue', value: '#5B7B95' },
    { label: 'Orange', value: '#D4A24C' },
    { label: 'Red', value: '#C96E4A' },
    { label: 'Purple', value: '#8B6CAE' },
    { label: 'Gray', value: '#8C7B6A' },
];

const format = computed<NumberFormat>(() => props.config.format ?? 'number');
const precision = computed<string>(() =>
    props.config.precision === undefined ? '' : String(props.config.precision),
);
const displayAs = computed<NumberDisplay>(() => props.config.displayAs ?? 'number');
const isProgressive = computed(() => displayAs.value !== 'number');
const showNumber = computed(() => props.config.showNumber ?? true);
const divideBy = computed(() =>
    props.config.divideBy === undefined ? '100' : String(props.config.divideBy),
);
const color = computed(() => props.config.color ?? '');

function update(patch: Partial<NumberConfig>): void {
    emit('update:config', { ...props.config, ...patch });
}

function setFormat(value: string): void {
    update({ format: value as NumberFormat });
}

function setPrecision(value: string): void {
    if (!value) {
        const next: NumberConfig = { ...props.config };
        delete next.precision;
        emit('update:config', next);
        return;
    }
    update({ precision: Number(value) });
}

function setDisplayAs(value: string): void {
    update({ displayAs: value as NumberDisplay });
}

function setColor(value: string): void {
    if (!value) {
        const next: NumberConfig = { ...props.config };
        delete next.color;
        emit('update:config', next);
        return;
    }
    update({ color: value });
}

function setDivideBy(value: string): void {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    update({ divideBy: parsed });
}

function setShowNumber(value: boolean): void {
    update({ showNumber: value });
}
</script>

<template>
    <div class="num-settings">
        <PropertySettingsRow label="Number format">
            <UiSelect :model-value="format" :options="formatOptions" @update:model-value="setFormat" />
        </PropertySettingsRow>

        <PropertySettingsRow label="Decimal places">
            <UiSelect :model-value="precision" :options="decimalOptions" @update:model-value="setPrecision" />
        </PropertySettingsRow>

        <PropertySettingsRow label="Show as" stacked>
            <UiSegmented :model-value="displayAs" :options="displayAsOptions"
                @update:model-value="setDisplayAs" />
        </PropertySettingsRow>

        <template v-if="isProgressive">
            <div class="num-settings__group">
                <PropertySettingsRow label="Color">
                    <UiSelect :model-value="color" :options="colorOptions" @update:model-value="setColor" />
                    <span class="num-settings__swatch" aria-hidden="true"
                        :style="{ background: color || 'var(--accent)' }">
                        <Icon name="palette" :size="12" />
                    </span>
                </PropertySettingsRow>

                <PropertySettingsRow label="Divide by">
                    <UiInput :model-value="divideBy" type="number" size="sm"
                        @update:model-value="setDivideBy" />
                </PropertySettingsRow>

                <PropertySettingsRow label="Show number">
                    <UiSwitch :model-value="showNumber" @update:model-value="setShowNumber" />
                </PropertySettingsRow>
            </div>
        </template>
    </div>
</template>

<style scoped>
.num-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 260px;
}

.num-settings__group {
    margin-top: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
    display: flex;
    flex-direction: column;
}

.num-settings__swatch {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: var(--radius-xs);
    color: rgba(255, 255, 255, 0.85);
}
</style>
