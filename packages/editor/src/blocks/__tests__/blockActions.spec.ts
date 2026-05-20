import type { Editor } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { describe, expect, it } from 'vitest';
import { getBlockAtElement, getBlockAtPos } from '../blockActions';

interface MockNodeInput {
  type: string;
  nodeSize: number;
}

type DocForEachCallback = (node: ProseMirrorNode, offset: number, index: number) => void;

function createMockNode(input: MockNodeInput): ProseMirrorNode {
  return {
    attrs: {},
    isBlock: true,
    nodeSize: input.nodeSize,
    type: { name: input.type },
  } as ProseMirrorNode;
}

function createMockEditor(inputs: MockNodeInput[]): Editor {
  const nodes = inputs.map(createMockNode);
  const contentSize = nodes.reduce((sum, node) => sum + node.nodeSize, 0);
  const doc = {
    content: { size: contentSize },
    forEach(callback: DocForEachCallback): void {
      let offset = 0;
      nodes.forEach((node, index) => {
        callback(node, offset, index);
        offset += node.nodeSize;
      });
    },
  };

  return { state: { doc } } as unknown as Editor;
}

describe('getBlockAtPos', () => {
  it('resolves top-level block starts to the block after the boundary', () => {
    const editor = createMockEditor([
      { type: 'database', nodeSize: 1 },
      { type: 'paragraph', nodeSize: 8 },
      { type: 'chart', nodeSize: 1 },
    ]);

    expect(getBlockAtPos(editor, 0)?.type).toBe('database');
    expect(getBlockAtPos(editor, 1)?.type).toBe('paragraph');
    expect(getBlockAtPos(editor, 9)?.type).toBe('chart');
  });

  it('still resolves the document end to the final block', () => {
    const editor = createMockEditor([
      { type: 'paragraph', nodeSize: 4 },
      { type: 'chart', nodeSize: 1 },
    ]);

    expect(getBlockAtPos(editor, 5)?.type).toBe('chart');
  });
});

describe('getBlockAtElement', () => {
  it('does not snap a sibling start back to the previous block', () => {
    const editorDom = document.createElement('div');
    const database = document.createElement('div');
    const paragraph = document.createElement('p');
    const text = document.createElement('span');
    paragraph.append(text);
    editorDom.append(database, paragraph);

    const editor = {
      ...createMockEditor([
        { type: 'database', nodeSize: 1 },
        { type: 'paragraph', nodeSize: 8 },
      ]),
      view: {
        dom: editorDom,
        posAtDOM(el: Node): number {
          return el === paragraph ? 1 : 0;
        },
      },
    } as unknown as Editor;

    expect(getBlockAtElement(editor, text)?.type).toBe('paragraph');
  });
});