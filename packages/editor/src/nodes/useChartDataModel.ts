import { computed, type ComputedRef, type Ref } from 'vue';
import type { ChartData, ChartDataset } from './chartTypes';

/**
 * Reactive model + commands for editing a `ChartData` object in
 * `ChartDataEditor`.
 *
 * The composable never mutates the source data: every command builds a
 * fresh `ChartData` (deep enough for the editor's needs) and emits it
 * via `commit`. This keeps upstream reactivity predictable and the undo
 * history clean.
 */
export interface UseChartDataModelOptions {
    /** Current chart data (source of truth, owned upstream). */
    data: Ref<ChartData> | ComputedRef<ChartData>;
    /** Persists a new `ChartData` upstream (typically `emit('update:data', next)`). */
    onCommit: (next: ChartData) => void;
}

export interface UseChartDataModelApi {
    labels: ComputedRef<string[]>;
    datasets: ComputedRef<ChartDataset[]>;
    setLabel: (idx: number, value: string) => void;
    setCell: (rowIdx: number, dsIdx: number, raw: string) => void;
    setDatasetName: (dsIdx: number, name: string) => void;
    setDatasetColor: (dsIdx: number, color: string) => void;
    addRow: () => void;
    removeRow: (idx: number) => void;
    addDataset: () => void;
    removeDataset: (idx: number) => void;
}

export function useChartDataModel(opts: UseChartDataModelOptions): UseChartDataModelApi {
    const labels = computed(() => opts.data.value.labels);
    const datasets = computed(() => opts.data.value.datasets);

    function clone(): ChartData {
        const src = opts.data.value;
        return {
            labels: [...src.labels],
            datasets: src.datasets.map((d) => ({
                label: d.label,
                data: [...d.data],
                color: d.color,
            })),
        };
    }

    function setLabel(idx: number, value: string): void {
        const next = clone();
        next.labels[idx] = value;
        opts.onCommit(next);
    }

    function setCell(rowIdx: number, dsIdx: number, raw: string): void {
        const next = clone();
        const num = Number(raw);
        next.datasets[dsIdx]!.data[rowIdx] = Number.isFinite(num) ? num : 0;
        opts.onCommit(next);
    }

    function setDatasetName(dsIdx: number, name: string): void {
        const next = clone();
        next.datasets[dsIdx]!.label = name;
        opts.onCommit(next);
    }

    function setDatasetColor(dsIdx: number, color: string): void {
        const next = clone();
        next.datasets[dsIdx]!.color = color;
        opts.onCommit(next);
    }

    function addRow(): void {
        const next = clone();
        next.labels.push(`Item ${next.labels.length + 1}`);
        for (const ds of next.datasets) ds.data.push(0);
        opts.onCommit(next);
    }

    function removeRow(idx: number): void {
        if (opts.data.value.labels.length <= 1) return;
        const next = clone();
        next.labels.splice(idx, 1);
        for (const ds of next.datasets) ds.data.splice(idx, 1);
        opts.onCommit(next);
    }

    function addDataset(): void {
        const next = clone();
        const blank: ChartDataset = {
            label: `Series ${next.datasets.length + 1}`,
            data: next.labels.map(() => 0),
        };
        next.datasets.push(blank);
        opts.onCommit(next);
    }

    function removeDataset(idx: number): void {
        if (opts.data.value.datasets.length <= 1) return;
        const next = clone();
        next.datasets.splice(idx, 1);
        opts.onCommit(next);
    }

    return {
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
    };
}
