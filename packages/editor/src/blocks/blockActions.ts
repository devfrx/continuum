/**
 * Block action utilities.
 *
 * Small ProseMirror/Tiptap transaction helpers used by the native block
 * handle. Keeping them outside Vue makes the interaction layer testable
 * and keeps `EditorBlockHandle.vue` focused on pointer/menu state.
 */
import type { Editor } from '@tiptap/core';
import { Fragment, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';

/** Snapshot of one top-level editor block. Positions are document positions. */
export interface EditorBlockSnapshot {
  pos: number;
  from: number;
  to: number;
  index: number;
  node: ProseMirrorNode;
  type: string;
  label: string;
  icon: string;
}

interface KnownBlockPresentation {
  label: string;
  icon: string;
}

const KNOWN_BLOCKS: Record<string, KnownBlockPresentation> = {
  paragraph: { label: 'Text', icon: 'notes' },
  heading: { label: 'Heading', icon: 'heading-1' },
  blockquote: { label: 'Quote', icon: 'quote' },
  bulletList: { label: 'Bulleted list', icon: 'list-bullet' },
  orderedList: { label: 'Numbered list', icon: 'list-ordered' },
  taskList: { label: 'To-do list', icon: 'task' },
  codeBlock: { label: 'Code block', icon: 'code-block' },
  horizontalRule: { label: 'Divider', icon: 'divider' },
  table: { label: 'Table', icon: 'table' },
  image: { label: 'Image', icon: 'image' },
  callout: { label: 'Callout', icon: 'callout' },
  details: { label: 'Toggle', icon: 'toggle' },
  chart: { label: 'Chart', icon: 'chart' },
  database: { label: 'Database', icon: 'database' },
};

function presentationFor(node: ProseMirrorNode): KnownBlockPresentation {
  if (node.type.name === 'heading') {
    const level = Number(node.attrs.level ?? 1);
    return { label: `Heading ${level}`, icon: `heading-${Math.min(Math.max(level, 1), 4)}` };
  }
  return KNOWN_BLOCKS[node.type.name] ?? { label: node.type.name, icon: 'notes' };
}

function cloneForDuplicate(node: ProseMirrorNode): ProseMirrorNode {
  if (node.isText) return node;
  const attrs = { ...node.attrs };
  if ((node.type.name === 'heading' || node.type.name === 'paragraph') && 'id' in attrs) {
    delete attrs.id;
  }
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => {
    children.push(cloneForDuplicate(child));
  });
  const content = children.length > 0 ? Fragment.fromArray(children) : node.content;
  return node.type.create(attrs, content, node.marks);
}

/** Iterate the document's direct block children with their start positions. */
export function listTopLevelBlocks(editor: Editor): EditorBlockSnapshot[] {
  const blocks: EditorBlockSnapshot[] = [];
  editor.state.doc.forEach((node, offset, index) => {
    if (!node.isBlock) return;
    const pos = offset;
    const presentation = presentationFor(node);
    blocks.push({
      pos,
      from: pos,
      to: pos + node.nodeSize,
      index,
      node,
      type: node.type.name,
      label: presentation.label,
      icon: presentation.icon,
    });
  });
  return blocks;
}

/** Resolve the direct child block containing `pos`. */
export function getBlockAtPos(editor: Editor, pos: number): EditorBlockSnapshot | null {
  const doc = editor.state.doc;
  const safePos = Math.max(0, Math.min(pos, doc.content.size));
  let found: EditorBlockSnapshot | null = null;
  doc.forEach((node, offset, index) => {
    if (found || !node.isBlock) return;
    const from = offset;
    const to = from + node.nodeSize;
    const isEndOfLastBlock = safePos === doc.content.size && to === doc.content.size;
    if (safePos < from || (safePos >= to && !isEndOfLastBlock)) return;
    const presentation = presentationFor(node);
    found = {
      pos: from,
      from,
      to,
      index,
      node,
      type: node.type.name,
      label: presentation.label,
      icon: presentation.icon,
    };
  });
  return found;
}

/** Resolve the direct child block under a viewport coordinate. */
export function getBlockAtCoords(
  editor: Editor,
  clientX: number,
  clientY: number,
): EditorBlockSnapshot | null {
  const coords = editor.view.posAtCoords({ left: clientX, top: clientY });
  if (!coords) return null;
  return getBlockAtPos(editor, coords.pos);
}

/**
 * Resolve the direct child block that owns a DOM node.
 *
 * Walks up the DOM tree until reaching a direct child of the editor's
 * content DOM. This is the robust path for hover detection because it
 * works for NodeView wrappers (callout, chart, database, table) where
 * `posAtCoords` can return `null` over non-editable internals.
 */
export function getBlockAtElement(
  editor: Editor,
  target: Node | null,
): EditorBlockSnapshot | null {
  if (!target) return null;
  const editorDom = editor.view.dom;
  let el: Node | null = target;
  while (el && el !== editorDom && el.parentNode !== editorDom) {
    el = el.parentNode;
  }
  if (!el || el === editorDom || !(el instanceof HTMLElement)) return null;
  try {
    const pos = editor.view.posAtDOM(el, 0);
    return getBlockAtPos(editor, pos);
  } catch {
    return null;
  }
}

/** DOM element rendered for a block, when ProseMirror can provide one. */
export function getBlockElement(editor: Editor, block: EditorBlockSnapshot): HTMLElement | null {
  const dom = editor.view.nodeDOM(block.pos);
  if (dom instanceof HTMLElement) return dom;
  if (dom instanceof Text) return dom.parentElement;
  return null;
}

/** Select the whole block without stealing focus away from the editor. */
export function selectBlock(editor: Editor, block: EditorBlockSnapshot): boolean {
  const { state, view } = editor;
  const tr = state.tr.setSelection(NodeSelection.create(state.doc, block.pos));
  view.dispatch(tr);
  view.focus();
  return true;
}

/** Insert a new empty paragraph immediately before the block and place the caret inside it. */
export function insertParagraphBeforeBlock(editor: Editor, block: EditorBlockSnapshot): boolean {
  const paragraph = editor.state.schema.nodes.paragraph?.create();
  if (!paragraph) return false;
  const insertPos = block.from;
  const tr = editor.state.tr.insert(insertPos, paragraph);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

/** Insert a new empty paragraph immediately after the block and place the caret inside it. */
export function insertParagraphAfterBlock(editor: Editor, block: EditorBlockSnapshot): boolean {
  const paragraph = editor.state.schema.nodes.paragraph?.create();
  if (!paragraph) return false;
  const insertPos = block.to;
  const tr = editor.state.tr.insert(insertPos, paragraph);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

/** Duplicate a block immediately below itself. */
export function duplicateBlock(editor: Editor, block: EditorBlockSnapshot): boolean {
  const copy = cloneForDuplicate(block.node);
  const tr = editor.state.tr.insert(block.to, copy);
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.focus();
  return true;
}

/** Delete a block, then put the caret near the deletion point. */
export function deleteBlock(editor: Editor, block: EditorBlockSnapshot): boolean {
  const { state, view } = editor;
  const paragraph = state.schema.nodes.paragraph?.create();
  const isOnlyBlock = listTopLevelBlocks(editor).length <= 1;
  const tr = isOnlyBlock && paragraph
    ? state.tr.replaceWith(block.from, block.to, paragraph)
    : state.tr.delete(block.from, block.to);
  const nextPos = Math.min(block.from, tr.doc.content.size);
  tr.setSelection(TextSelection.near(tr.doc.resolve(nextPos), -1));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

/** Move a block to a top-level insertion position. */
export function moveBlockTo(editor: Editor, block: EditorBlockSnapshot, targetPos: number): boolean {
  const { state, view } = editor;
  if (targetPos >= block.from && targetPos <= block.to) return false;
  const copy = block.node.copy(block.node.content);
  let insertPos = Math.max(0, Math.min(targetPos, state.doc.content.size));
  if (insertPos > block.from) insertPos -= block.node.nodeSize;
  const tr = state.tr.delete(block.from, block.to).insert(insertPos, copy);
  tr.setSelection(NodeSelection.create(tr.doc, insertPos));
  view.dispatch(tr.scrollIntoView());
  view.focus();
  return true;
}

/** Move a block one sibling up/down. */
export function moveBlockBy(
  editor: Editor,
  block: EditorBlockSnapshot,
  direction: -1 | 1,
): boolean {
  const blocks = listTopLevelBlocks(editor);
  const current = blocks.find(
    (candidate) => candidate.from === block.from && candidate.to === block.to,
  );
  if (!current) return false;
  const target = blocks[current.index + direction];
  if (!target) return false;
  return moveBlockTo(editor, current, direction < 0 ? target.from : target.to);
}

/** Convert simple text-like blocks through Tiptap's native command chain. */
export function turnBlockInto(
  editor: Editor,
  block: EditorBlockSnapshot,
  target: 'paragraph' | 'heading-1' | 'heading-2' | 'heading-3' | 'quote',
): boolean {
  const textPos = Math.min(block.from + 1, editor.state.doc.content.size);
  editor.chain().focus().setTextSelection(textPos).run();
  if (target === 'paragraph') return editor.chain().focus().setParagraph().run();
  if (target === 'heading-1') return editor.chain().focus().setNode('heading', { level: 1 }).run();
  if (target === 'heading-2') return editor.chain().focus().setNode('heading', { level: 2 }).run();
  if (target === 'heading-3') return editor.chain().focus().setNode('heading', { level: 3 }).run();
  return editor.chain().focus().toggleBlockquote().run();
}
