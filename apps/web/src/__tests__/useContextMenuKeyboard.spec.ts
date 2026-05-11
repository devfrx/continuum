import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  useContextMenuKeyboard,
  visibleItemsAt,
  type KeyboardMenuItem,
} from '@/composables/useContextMenuKeyboard';
import { withHost } from './helpers/withHost';

interface Item extends KeyboardMenuItem {
  children?: Item[];
}

function dispatchKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }));
}

describe('visibleItemsAt', () => {
  it('returns root items at level 0', () => {
    const items: Item[] = [{ id: 'a' }, { id: 'b' }];
    expect(visibleItemsAt(items, [], 0)).toBe(items);
  });

  it('walks openPath to a nested level', () => {
    const items: Item[] = [
      { id: 'root', children: [{ id: 'child', children: [{ id: 'leaf' }] }] },
    ];
    expect(visibleItemsAt(items, ['root', 'child'], 2)).toEqual([{ id: 'leaf' }]);
  });

  it('returns [] when openPath does not resolve', () => {
    const items: Item[] = [{ id: 'a' }];
    expect(visibleItemsAt(items, ['missing'], 1)).toEqual([]);
  });
});

describe('useContextMenuKeyboard', () => {
  function setup(initial: { items: Item[]; focus?: number[]; path?: string[] }) {
    const open = ref(true);
    const items = ref<Item[]>(initial.items);
    const openPath = ref<string[]>(initial.path ?? []);
    const focusIndex = ref<number[]>(initial.focus ?? [0]);
    const onActivate = vi.fn<(item: Item) => void>();
    const onClose = vi.fn<() => void>();
    const { unmount } = withHost(() =>
      useContextMenuKeyboard<Item>({ open, items, openPath, focusIndex, onActivate, onClose }),
    );
    return { open, items, openPath, focusIndex, onActivate, onClose, dispose: unmount };
  }

  it('ArrowDown moves focus and skips disabled/header/divider', () => {
    const ctx = setup({
      items: [
        { id: 'a' },
        { id: 'h', header: true },
        { id: 'd', disabled: true },
        { id: 'b' },
      ],
    });
    dispatchKey('ArrowDown');
    expect(ctx.focusIndex.value[0]).toBe(3);
    ctx.dispose();
  });

  it('ArrowUp wraps to last enabled item', () => {
    const ctx = setup({ items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] });
    dispatchKey('ArrowUp');
    expect(ctx.focusIndex.value[0]).toBe(2);
    ctx.dispose();
  });

  it('Enter on a leaf invokes onActivate', () => {
    const ctx = setup({ items: [{ id: 'a' }, { id: 'b' }], focus: [1] });
    dispatchKey('Enter');
    expect(ctx.onActivate).toHaveBeenCalledWith(expect.objectContaining({ id: 'b' }));
    ctx.dispose();
  });

  it('ArrowRight on a parent opens a submenu and focuses index 0', () => {
    const ctx = setup({
      items: [{ id: 'p', children: [{ id: 'c1' }, { id: 'c2' }] }],
    });
    dispatchKey('ArrowRight');
    expect(ctx.openPath.value).toEqual(['p']);
    expect(ctx.focusIndex.value[1]).toBe(0);
    ctx.dispose();
  });

  it('ArrowLeft closes one submenu level', () => {
    const ctx = setup({
      items: [{ id: 'p', children: [{ id: 'c1' }] }],
      path: ['p'],
      focus: [0, 0],
    });
    dispatchKey('ArrowLeft');
    expect(ctx.openPath.value).toEqual([]);
    ctx.dispose();
  });

  it('Escape at root invokes onClose', () => {
    const ctx = setup({ items: [{ id: 'a' }] });
    dispatchKey('Escape');
    expect(ctx.onClose).toHaveBeenCalledOnce();
    ctx.dispose();
  });

  it('does not handle keys when closed', () => {
    const ctx = setup({ items: [{ id: 'a' }, { id: 'b' }] });
    ctx.open.value = false;
    dispatchKey('ArrowDown');
    expect(ctx.focusIndex.value[0]).toBe(0);
    ctx.dispose();
  });
});
