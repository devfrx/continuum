<script setup lang="ts">
/**
 * ChartDataEditor — compact, spreadsheet-like editor for the chart's
 * labels and dataset values.
 *
 * Layout:
 *   - First column: category labels (rows = data points).
 *   - Subsequent columns: one per dataset, with the dataset name in the
 *     header (editable) and a colour swatch.
 *   - Toolbar buttons add/remove rows and datasets.
 *
 * Mutation discipline lives in `useChartDataModel`: the composable never
 * mutates `props.data` directly; every change is emitted as a fresh
 * `ChartData` object so upstream reactivity stays predictable and the
 * undo history clean.
 */
import { toRef } from 'vue';
import type { ChartData } from './chartTypes';
import { useChartDataModel } from './useChartDataModel';

const props = defineProps<{
    data: ChartData;
}>();

const emit = defineEmits<{
    (e: 'update:data', value: ChartData): void;
}>();

const {
    labels,
    datasets,
    setLabel,
    setCell,
    setDatasetName,
    setDatasetColor,
    addRow,
    removeRow,
    addDataset,
    removeDataset,
} = useChartDataModel({
    data: toRef(props, 'data'),
    onCommit: (next) => emit('update:data', next),
});
</script>

<template>
    <div class="continuum-chart__editor" contenteditable="false">
        <div class="continuum-chart__editor-actions">
            <button type="button" class="continuum-chart__editor-btn" @click="addRow">+ Row</button>
            <button type="button" class="continuum-chart__editor-btn" @click="addDataset">+ Series</button>
        </div>
        <div class="continuum-chart__table-wrap">
            <table class="continuum-chart__table">
                <thead>
                    <tr>
                        <th class="continuum-chart__th continuum-chart__th--label">Label</th>
                        <th v-for="(ds, dsIdx) in datasets" :key="dsIdx" class="continuum-chart__th continuum-chart__th--series">
                            <div class="continuum-chart__series-head">
                                <div class="continuum-chart__series-main">
                                    <input type="color" class="continuum-chart__color" :value="ds.color ?? '#5b8def'"
                                        aria-label="Series colour"
                                        @input="(e) => setDatasetColor(dsIdx, (e.target as HTMLInputElement).value)" />
                                    <input type="text" class="continuum-chart__series-name" :value="ds.label"
                                        @input="(e) => setDatasetName(dsIdx, (e.target as HTMLInputElement).value)" />
                                </div>
                                <button v-if="datasets.length > 1" type="button" class="continuum-chart__series-remove"
                                    title="Remove series" aria-label="Remove series"
                                    @click="removeDataset(dsIdx)">Remove</button>
                            </div>
                        </th>
                        <th class="continuum-chart__th continuum-chart__th--actions" aria-label="Row actions"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="(label, rowIdx) in labels" :key="rowIdx">
                        <td class="continuum-chart__td">
                            <input type="text" class="continuum-chart__cell-input" :value="label"
                                @input="(e) => setLabel(rowIdx, (e.target as HTMLInputElement).value)" />
                        </td>
                        <td v-for="(ds, dsIdx) in datasets" :key="dsIdx" class="continuum-chart__td continuum-chart__td--value">
                            <input type="number" class="continuum-chart__cell-input continuum-chart__cell-input--num"
                                :value="ds.data[rowIdx] ?? 0"
                                @input="(e) => setCell(rowIdx, dsIdx, (e.target as HTMLInputElement).value)" />
                        </td>
                        <td class="continuum-chart__td continuum-chart__td--actions">
                            <button v-if="labels.length > 1" type="button" class="continuum-chart__row-del"
                                title="Remove row" aria-label="Remove row" @click="removeRow(rowIdx)">×</button>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<style scoped>
.continuum-chart__editor {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px);
    background: var(--bg, transparent);
    border: var(--border-width-1, 1px) solid var(--border, #e0e0e0);
    border-radius: var(--radius-sm, 6px);
}

.continuum-chart__editor-actions {
    display: inline-flex;
    gap: var(--space-2, 8px);
}

.continuum-chart__editor-btn {
    appearance: none;
    background: var(--bg-soft, transparent);
    color: var(--fg-muted, #666);
    border: var(--border-width-1, 1px) solid var(--border, #e0e0e0);
    border-radius: var(--radius-xs, 4px);
    padding: 2px 8px;
    font-size: var(--text-xs, 12px);
    cursor: pointer;
}

.continuum-chart__editor-btn:hover {
    background: var(--bg-elev, rgba(0, 0, 0, 0.04));
    color: var(--fg, inherit);
}

.continuum-chart__table-wrap {
    overflow-x: auto;
}

.continuum-chart__table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--text-xs, 12px);
}

.continuum-chart__th {
    text-align: left;
    padding: 4px 6px;
    color: var(--fg-muted, #666);
    font-weight: var(--font-weight-medium, 500);
    border-bottom: var(--border-width-1, 1px) solid var(--border, #e0e0e0);
}

.continuum-chart__th--label {
    width: 40%;
}

.continuum-chart__th--series {
    min-width: 136px;
}

.continuum-chart__th--actions {
    width: 28px;
}

.continuum-chart__td {
    padding: 2px 4px;
    border-bottom: var(--border-width-1, 1px) solid var(--border-soft, rgba(0, 0, 0, 0.05));
    vertical-align: middle;
}

.continuum-chart__td--actions {
    text-align: right;
}

.continuum-chart__td--value {
    min-width: 136px;
}

.continuum-chart__cell-input {
    width: 100%;
    appearance: none;
    background: transparent;
    color: var(--fg, inherit);
    border: var(--border-width-1, 1px) solid transparent;
    border-radius: var(--radius-xs, 4px);
    padding: 2px 4px;
    font: inherit;
}

.continuum-chart__cell-input:focus {
    outline: none;
    border-color: var(--accent, #5b8def);
    background: var(--bg-elev, rgba(0, 0, 0, 0.03));
}

.continuum-chart__cell-input--num {
    text-align: right;
    font-variant-numeric: tabular-nums;
}

.continuum-chart__series-head {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
}

.continuum-chart__series-main {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 4px;
}

.continuum-chart__series-name {
    appearance: none;
    background: transparent;
    color: var(--fg, inherit);
    border: none;
    font: inherit;
    font-weight: var(--font-weight-semibold, 600);
    min-width: 0;
    width: 100%;
}

.continuum-chart__series-remove {
    appearance: none;
    align-self: flex-start;
    background: transparent;
    color: var(--fg-muted, #666);
    border: var(--border-width-1, 1px) solid var(--border, #e0e0e0);
    border-radius: var(--radius-xs, 4px);
    cursor: pointer;
    font-size: var(--text-2xs, 11px);
    line-height: 1.2;
    padding: 2px 6px;
}

.continuum-chart__series-remove:hover {
    background: var(--danger-soft, rgba(239, 68, 68, 0.12));
    color: var(--danger, #ef4444);
    border-color: var(--danger, #ef4444);
}

.continuum-chart__color {
    width: 18px;
    height: 18px;
    appearance: none;
    background: transparent;
    border: var(--border-width-1, 1px) solid var(--border, #e0e0e0);
    border-radius: var(--radius-xs, 4px);
    padding: 0;
    cursor: pointer;
}

.continuum-chart__row-del {
    appearance: none;
    background: transparent;
    color: var(--fg-muted, #666);
    border: none;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 2px 4px;
    border-radius: var(--radius-xs, 4px);
}

.continuum-chart__row-del:hover {
    background: var(--danger-soft, rgba(239, 68, 68, 0.12));
    color: var(--danger, #ef4444);
}
</style>
