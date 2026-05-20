import { Editor, type JSONContent } from '@tiptap/core';
import TaskItem from '@tiptap/extension-task-item';
import TaskList from '@tiptap/extension-task-list';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { afterEach, describe, expect, it } from 'vitest';
import { Callout } from '../../nodes/Callout';
import { Details, DetailsContent, DetailsSummary } from '../../nodes/Details';
import { Tabs, TabPanel } from '../../nodes/Tabs';
import { listTopLevelBlocks, type EditorBlockSnapshot } from '../blockActions';
import {
  getTurnIntoTargetsForBlock,
  getTurnIntoTargetsForSource,
  getTurnIntoSourceTypeAtSelection,
  isTurnIntoTargetActiveForBlock,
  runTurnIntoTarget,
  runTurnIntoTargetForBlock,
  TURN_INTO_TARGETS_BY_SOURCE,
} from '../blockTransforms';

const editors: Editor[] = [];

function blockSnapshot(type: string, attrs: Record<string, unknown> = {}): EditorBlockSnapshot {
  return {
    pos: 0,
    from: 0,
    to: 1,
    index: 0,
    siblingIndex: 0,
    depth: 0,
    parentPos: null,
    parentType: 'doc',
    node: { attrs, type: { name: type } } as ProseMirrorNode,
    type,
    label: type,
    icon: type,
  };
}

function doc(content: JSONContent[]): JSONContent {
  return { type: 'doc', content };
}

function paragraph(text = ''): JSONContent {
  return text
    ? { type: 'paragraph', content: [{ type: 'text', text }] }
    : { type: 'paragraph' };
}

function bulletListItem(text: string): JSONContent {
  return {
    type: 'bulletList',
    content: [
      {
        type: 'listItem',
        content: [paragraph(text)],
      },
    ],
  };
}

function createTestEditor(content: JSONContent): Editor {
  const element = document.createElement('div');
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Callout,
      Details,
      DetailsSummary,
      DetailsContent,
      Tabs,
      TabPanel,
    ],
    content,
  });
  editors.push(editor);
  return editor;
}

function firstBlock(editor: Editor): EditorBlockSnapshot {
  const block = listTopLevelBlocks(editor)[0];
  expect(block).toBeDefined();
  return block!;
}

function firstJsonBlock(editor: Editor): JSONContent {
  const block = editor.getJSON().content?.[0];
  expect(block).toBeDefined();
  return block!;
}

function setSelectionInsideFirstText(editor: Editor): void {
  let textPos: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (textPos !== null || !node.isText) return true;
    textPos = pos;
    return false;
  });
  editor.commands.setTextSelection(textPos ?? 1);
}

afterEach(() => {
  while (editors.length > 0) {
    editors.pop()?.destroy();
  }
  document.body.replaceChildren();
});

describe('TURN_INTO_TARGETS_BY_SOURCE', () => {
  it('does not offer destructive shape changes for atomic data blocks', () => {
    expect(getTurnIntoTargetsForSource('database')).toEqual([]);
    expect(getTurnIntoTargetsForSource('chart')).toEqual([]);
  });

  it('keeps text-flow block transforms in one central map', () => {
    const targetIds = getTurnIntoTargetsForSource('paragraph').map((target) => target.id);

    expect(targetIds).toContain('heading-1');
    expect(targetIds).toContain('bulletList');
    expect(targetIds).toContain('callout');
    expect(TURN_INTO_TARGETS_BY_SOURCE.heading).toBe(TURN_INTO_TARGETS_BY_SOURCE.paragraph);
  });

  it('allows container blocks to leave their shape through the same registry', () => {
    expect(getTurnIntoTargetsForSource('callout').map((target) => target.id))
      .toContain('paragraph');
    expect(getTurnIntoTargetsForSource('details').map((target) => target.id))
      .toContain('taskList');
  });
});

describe('getTurnIntoTargetsForBlock', () => {
  it('reads allowed targets from a block snapshot type', () => {
    expect(getTurnIntoTargetsForBlock(blockSnapshot('database'))).toHaveLength(0);
    expect(getTurnIntoTargetsForBlock(blockSnapshot('heading')).map((target) => target.id))
      .toContain('paragraph');
  });
});

describe('listTopLevelBlocks', () => {
  it('includes direct blocks inside tab panels as movable editor blocks', () => {
    const editor = createTestEditor(doc([
      {
        type: 'tabs',
        attrs: { activeTabId: 'one' },
        content: [
          { type: 'tabPanel', attrs: { id: 'one', title: 'One' }, content: [paragraph('inside')] },
          { type: 'tabPanel', attrs: { id: 'two', title: 'Two' }, content: [paragraph('other')] },
        ],
      },
    ]));

    const blocks = listTopLevelBlocks(editor);

    expect(blocks.map((block) => block.type)).toEqual(['tabs', 'paragraph', 'paragraph']);
    expect(blocks[1]).toMatchObject({ parentType: 'tabPanel', depth: 1, siblingIndex: 0 });
  });
});

describe('isTurnIntoTargetActiveForBlock', () => {
  it('detects heading levels from the block attrs', () => {
    const heading = blockSnapshot('heading', { level: 2 });

    expect(isTurnIntoTargetActiveForBlock(heading, 'heading-2')).toBe(true);
    expect(isTurnIntoTargetActiveForBlock(heading, 'heading-1')).toBe(false);
  });
});

describe('runTurnIntoTargetForBlock', () => {
  it('turns a top-level list into text instead of the nested list item paragraph', () => {
    const editor = createTestEditor(doc([bulletListItem('ciao')]));

    expect(runTurnIntoTargetForBlock(editor, firstBlock(editor), 'paragraph')).toBe(true);

    expect(editor.getJSON().content).toMatchObject([
      { type: 'paragraph', content: [{ type: 'text', text: 'ciao' }] },
    ]);
  });

  it('turns a list into a callout with the item text inside the container', () => {
    const editor = createTestEditor(doc([bulletListItem('ciao')]));

    expect(runTurnIntoTargetForBlock(editor, firstBlock(editor), 'callout')).toBe(true);

    expect(firstJsonBlock(editor)).toMatchObject({
      type: 'callout',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'ciao' }] }],
    });
  });

  it('turns a list into a toggle using the item text as the summary', () => {
    const editor = createTestEditor(doc([bulletListItem('ciao')]));

    expect(runTurnIntoTargetForBlock(editor, firstBlock(editor), 'details')).toBe(true);

    expect(firstJsonBlock(editor)).toMatchObject({
      type: 'details',
      content: [
        { type: 'detailsSummary', content: [{ type: 'text', text: 'ciao' }] },
        { type: 'detailsContent', content: [{ type: 'paragraph' }] },
      ],
    });
  });

  it('lets an empty container become any text-flow target', () => {
    const editor = createTestEditor(doc([
      { type: 'callout', attrs: { icon: 'name:info' }, content: [paragraph()] },
    ]));
    const block = firstBlock(editor);

    expect(getTurnIntoTargetsForBlock(block).map((target) => target.id)).toContain('bulletList');
    expect(runTurnIntoTargetForBlock(editor, block, 'bulletList')).toBe(true);

    expect(firstJsonBlock(editor)).toMatchObject({
      type: 'bulletList',
      content: [{ type: 'listItem', content: [{ type: 'paragraph' }] }],
    });
  });
});

describe('runTurnIntoTarget', () => {
  it('uses the selected top-level block as the context-menu source', () => {
    const editor = createTestEditor(doc([bulletListItem('ciao')]));
    setSelectionInsideFirstText(editor);

    expect(getTurnIntoSourceTypeAtSelection(editor)).toBe('bulletList');
    expect(runTurnIntoTarget(editor, 'paragraph')).toBe(true);

    expect(editor.getJSON().content).toMatchObject([
      { type: 'paragraph', content: [{ type: 'text', text: 'ciao' }] },
    ]);
  });
});