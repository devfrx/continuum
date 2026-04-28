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
import { TrailingNode } from './extensions/TrailingNode';

export const lowlight = createLowlight(all);

/** Languages exposed by the code-block selector, in display order. */
export const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: 'plaintext', label: 'Plain text' },
  { value: 'bash', label: 'Bash' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'css', label: 'CSS' },
  { value: 'diff', label: 'Diff' },
  { value: 'go', label: 'Go' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'html', label: 'HTML' },
  { value: 'java', label: 'Java' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'json', label: 'JSON' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'php', label: 'PHP' },
  { value: 'python', label: 'Python' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'rust', label: 'Rust' },
  { value: 'scss', label: 'SCSS' },
  { value: 'shell', label: 'Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'swift', label: 'Swift' },
  { value: 'toml', label: 'TOML' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'vue', label: 'Vue' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
];

interface BuildOptions {
  collaborative: boolean;
  placeholder: string;
  /** Vue NodeView component for code blocks (provides language picker). */
  codeBlockView: Component;
  /** Vue NodeView component for the Toggle/Details block. */
  detailsView: Component;
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
    Callout,
    CodeBlockLowlight.extend({
      addNodeView() {
        return VueNodeViewRenderer(opts.codeBlockView);
      },
    }).configure({ lowlight, defaultLanguage: 'plaintext' }),
    TrailingNode,
  ];
}
