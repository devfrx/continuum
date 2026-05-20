/**
 * Tiptap extension factory for ContinuumEditor.
 *
 * Centralises the (large) extension list so the main component file stays
 * focused on UI concerns. Built lazily so collaboration mode can swap the
 * undo/redo history out without re-declaring the rest of the pipeline.
 *
 * Custom blocks (Callout, Chart, Database, Details, Footnote, CodeBlock)
 * are sourced from the block registry — see `./blocks` — so adding a new
 * block only requires registering a `BlockDefinition`, never editing
 * this file.
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
import UniqueID from '@tiptap/extension-unique-id';
import type { Component } from 'vue';
import { TrailingNode } from './extensions/TrailingNode';
import {
  SlashCommand,
  type SlashCommandItem,
  type SlashRendererInstance,
} from './extensions/slashCommand';
import { buildMathematics } from './extensions/Mathematics';
import { buildTableOfContents, type TocAnchor } from './extensions/TableOfContents';
import { WikilinkDecoration, type WikilinkClick } from './extensions/WikilinkDecoration';
import { createBlockRegistry, createBuiltinBlocks } from './blocks';

// Re-exported here to preserve the public API for any external consumer
// that previously imported `CODE_LANGUAGES` / `lowlight` from this module.
export { CODE_LANGUAGES, lowlight } from './codeLanguages';


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
  /**
   * Vue NodeView component for the Notion-like Database block. The host
   * supplies the entire renderer (table/list/board UI, API calls). When
   * omitted, the block falls back to a small "missing host" panel — the
   * Tiptap node is still registered so existing documents keep parsing.
   */
  databaseView?: Component;
  /** Vue NodeView for the inline Footnote atom (marker + edit popover). */
  footnoteView: Component;
  /**
   * Slash-menu wiring. When omitted (or `items` is empty) the slash
   * extension is skipped entirely so embeds that don't want a command
   * menu pay no runtime cost.
   */
  slashCommand?: {
    items: SlashCommandItem[];
    render: () => SlashRendererInstance;
  };
  /**
   * Table of contents wiring. When provided, the extension watches
   * heading nodes and pushes a flat anchor list to `onUpdate`; the
   * host typically routes the data into a sidebar (`NoteTocPanel`).
   * Omit to skip registration entirely — empty TOC = zero overhead.
   */
  tableOfContents?: {
    onUpdate: (anchors: TocAnchor[]) => void;
  };
  /**
   * KaTeX-powered math rendering. Toggles registration of the
   * decoration-based `Mathematics` extension which auto-renders any
   * `$\\LaTeX$` snippet typed into the document. The host is also
   * responsible for importing `katex/dist/katex.min.css` exactly
   * once — `ContinuumEditor.vue` does this at the top of its style
   * imports so every embed inherits the correct typography.
   */
  mathematics?: boolean;
  /**
   * Notion-style decoration for `[[target]]` / `[[target|alias]]`
   * syntax. The host receives a click event with the resolved target
   * (and optional alias) and is responsible for navigating to the
   * correct note. When omitted, wikilinks render as plain text.
   */
  wikilink?: {
    onNavigate: (link: WikilinkClick) => void;
  };
}

export function buildExtensions(opts: BuildOptions) {
  // Compose a per-editor block registry from the built-in definitions
  // (Callout, Details, Chart, Database, Footnote, CodeBlock). Each
  // definition declares its own Tiptap extension(s) wired to the
  // host-supplied NodeView — so this factory no longer needs to know
  // about individual custom nodes.
  const registry = createBlockRegistry(
    createBuiltinBlocks({
      codeBlockView: opts.codeBlockView,
      detailsView: opts.detailsView,
      calloutView: opts.calloutView,
      chartView: opts.chartView,
      databaseView: opts.databaseView,
      footnoteView: opts.footnoteView,
    }),
  );

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
    // Stable, document-scoped identifiers on every heading and paragraph.
    // Headings need ids so the TableOfContents extension can render
    // direct anchor links (and so external code can deep-link to a
    // section); paragraphs benefit too, e.g. for collaborative
    // commenting / footnote anchoring later. Public, MIT-licensed
    // since Tiptap v2.27, so safe to keep enabled by default.
    UniqueID.configure({
      types: ['heading', 'paragraph'],
      attributeName: 'id',
    }),
    Link.configure({ openOnClick: false }),
    Placeholder.configure({
      // Two-tier placeholder: the host's prompt sits on the first empty
      // block as a primary call-to-action, while every other empty
      // paragraph the caret enters carries a discreet "Type '/' for
      // commands" hint so the slash menu is discoverable without ever
      // polluting the rest of the document.
      includeChildren: false,
      placeholder: ({ node, pos }) => {
        if (pos === 0) return opts.placeholder;
        if (node.type.name === 'paragraph') return "Type '/' for commands";
        return '';
      },
    }),
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
    // Custom blocks (Callout, Details + summary + content, Chart,
    // Database, Footnote, CodeBlock) — sourced from the registry so
    // adding a block elsewhere does not require touching this list.
    ...registry.listExtensions(),
    TrailingNode,
    ...(opts.mathematics ? [buildMathematics()] : []),
    ...(opts.wikilink ? [WikilinkDecoration.configure({ onNavigate: opts.wikilink.onNavigate })] : []),
    ...(opts.tableOfContents
      ? [buildTableOfContents({ onUpdate: opts.tableOfContents.onUpdate })]
      : []),
    ...(opts.slashCommand && opts.slashCommand.items.length > 0
      ? [
          SlashCommand.configure({
            items: opts.slashCommand.items,
            render: opts.slashCommand.render,
          }),
        ]
      : []),
  ];
}

export type { TocAnchor } from './extensions/TableOfContents';
export type { WikilinkClick } from './extensions/WikilinkDecoration';
