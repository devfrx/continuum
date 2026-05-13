/**
 * Filter-tree builder composable.
 *
 * Pure (no I/O) reactive helper that wraps a `FilterNode` tree and exposes
 * structural editors used by the property-query filter UI. Each instance is
 * standalone — callers create one per filter surface (e.g. one for the graph
 * data query, another for a saved-view editor) so the tree state never bleeds
 * across UIs.
 *
 * Persistence is opt-in: pass `storageKey` to mirror the tree into
 * `localStorage` after every edit. Restore is automatic on construction; a
 * malformed payload falls back to a fresh empty group.
 */
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';
import type {
  FilterCondition,
  FilterGroup,
  FilterNode,
} from '@continuum/shared';
import { isFilterCondition, isFilterGroup } from '@continuum/shared';

export interface UseFilterBuilderOptions {
  /** Optional initial root group; defaults to a fresh group with `combinator:'and'`. */
  initial?: FilterNode;
  /** Persistence: when provided, debounced JSON.stringify into this localStorage key. */
  storageKey?: string;
}

export interface UseFilterBuilderReturn {
  root: Ref<FilterGroup>;
  isEmpty: ComputedRef<boolean>;
  conditionCount: ComputedRef<number>;
  /** Add a condition under the supplied group id (or root). Returns the new condition id. */
  addCondition: (
    parentGroupId?: string,
    init?: Partial<Omit<FilterCondition, 'type' | 'id'>>,
  ) => string;
  /** Add a nested group under the supplied parent group. */
  addGroup: (parentGroupId?: string, combinator?: 'and' | 'or') => string;
  /** Update an existing condition by id (shallow merge). */
  updateCondition: (
    id: string,
    patch: Partial<Omit<FilterCondition, 'type' | 'id'>>,
  ) => void;
  /** Update a group's combinator. */
  updateGroup: (id: string, patch: Partial<Pick<FilterGroup, 'combinator'>>) => void;
  /** Remove a node (condition OR group) by id. Removing root resets it. */
  remove: (id: string) => void;
  /** Replace the entire tree (e.g. when loading a saved view). */
  replace: (next: FilterNode) => void;
  /** Reset to an empty root group. */
  reset: () => void;
}

/** Random uuid wrapper that tolerates older browser environments in tests. */
function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: not cryptographically strong but unique within a session.
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function emptyRoot(): FilterGroup {
  return { type: 'group', id: 'root', combinator: 'and', children: [] };
}

/**
 * Coerce an unknown payload into a `FilterGroup`. Returns `null` when the
 * shape is unrecognisable so the caller can fall back to a fresh root.
 */
export function coerceFilterRoot(value: unknown): FilterGroup | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<FilterGroup>;
  if (v.type !== 'group' || !Array.isArray(v.children)) return null;
  return value as FilterGroup;
}

function readStored(storageKey: string | undefined): FilterGroup | null {
  if (!storageKey) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    return coerceFilterRoot(JSON.parse(raw));
  } catch {
    return null;
  }
}

function persist(storageKey: string | undefined, value: FilterGroup): void {
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Restrictive WebViews — keep editing in-memory only.
  }
}

/**
 * Recursively visit every node, returning the first `FilterGroup` whose id
 * matches. Returns `null` when no match exists.
 */
function findGroup(node: FilterNode, id: string): FilterGroup | null {
  if (isFilterGroup(node)) {
    if (node.id === id) return node;
    for (const child of node.children) {
      const hit = findGroup(child, id);
      if (hit) return hit;
    }
  }
  return null;
}

function findParentOf(node: FilterNode, targetId: string): FilterGroup | null {
  if (!isFilterGroup(node)) return null;
  for (const child of node.children) {
    if (child.id === targetId) return node;
    const deeper = findParentOf(child, targetId);
    if (deeper) return deeper;
  }
  return null;
}

function findCondition(node: FilterNode, id: string): FilterCondition | null {
  if (isFilterCondition(node)) return node.id === id ? node : null;
  for (const child of node.children) {
    const hit = findCondition(child, id);
    if (hit) return hit;
  }
  return null;
}

function countConditions(node: FilterNode): number {
  if (isFilterCondition(node)) return 1;
  let total = 0;
  for (const child of node.children) total += countConditions(child);
  return total;
}

export function useFilterBuilder(
  options: UseFilterBuilderOptions = {},
): UseFilterBuilderReturn {
  const stored = readStored(options.storageKey);
  const seed = stored ?? coerceFilterRoot(options.initial) ?? emptyRoot();
  const root = ref<FilterGroup>(seed);

  const isEmpty = computed(() => countConditions(root.value) === 0);
  const conditionCount = computed(() => countConditions(root.value));

  // Persist on any deep change.
  if (options.storageKey) {
    watch(root, (next) => persist(options.storageKey, next), { deep: true });
  }

  function bumpRoot(): void {
    // Trigger reactivity on deeply mutated trees by reassigning the ref.
    root.value = { ...root.value, children: [...root.value.children] };
  }

  function resolveParent(parentGroupId?: string): FilterGroup {
    if (!parentGroupId || parentGroupId === root.value.id) return root.value;
    return findGroup(root.value, parentGroupId) ?? root.value;
  }

  function addCondition(
    parentGroupId?: string,
    init?: Partial<Omit<FilterCondition, 'type' | 'id'>>,
  ): string {
    const parent = resolveParent(parentGroupId);
    const id = newId();
    const condition: FilterCondition = {
      type: 'condition',
      id,
      // Sensible defaults so the UI can mount the picker immediately even
      // before the user picks a real field. Callers nearly always patch
      // these via `updateCondition` straight after.
      field: init?.field ?? { kind: 'system', id: 'note.title' },
      operator: init?.operator ?? 'isNotEmpty',
      value: init?.value ?? { kind: 'none' },
    };
    parent.children = [...parent.children, condition];
    bumpRoot();
    return id;
  }

  function addGroup(parentGroupId?: string, combinator: 'and' | 'or' = 'and'): string {
    const parent = resolveParent(parentGroupId);
    const id = newId();
    const group: FilterGroup = {
      type: 'group',
      id,
      combinator,
      children: [],
    };
    parent.children = [...parent.children, group];
    bumpRoot();
    return id;
  }

  function updateCondition(
    id: string,
    patch: Partial<Omit<FilterCondition, 'type' | 'id'>>,
  ): void {
    const target = findCondition(root.value, id);
    if (!target) return;
    if (patch.field !== undefined) target.field = patch.field;
    if (patch.operator !== undefined) target.operator = patch.operator;
    if (patch.value !== undefined) target.value = patch.value;
    bumpRoot();
  }

  function updateGroup(id: string, patch: Partial<Pick<FilterGroup, 'combinator'>>): void {
    const target = findGroup(root.value, id);
    if (!target) return;
    if (patch.combinator !== undefined) target.combinator = patch.combinator;
    bumpRoot();
  }

  function remove(id: string): void {
    if (id === root.value.id) {
      reset();
      return;
    }
    const parent = findParentOf(root.value, id);
    if (!parent) return;
    parent.children = parent.children.filter((child) => child.id !== id);
    bumpRoot();
  }

  function replace(next: FilterNode): void {
    if (isFilterGroup(next)) {
      root.value = next;
      return;
    }
    // Wrap a stray condition in a fresh root group so the tree invariant
    // ("root is always a group") is preserved.
    root.value = { type: 'group', id: 'root', combinator: 'and', children: [next] };
  }

  function reset(): void {
    root.value = emptyRoot();
  }

  return {
    root,
    isEmpty,
    conditionCount,
    addCondition,
    addGroup,
    updateCondition,
    updateGroup,
    remove,
    replace,
    reset,
  };
}
