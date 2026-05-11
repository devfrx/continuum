import { describe, expect, it, vi } from 'vitest';
import { useTypeahead } from '@/composables/useTypeahead';
import { withHost } from './helpers/withHost';

interface Item {
  name: string;
}

function makeKey(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', { key });
}

function mountTypeahead(opts: Parameters<typeof useTypeahead<Item>>[0]) {
  const { value, unmount } = withHost(() => useTypeahead<Item>(opts));
  return { result: value, dispose: unmount };
}

describe('useTypeahead', () => {
  const items: Item[] = [
    { name: 'Apple' },
    { name: 'Banana' },
    { name: 'Blueberry' },
    { name: 'Cherry' },
  ];

  it('matches the first item by single keystroke from index 0', () => {
    const onMatch = vi.fn<(idx: number) => void>();
    const { result, dispose } = mountTypeahead({
      items: () => items,
      getLabel: (i) => i.name,
      onMatch,
    });
    result.handleKey(makeKey('b'));
    expect(onMatch).toHaveBeenCalledWith(1);
    dispose();
  });

  it('accumulates buffer to disambiguate items sharing a prefix', () => {
    vi.useFakeTimers();
    const onMatch = vi.fn<(idx: number) => void>();
    const { result, dispose } = mountTypeahead({
      items: () => items,
      getLabel: (i) => i.name,
      onMatch,
    });
    result.handleKey(makeKey('b'));
    result.handleKey(makeKey('l'));
    expect(onMatch).toHaveBeenLastCalledWith(2); // Blueberry
    dispose();
    vi.useRealTimers();
  });

  it('wraps when startFrom is past matching index', () => {
    const onMatch = vi.fn<(idx: number) => void>();
    const { result, dispose } = mountTypeahead({
      items: () => items,
      getLabel: (i) => i.name,
      startFrom: () => 3,
      onMatch,
    });
    result.handleKey(makeKey('a'));
    expect(onMatch).toHaveBeenCalledWith(0);
    dispose();
  });

  it('resets buffer after idle timeout', () => {
    vi.useFakeTimers();
    const onMatch = vi.fn<(idx: number) => void>();
    const { result, dispose } = mountTypeahead({
      items: () => items,
      getLabel: (i) => i.name,
      onMatch,
      idleMs: 100,
    });
    result.handleKey(makeKey('b'));
    vi.advanceTimersByTime(150);
    result.handleKey(makeKey('c'));
    expect(onMatch).toHaveBeenLastCalledWith(3); // Cherry, not Blueberry
    dispose();
    vi.useRealTimers();
  });

  it('ignores modified keys and non-printable keys', () => {
    const onMatch = vi.fn<(idx: number) => void>();
    const { result, dispose } = mountTypeahead({
      items: () => items,
      getLabel: (i) => i.name,
      onMatch,
    });
    result.handleKey(new KeyboardEvent('keydown', { key: 'b', ctrlKey: true }));
    result.handleKey(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(onMatch).not.toHaveBeenCalled();
    dispose();
  });
});
