import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { useChartDataModel } from '../useChartDataModel';
import type { ChartData } from '../chartTypes';

function baseData(): ChartData {
  return {
    labels: ['Jan', 'Feb'],
    datasets: [
      { label: 'Revenue', data: [10, 20], color: '#f00' },
      { label: 'Cost', data: [3, 4] },
    ],
  };
}

describe('useChartDataModel', () => {
  it('exposes labels and datasets reactively', () => {
    const data = ref<ChartData>(baseData());
    const onCommit = vi.fn<(next: ChartData) => void>();
    const api = useChartDataModel({ data, onCommit });
    expect(api.labels.value).toEqual(['Jan', 'Feb']);
    expect(api.datasets.value).toHaveLength(2);
  });

  it('setLabel commits a clone with the changed label and never mutates source', () => {
    const data = ref<ChartData>(baseData());
    const original = data.value;
    const onCommit = vi.fn<(next: ChartData) => void>();
    const api = useChartDataModel({ data, onCommit });
    api.setLabel(0, 'January');
    expect(onCommit).toHaveBeenCalledOnce();
    const next = onCommit.mock.calls[0]![0];
    expect(next).not.toBe(original);
    expect(next.labels).toEqual(['January', 'Feb']);
    expect(original.labels).toEqual(['Jan', 'Feb']);
  });

  it('setCell coerces non-numeric strings to 0 and finite numbers pass through', () => {
    const data = ref<ChartData>(baseData());
    const onCommit = vi.fn<(next: ChartData) => void>();
    const api = useChartDataModel({ data, onCommit });
    api.setCell(1, 0, '42');
    expect(onCommit.mock.calls[0]![0].datasets[0]!.data).toEqual([10, 42]);
    api.setCell(0, 1, 'nope');
    expect(onCommit.mock.calls[1]![0].datasets[1]!.data).toEqual([0, 4]);
  });

  it('addRow appends a label and pads each dataset with 0', () => {
    const data = ref<ChartData>(baseData());
    const onCommit = vi.fn<(next: ChartData) => void>();
    const api = useChartDataModel({ data, onCommit });
    api.addRow();
    const next = onCommit.mock.calls[0]![0];
    expect(next.labels).toEqual(['Jan', 'Feb', 'Item 3']);
    expect(next.datasets[0]!.data).toEqual([10, 20, 0]);
    expect(next.datasets[1]!.data).toEqual([3, 4, 0]);
  });

  it('removeRow deletes the row across all datasets', () => {
    const data = ref<ChartData>(baseData());
    const onCommit = vi.fn<(next: ChartData) => void>();
    const api = useChartDataModel({ data, onCommit });
    api.removeRow(0);
    const next = onCommit.mock.calls[0]![0];
    expect(next.labels).toEqual(['Feb']);
    expect(next.datasets[0]!.data).toEqual([20]);
    expect(next.datasets[1]!.data).toEqual([4]);
  });

  it('removeRow refuses to remove the last row', () => {
    const data = ref<ChartData>({
      labels: ['Only'],
      datasets: [{ label: 'A', data: [1] }],
    });
    const onCommit = vi.fn<(next: ChartData) => void>();
    const api = useChartDataModel({ data, onCommit });
    api.removeRow(0);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('addDataset appends a series sized to current label count', () => {
    const data = ref<ChartData>(baseData());
    const onCommit = vi.fn<(next: ChartData) => void>();
    const api = useChartDataModel({ data, onCommit });
    api.addDataset();
    const next = onCommit.mock.calls[0]![0];
    expect(next.datasets).toHaveLength(3);
    expect(next.datasets[2]!.data).toEqual([0, 0]);
    expect(next.datasets[2]!.label).toBe('Series 3');
  });

  it('removeDataset removes by index but keeps at least one', () => {
    const data = ref<ChartData>(baseData());
    const onCommit = vi.fn<(next: ChartData) => void>();
    const api = useChartDataModel({ data, onCommit });
    api.removeDataset(0);
    expect(onCommit.mock.calls[0]![0].datasets.map((d) => d.label)).toEqual(['Cost']);

    const single = ref<ChartData>({ labels: ['x'], datasets: [{ label: 'A', data: [1] }] });
    const onCommit2 = vi.fn<(next: ChartData) => void>();
    const api2 = useChartDataModel({ data: single, onCommit: onCommit2 });
    api2.removeDataset(0);
    expect(onCommit2).not.toHaveBeenCalled();
  });

  it('round-trips through onCommit when the host updates the source ref', () => {
    const data = ref<ChartData>(baseData());
    const onCommit = vi.fn<(next: ChartData) => void>((n) => {
      data.value = n;
    });
    const api = useChartDataModel({ data, onCommit });
    api.setDatasetName(0, 'Sales');
    api.setDatasetColor(1, '#0f0');
    expect(data.value.datasets[0]!.label).toBe('Sales');
    expect(data.value.datasets[1]!.color).toBe('#0f0');
  });
});
