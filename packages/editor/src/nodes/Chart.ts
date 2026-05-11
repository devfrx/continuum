/**
 * Chart node — block that renders a Chart.js visualisation.
 *
 * The full chart payload (kind + data + options) is serialized as a
 * JSON string in `data-chart` so notes round-trip through Tiptap's
 * HTML output without losing structure. This keeps the schema simple
 * (one node, one attribute) at the cost of a single JSON parse on
 * load — negligible for the tens-of-cells charts the editor surfaces.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import { DEFAULT_CHART_ATTRS, type ChartAttrs } from './chartTypes';

function safeParse(raw: string | null): ChartAttrs {
  if (!raw) return DEFAULT_CHART_ATTRS;
  try {
    const parsed = JSON.parse(raw) as Partial<ChartAttrs>;
    return {
      kind: parsed.kind ?? DEFAULT_CHART_ATTRS.kind,
      data: parsed.data ?? DEFAULT_CHART_ATTRS.data,
      options: parsed.options ?? DEFAULT_CHART_ATTRS.options,
    };
  } catch {
    return DEFAULT_CHART_ATTRS;
  }
}

export const Chart = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      kind: {
        default: DEFAULT_CHART_ATTRS.kind,
        parseHTML: (el) => safeParse(el.getAttribute('data-chart')).kind,
      },
      data: {
        default: DEFAULT_CHART_ATTRS.data,
        parseHTML: (el) => safeParse(el.getAttribute('data-chart')).data,
      },
      options: {
        default: DEFAULT_CHART_ATTRS.options,
        parseHTML: (el) => safeParse(el.getAttribute('data-chart')).options,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const payload: ChartAttrs = {
      kind: node.attrs.kind,
      data: node.attrs.data,
      options: node.attrs.options,
    };
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'chart',
        'data-chart': JSON.stringify(payload),
        class: 'continuum-chart',
      }),
    ];
  },
});
