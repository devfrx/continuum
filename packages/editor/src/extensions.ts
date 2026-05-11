/**
 * Tiptap extension factory for ContinuumEditor.
 *
 * Centralises the (large) extension list so the main component file stays
 * focused on UI concerns. Built lazily so collaboration mode can swap the
 * undo/redo history out without re-declaring the rest of the pipeline.
 */
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Image from '@tiptap/extension-image';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import Typography from '@tiptap/extension-typography';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import type { Component } from 'vue';
import { all, createLowlight } from 'lowlight';
import { Details, DetailsSummary, DetailsContent } from './nodes/Details';
import { Callout } from './nodes/Callout';
import { Chart } from './nodes/Chart';
import { TrailingNode } from './extensions/TrailingNode';

export const lowlight = createLowlight(all);

// Re-exported here to preserve the public API for any external consumer
// that previously imported `CODE_LANGUAGES` from this module.
export { CODE_LANGUAGES } from './codeLanguages';

interface BuildOptions {
  collaborative: boolean;
  placeholder: string;
  /** Vue NodeView component for code blocks (provides language picker). */
  codeBlockView: Component;
  /** Vue NodeView component for the Toggle/Details block. */
  detailsView: Component;
  /** Vue NodeView component for the Callout block (provides icon picker). */
  calloutView: Component;
  /** Vue NodeView component for the Chart block (provides editor + canvas). */
  chartView: Component;
}

export function buildExtensions(opts: BuildOptions) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3, 4] },
      history: opts.collaborative ? false : undefined,
      // We replace the bundled CodeBlock with CodeBlockLowlight below.
      codeBlock: false,
    }),
    Underline,
    Subscript,
    Superscript,
    Typography,
    Link.configure({ openOnClick: false }),
    Placeholder.configure({ placeholder: opts.placeholder }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Table.configure({ resizable: true }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({ inline: false, allowBase64: true }).extend({
      addAttributes() {
        const parent = this.parent?.() ?? {};
        return {
          ...parent,
          align: {
            default: 'left',
            parseHTML: (el) => el.getAttribute('data-align') ?? 'left',
            renderHTML: (attrs) => {
              const a = (attrs.align as string | undefined) ?? 'left';
              return { 'data-align': a };
            },
          },
        };
      },
    }),
    Details.extend({
      addNodeView() {
        return VueNodeViewRenderer(opts.detailsView);
      },
    }),
    DetailsSummary,
    DetailsContent,
    Callout.extend({
      addNodeView() {
        return VueNodeViewRenderer(opts.calloutView);
      },
    }),
    Chart.extend({
      addNodeView() {
        return VueNodeViewRenderer(opts.chartView);
      },
    }),
    CodeBlockLowlight.extend({
      addNodeView() {
        return VueNodeViewRenderer(opts.codeBlockView);
      },
    }).configure({ lowlight, defaultLanguage: 'plaintext' }),
    TrailingNode,
  ];
}
