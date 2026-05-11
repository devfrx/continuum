/**
 * Shared types for the editor's Chart node.
 *
 * Kept in a dedicated module so both the schema (`Chart.ts`) and the
 * NodeView (`ChartNodeView.vue`) can import them without circular
 * dependencies, and so the host application can type-check chart
 * payloads round-tripped through the persistence layer.
 */

/** Visual variants supported by the chart block. */
export type ChartKind = 'bar' | 'line' | 'area' | 'pie' | 'doughnut' | 'radar';

/** A single series of values aligned to `ChartData.labels`. */
export interface ChartDataset {
  label: string;
  /**
   * Numeric values, one per category in `labels`. Missing entries are
   * coerced to `null` at render time so Chart.js draws a gap rather
   * than crashing.
   */
  data: number[];
  /** Optional explicit colour (CSS hex or var). When omitted the
   * NodeView assigns one from the theme palette by index. */
  color?: string;
}

export interface ChartData {
  /** Category axis labels (or wedge labels for pie/doughnut). */
  labels: string[];
  datasets: ChartDataset[];
}

export interface ChartOptions {
  /** Optional title rendered above the chart. */
  title?: string;
  /** Display the legend strip (default: true for multi-series). */
  showLegend?: boolean;
  /** Render the value-axis grid (default: true for cartesian charts). */
  showGrid?: boolean;
}

export interface ChartAttrs {
  kind: ChartKind;
  data: ChartData;
  options: ChartOptions;
}

/** Default attributes used when a brand-new chart node is inserted. */
export const DEFAULT_CHART_ATTRS: ChartAttrs = {
  kind: 'bar',
  data: {
    labels: ['Jan', 'Feb', 'Mar', 'Apr'],
    datasets: [{ label: 'Series A', data: [12, 19, 8, 15] }],
  },
  options: {
    title: 'Untitled chart',
    showLegend: true,
    showGrid: true,
  },
};

/** Human-readable labels for the kind picker. */
export const CHART_KINDS: { value: ChartKind; label: string }[] = [
  { value: 'bar', label: 'Bar' },
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'doughnut', label: 'Doughnut' },
  { value: 'radar', label: 'Radar' },
];
