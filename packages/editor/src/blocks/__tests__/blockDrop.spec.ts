import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';
import { getHoverBlockAtCoords } from '../blockDrop';

interface MockBlockInput {
  type: string;
  nodeSize: number;
  rect: DOMRect;
}

type DocForEachCallback = (node: ProseMirrorNode, offset: number, index: number) => void;

function domRect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    width,
    height,
    top,
    left,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  } as DOMRect;
}

function setRect(el: HTMLElement, value: DOMRect): void {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => value,
  });
}

function createMockEditor(blockInputs: MockBlockInput[]): Editor {
  const content = document.createElement('div');
  content.className = 'content';
  setRect(content, domRect(64, 48, 704, 520));

  const editorDom = document.createElement('div');
  setRect(editorDom, domRect(120, 48, 600, 520));
  content.append(editorDom);
  document.body.append(content);

  const elementsByPos = new Map<number, HTMLElement>();
  const blocks = blockInputs.map((input) => ({
    input,
    node: {
      attrs: {},
      isBlock: true,
      nodeSize: input.nodeSize,
      type: { name: input.type },
    } as ProseMirrorNode,
  }));

  let docSize = 0;
  for (const block of blocks) {
    const el = document.createElement('div');
    setRect(el, block.input.rect);
    elementsByPos.set(docSize, el);
    docSize += block.input.nodeSize;
  }

  const doc = {
    content: { size: docSize },
    forEach(callback: DocForEachCallback): void {
      let offset = 0;
      blocks.forEach((block, index) => {
        callback(block.node, offset, index);
        offset += block.input.nodeSize;
      });
    },
  };

  return {
    state: { doc },
    view: {
      dom: editorDom,
      nodeDOM(pos: number): Node | null {
        return elementsByPos.get(pos) ?? null;
      },
    },
  } as unknown as Editor;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('getHoverBlockAtCoords', () => {
  it('resolves a block when the pointer is in the left gutter row', () => {
    const editor = createMockEditor([
      { type: 'paragraph', nodeSize: 4, rect: domRect(120, 100, 600, 32) },
    ]);

    const block = getHoverBlockAtCoords(editor, 82, 116);

    expect(block?.from).toBe(0);
  });

  it('splits the vertical gap between adjacent blocks', () => {
    const editor = createMockEditor([
      { type: 'paragraph', nodeSize: 4, rect: domRect(120, 100, 600, 32) },
      { type: 'callout', nodeSize: 8, rect: domRect(120, 172, 600, 72) },
    ]);

    expect(getHoverBlockAtCoords(editor, 300, 151)?.from).toBe(0);
    expect(getHoverBlockAtCoords(editor, 300, 153)?.from).toBe(4);
  });

  it('ignores coordinates outside the visible editor host', () => {
    const editor = createMockEditor([
      { type: 'paragraph', nodeSize: 4, rect: domRect(120, 100, 600, 32) },
    ]);

    expect(getHoverBlockAtCoords(editor, 40, 116)).toBeNull();
    expect(getHoverBlockAtCoords(editor, 82, 590)).toBeNull();
  });
});