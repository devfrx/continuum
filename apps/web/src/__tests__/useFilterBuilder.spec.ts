import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { useFilterBuilder } from '@/composables/query/useFilterBuilder';
import {
  isFilterCondition,
  isFilterGroup,
  type FilterCondition,
  type FilterGroup,
} from '@continuum/shared';
import { withHost } from './helpers/withHost';

function mount<T>(factory: () => T): { value: T; unmount: () => void } {
  return withHost(factory);
}

describe('useFilterBuilder', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts with an empty root group when no storage key is provided', () => {
    const { value: api, unmount } = mount(() => useFilterBuilder());
    expect(api.root.value.type).toBe('group');
    expect(api.root.value.id).toBe('root');
    expect(api.root.value.combinator).toBe('and');
    expect(api.root.value.children).toEqual([]);
    expect(api.isEmpty.value).toBe(true);
    expect(api.conditionCount.value).toBe(0);
    unmount();
  });

  it('addCondition inserts a condition under root with supplied defaults and returns its id', () => {
    const { value: api, unmount } = mount(() => useFilterBuilder());
    const id = api.addCondition(undefined, {
      field: { kind: 'system', id: 'note.kind' },
      operator: 'eq',
      value: { kind: 'string', value: 'task' },
    });
    expect(id).toBeTypeOf('string');
    expect(api.root.value.children).toHaveLength(1);
    const child = api.root.value.children[0] as FilterCondition;
    expect(isFilterCondition(child)).toBe(true);
    expect(child.id).toBe(id);
    expect(child.field).toEqual({ kind: 'system', id: 'note.kind' });
    expect(child.operator).toBe('eq');
    expect(child.value).toEqual({ kind: 'string', value: 'task' });
    expect(api.conditionCount.value).toBe(1);
    expect(api.isEmpty.value).toBe(false);
    unmount();
  });

  it('addGroup creates a nested group; addCondition into that group lands inside it', () => {
    const { value: api, unmount } = mount(() => useFilterBuilder());
    const groupId = api.addGroup(undefined, 'or');
    expect(api.root.value.children).toHaveLength(1);
    const nested = api.root.value.children[0] as FilterGroup;
    expect(isFilterGroup(nested)).toBe(true);
    expect(nested.id).toBe(groupId);
    expect(nested.combinator).toBe('or');
    expect(nested.children).toEqual([]);

    const condId = api.addCondition(groupId);
    // Reread nested via the (possibly-new) reference on root
    const nested2 = api.root.value.children[0] as FilterGroup;
    expect(nested2.children).toHaveLength(1);
    const cond = nested2.children[0] as FilterCondition;
    expect(cond.id).toBe(condId);
    expect(api.root.value.children).toHaveLength(1); // root still has only the group
    expect(api.conditionCount.value).toBe(1);
    unmount();
  });

  it('updateCondition merges patch fields while preserving id and type', () => {
    const { value: api, unmount } = mount(() => useFilterBuilder());
    const id = api.addCondition();
    api.updateCondition(id, {
      operator: 'contains',
      value: { kind: 'string', value: 'todo' },
    });
    const cond = api.root.value.children[0] as FilterCondition;
    expect(cond.id).toBe(id);
    expect(cond.type).toBe('condition');
    expect(cond.operator).toBe('contains');
    expect(cond.value).toEqual({ kind: 'string', value: 'todo' });
    // Field untouched (still the default).
    expect(cond.field).toEqual({ kind: 'system', id: 'note.title' });
    unmount();
  });

  it('updateGroup flips the combinator of an existing group', () => {
    const { value: api, unmount } = mount(() => useFilterBuilder());
    const groupId = api.addGroup(undefined, 'and');
    api.updateGroup(groupId, { combinator: 'or' });
    const nested = api.root.value.children[0] as FilterGroup;
    expect(nested.combinator).toBe('or');
    unmount();
  });

  it('remove(id) deletes a leaf condition; remove(rootId) resets to empty', () => {
    const { value: api, unmount } = mount(() => useFilterBuilder());
    const a = api.addCondition();
    const b = api.addCondition();
    expect(api.conditionCount.value).toBe(2);

    api.remove(a);
    expect(api.conditionCount.value).toBe(1);
    expect((api.root.value.children[0] as FilterCondition).id).toBe(b);

    api.remove(api.root.value.id);
    expect(api.root.value.children).toEqual([]);
    expect(api.isEmpty.value).toBe(true);
    expect(api.root.value.id).toBe('root');
    unmount();
  });

  it('replace swaps the entire tree', () => {
    const { value: api, unmount } = mount(() => useFilterBuilder());
    api.addCondition();
    const next: FilterGroup = {
      type: 'group',
      id: 'r2',
      combinator: 'or',
      children: [
        {
          type: 'condition',
          id: 'c1',
          field: { kind: 'system', id: 'note.title' },
          operator: 'isNotEmpty',
          value: { kind: 'none' },
        },
      ],
    };
    api.replace(next);
    expect(api.root.value).toEqual(next);
    expect(api.conditionCount.value).toBe(1);
    unmount();
  });

  it('isEmpty and conditionCount track changes across mutations', () => {
    const { value: api, unmount } = mount(() => useFilterBuilder());
    expect(api.isEmpty.value).toBe(true);
    expect(api.conditionCount.value).toBe(0);

    const groupId = api.addGroup();
    // An empty nested group still counts as empty.
    expect(api.isEmpty.value).toBe(true);
    expect(api.conditionCount.value).toBe(0);

    api.addCondition(groupId);
    expect(api.isEmpty.value).toBe(false);
    expect(api.conditionCount.value).toBe(1);

    api.addCondition();
    expect(api.conditionCount.value).toBe(2);
    unmount();
  });

  it('persists to localStorage when storageKey is provided and restores on rebuild', async () => {
    const key = 'continuum.test.filterBuilder';
    const { value: a, unmount: unmountA } = mount(() =>
      useFilterBuilder({ storageKey: key }),
    );
    a.addCondition(undefined, {
      field: { kind: 'system', id: 'note.title' },
      operator: 'contains',
      value: { kind: 'string', value: 'hello' },
    });
    // Persistence runs through Vue's watch; flush microtasks first.
    await nextTick();
    const raw = localStorage.getItem(key);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.type).toBe('group');
    expect(parsed.children).toHaveLength(1);
    unmountA();

    const { value: b, unmount: unmountB } = mount(() =>
      useFilterBuilder({ storageKey: key }),
    );
    expect(b.conditionCount.value).toBe(1);
    const cond = b.root.value.children[0] as FilterCondition;
    expect(cond.operator).toBe('contains');
    expect(cond.value).toEqual({ kind: 'string', value: 'hello' });
    unmountB();
  });
});
