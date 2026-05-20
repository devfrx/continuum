/**
 * Central registry for block-to-block transformations.
 *
 * Both the editor context menu and the native block handle read from this
 * module. Adding a new transform target or changing which source blocks may
 * transform into it should happen here, not inside individual menus.
 */
import type { Editor } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode, type Schema } from '@tiptap/pm/model';
import { TextSelection } from '@tiptap/pm/state';
import { getBlockAtPos, type EditorBlockSnapshot } from './blockActions';

export type TurnIntoTargetId =
  | 'paragraph'
  | 'heading-1'
  | 'heading-2'
  | 'heading-3'
  | 'heading-4'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'details'
  | 'callout'
  | 'blockquote'
  | 'codeBlock';

export type TurnIntoSourceType =
  | 'paragraph'
  | 'heading'
  | 'blockquote'
  | 'bulletList'
  | 'orderedList'
  | 'taskList'
  | 'codeBlock'
  | 'horizontalRule'
  | 'table'
  | 'image'
  | 'callout'
  | 'details'
  | 'chart'
  | 'database'
  | 'footnote';

export type TurnIntoGroup = 'text' | 'list' | 'container';

export interface TurnIntoTarget {
  id: TurnIntoTargetId;
  label: string;
  icon: string;
  group: TurnIntoGroup;
  shortcut?: string;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => boolean;
}

const TEXT_FLOW_TARGETS = [
  'paragraph',
  'heading-1',
  'heading-2',
  'heading-3',
  'heading-4',
  'bulletList',
  'orderedList',
  'taskList',
  'details',
  'callout',
  'blockquote',
  'codeBlock',
] as const satisfies readonly TurnIntoTargetId[];

export const TURN_INTO_TARGETS_BY_SOURCE = {
  paragraph: TEXT_FLOW_TARGETS,
  heading: TEXT_FLOW_TARGETS,
  blockquote: TEXT_FLOW_TARGETS,
  bulletList: TEXT_FLOW_TARGETS,
  orderedList: TEXT_FLOW_TARGETS,
  taskList: TEXT_FLOW_TARGETS,
  codeBlock: TEXT_FLOW_TARGETS,
  horizontalRule: [],
  table: [],
  image: [],
  callout: TEXT_FLOW_TARGETS,
  details: TEXT_FLOW_TARGETS,
  chart: [],
  database: [],
  footnote: [],
} as const satisfies Record<TurnIntoSourceType, readonly TurnIntoTargetId[]>;

const SOURCE_PRIORITY: readonly TurnIntoSourceType[] = [
  'database',
  'chart',
  'table',
  'image',
  'horizontalRule',
  'details',
  'callout',
  'taskList',
  'bulletList',
  'orderedList',
  'codeBlock',
  'blockquote',
  'heading',
  'paragraph',
];

const TARGETS: readonly TurnIntoTarget[] = [
  {
    id: 'paragraph',
    label: 'Text',
    icon: 'notes',
    group: 'text',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'paragraph'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'paragraph'),
  },
  {
    id: 'heading-1',
    label: 'Heading 1',
    icon: 'heading-1',
    group: 'text',
    shortcut: 'Ctrl+Alt+1',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'heading-1'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'heading-1'),
  },
  {
    id: 'heading-2',
    label: 'Heading 2',
    icon: 'heading-2',
    group: 'text',
    shortcut: 'Ctrl+Alt+2',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'heading-2'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'heading-2'),
  },
  {
    id: 'heading-3',
    label: 'Heading 3',
    icon: 'heading-3',
    group: 'text',
    shortcut: 'Ctrl+Alt+3',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'heading-3'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'heading-3'),
  },
  {
    id: 'heading-4',
    label: 'Heading 4',
    icon: 'heading-4',
    group: 'text',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'heading-4'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'heading-4'),
  },
  {
    id: 'bulletList',
    label: 'Bulleted list',
    icon: 'list-bullet',
    group: 'list',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'bulletList'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'bulletList'),
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    icon: 'list-ordered',
    group: 'list',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'orderedList'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'orderedList'),
  },
  {
    id: 'taskList',
    label: 'To-do list',
    icon: 'task',
    group: 'list',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'taskList'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'taskList'),
  },
  {
    id: 'details',
    label: 'Toggle',
    icon: 'toggle',
    group: 'container',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'details'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'details'),
  },
  {
    id: 'callout',
    label: 'Callout',
    icon: 'callout',
    group: 'container',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'callout'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'callout'),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    icon: 'quote',
    group: 'container',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'blockquote'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'blockquote'),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    icon: 'code-block',
    group: 'container',
    isActive: (editor) => isTurnIntoTargetActiveAtSelection(editor, 'codeBlock'),
    run: (editor) => turnSelectedBlockIntoTarget(editor, 'codeBlock'),
  },
];

const TARGET_BY_ID = new Map<TurnIntoTargetId, TurnIntoTarget>(
  TARGETS.map((target) => [target.id, target]),
);

export function isTurnIntoSourceType(value: string): value is TurnIntoSourceType {
  return value in TURN_INTO_TARGETS_BY_SOURCE;
}

export function getTurnIntoTargetsForSource(sourceType: string | null): TurnIntoTarget[] {
  if (!sourceType || !isTurnIntoSourceType(sourceType)) return [];
  return TURN_INTO_TARGETS_BY_SOURCE[sourceType]
    .map((targetId) => TARGET_BY_ID.get(targetId))
    .filter((target): target is TurnIntoTarget => target !== undefined);
}

export function getTurnIntoTargetsForBlock(block: EditorBlockSnapshot): TurnIntoTarget[] {
  return getTurnIntoTargetsForSource(block.type);
}

export function getTurnIntoSourceTypeAtSelection(editor: Editor): TurnIntoSourceType | null {
  const block = getTurnIntoBlockAtSelection(editor);
  if (block && isTurnIntoSourceType(block.type)) return block.type;
  for (const sourceType of SOURCE_PRIORITY) {
    if (editor.isActive(sourceType)) return sourceType;
  }
  return null;
}

export function runTurnIntoTarget(editor: Editor, targetId: TurnIntoTargetId): boolean {
  const target = TARGET_BY_ID.get(targetId);
  if (!target) return false;
  return target.run(editor);
}

export function runTurnIntoTargetForBlock(
  editor: Editor,
  block: EditorBlockSnapshot,
  targetId: TurnIntoTargetId,
): boolean {
  if (isTurnIntoTargetActiveForBlock(block, targetId)) return true;
  if (!getTurnIntoTargetsForBlock(block).some((target) => target.id === targetId)) return false;
  return turnBlockIntoTarget(editor, block, targetId);
}

export function isTurnIntoTargetActiveForBlock(
  block: EditorBlockSnapshot,
  targetId: TurnIntoTargetId,
): boolean {
  if (targetId === 'paragraph') return block.type === 'paragraph';
  if (targetId === 'blockquote') return block.type === 'blockquote';
  if (targetId === 'bulletList') return block.type === 'bulletList';
  if (targetId === 'orderedList') return block.type === 'orderedList';
  if (targetId === 'taskList') return block.type === 'taskList';
  if (targetId === 'details') return block.type === 'details';
  if (targetId === 'callout') return block.type === 'callout';
  if (targetId === 'codeBlock') return block.type === 'codeBlock';
  if (!targetId.startsWith('heading-')) return false;
  const level = Number(targetId.slice('heading-'.length));
  return block.type === 'heading' && Number(block.node.attrs.level ?? 1) === level;
}

function isTurnIntoTargetActiveAtSelection(editor: Editor, targetId: TurnIntoTargetId): boolean {
  const block = getTurnIntoBlockAtSelection(editor);
  return block ? isTurnIntoTargetActiveForBlock(block, targetId) : false;
}

function turnSelectedBlockIntoTarget(editor: Editor, targetId: TurnIntoTargetId): boolean {
  const block = getTurnIntoBlockAtSelection(editor);
  if (!block) return false;
  return runTurnIntoTargetForBlock(editor, block, targetId);
}

function getTurnIntoBlockAtSelection(editor: Editor): EditorBlockSnapshot | null {
  const { doc, selection } = editor.state;
  const primaryPos = Math.max(0, Math.min(selection.from, doc.content.size));
  return getBlockAtPos(editor, primaryPos)
    ?? getBlockAtPos(editor, Math.max(0, Math.min(selection.to - 1, doc.content.size)));
}

function turnBlockIntoTarget(
  editor: Editor,
  block: EditorBlockSnapshot,
  targetId: TurnIntoTargetId,
): boolean {
  const replacement = buildTargetReplacement(editor.state.schema, block.node, targetId);
  if (replacement.length === 0) return false;
  const { state, view } = editor;
  const tr = state.tr.replaceWith(block.from, block.to, replacement);
  const selectionPos = Math.max(0, Math.min(block.from + 1, tr.doc.content.size));
  try {
    tr.setSelection(TextSelection.near(tr.doc.resolve(selectionPos), 1));
  } catch {
    // Some future atom-like target may not expose a text position; replacement still succeeded.
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

function buildTargetReplacement(
  schema: Schema,
  source: ProseMirrorNode,
  targetId: TurnIntoTargetId,
): ProseMirrorNode[] {
  const paragraphs = extractFlowParagraphs(schema, source);
  if (targetId === 'paragraph') return paragraphs;
  if (targetId.startsWith('heading-')) {
    return buildHeadingReplacement(schema, paragraphs, Number(targetId.slice('heading-'.length)));
  }
  if (targetId === 'bulletList' || targetId === 'orderedList' || targetId === 'taskList') {
    return buildListReplacement(schema, paragraphs, targetId);
  }
  if (targetId === 'details') return buildDetailsReplacement(schema, paragraphs);
  if (targetId === 'callout') return buildWrapperReplacement(schema, 'callout', paragraphs, { icon: 'name:info' });
  if (targetId === 'blockquote') return buildWrapperReplacement(schema, 'blockquote', paragraphs);
  if (targetId === 'codeBlock') return buildCodeBlockReplacement(schema, paragraphs);
  return [];
}

function extractFlowParagraphs(schema: Schema, source: ProseMirrorNode): ProseMirrorNode[] {
  const paragraphs: ProseMirrorNode[] = [];
  collectFlowParagraphs(schema, source, paragraphs);
  if (paragraphs.length > 0) return paragraphs;
  const paragraph = emptyParagraph(schema);
  return paragraph ? [paragraph] : [];
}

function collectFlowParagraphs(
  schema: Schema,
  node: ProseMirrorNode,
  out: ProseMirrorNode[],
): void {
  if (isListNode(node) || isContainerNode(node) || node.type.name === 'detailsContent') {
    node.forEach((child) => collectFlowParagraphs(schema, child, out));
    return;
  }
  if (node.type.name === 'detailsSummary' || node.isTextblock) {
    pushParagraphFromInline(schema, node.content, out);
    return;
  }
  if (node.isBlock && node.childCount > 0) {
    node.forEach((child) => collectFlowParagraphs(schema, child, out));
    return;
  }
  if (node.textContent.trim().length > 0) {
    pushParagraphFromText(schema, node.textContent, out);
  }
}

function isListNode(node: ProseMirrorNode): boolean {
  return node.type.name === 'bulletList'
    || node.type.name === 'orderedList'
    || node.type.name === 'taskList';
}

function isContainerNode(node: ProseMirrorNode): boolean {
  return node.type.name === 'callout'
    || node.type.name === 'details'
    || node.type.name === 'blockquote';
}

function pushParagraphFromInline(
  schema: Schema,
  content: Fragment,
  out: ProseMirrorNode[],
): void {
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) return;
  out.push(paragraphType.create(null, content.size > 0 ? content : undefined));
}

function pushParagraphFromText(schema: Schema, text: string, out: ProseMirrorNode[]): void {
  const paragraphType = schema.nodes.paragraph;
  if (!paragraphType) return;
  out.push(paragraphType.create(null, text ? schema.text(text) : undefined));
}

function emptyParagraph(schema: Schema): ProseMirrorNode | null {
  return schema.nodes.paragraph?.create() ?? null;
}

function buildHeadingReplacement(
  schema: Schema,
  paragraphs: readonly ProseMirrorNode[],
  level: number,
): ProseMirrorNode[] {
  const headingType = schema.nodes.heading;
  if (!headingType) return [];
  const safeLevel = Math.min(Math.max(level, 1), 4);
  return paragraphs.map((paragraph) => headingType.create({ level: safeLevel }, paragraph.content));
}

function buildListReplacement(
  schema: Schema,
  paragraphs: readonly ProseMirrorNode[],
  targetId: Extract<TurnIntoTargetId, 'bulletList' | 'orderedList' | 'taskList'>,
): ProseMirrorNode[] {
  const listType = schema.nodes[targetId];
  const itemType = targetId === 'taskList' ? schema.nodes.taskItem : schema.nodes.listItem;
  const paragraphType = schema.nodes.paragraph;
  if (!listType || !itemType || !paragraphType) return [];
  const items = paragraphs.map((paragraph) => itemType.create(
    targetId === 'taskList' ? { checked: false } : null,
    paragraphType.create(null, paragraph.content),
  ));
  return [listType.create(null, items)];
}

function buildDetailsReplacement(
  schema: Schema,
  paragraphs: readonly ProseMirrorNode[],
): ProseMirrorNode[] {
  const detailsType = schema.nodes.details;
  const summaryType = schema.nodes.detailsSummary;
  const contentType = schema.nodes.detailsContent;
  const fallbackParagraph = emptyParagraph(schema);
  if (!detailsType || !summaryType || !contentType || !fallbackParagraph) return [];
  const [summarySource, ...bodyBlocks] = paragraphs;
  const summaryContent = summarySource && summarySource.content.size > 0
    ? summarySource.content
    : Fragment.from(schema.text('Toggle'));
  const contentBlocks = bodyBlocks.length > 0 ? bodyBlocks : [fallbackParagraph];
  return [detailsType.create({ open: true }, [
    summaryType.create(null, summaryContent),
    contentType.create(null, contentBlocks),
  ])];
}

function buildWrapperReplacement(
  schema: Schema,
  typeName: 'callout' | 'blockquote',
  paragraphs: readonly ProseMirrorNode[],
  attrs: Record<string, unknown> | null = null,
): ProseMirrorNode[] {
  const nodeType = schema.nodes[typeName];
  if (!nodeType) return [];
  return [nodeType.create(attrs, paragraphs)];
}

function buildCodeBlockReplacement(
  schema: Schema,
  paragraphs: readonly ProseMirrorNode[],
): ProseMirrorNode[] {
  const codeBlockType = schema.nodes.codeBlock;
  if (!codeBlockType) return [];
  const text = paragraphs.map((paragraph) => paragraph.textContent).join('\n');
  return [codeBlockType.create(null, text ? schema.text(text) : undefined)];
}