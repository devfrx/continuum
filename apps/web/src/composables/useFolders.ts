/**
 * useFolders — module-level reactive store for the folder tree.
 *
 * Mirrors the pattern of `useKinds`: a single shared `ref` lives at module
 * scope so every component that calls `useFolders()` sees the same state
 * without prop drilling or a Pinia store.
 *
 * Responsibilities
 * ────────────────
 *   • Fetch & cache the tree returned by `GET /api/folders`.
 *   • Lookup helpers: `byId`, `childrenOf`, `breadcrumb`, `pathSlugs`.
 *   • Inheritance helpers (Modality B): `effectiveFor` walks up the tree
 *     to resolve the nearest non-null `defaultKind` / `icon` / `color`.
 *
 * Mutating commands (create/update/move/remove) live in
 * `./foldersApi` so consumers can import them as plain async functions
 * and so this composable stays focused on read-only state.
 *
 * The flat list is rebuilt from the tree on every refresh so callers can
 * iterate without recursion when convenient (`flat`).
 */

import { ref, computed, type ComputedRef, type Ref } from 'vue';
import { api } from '@/api';
import type { FolderEffective, FolderNode } from '@continuum/shared';
import { ROOT_FALLBACK } from '@continuum/shared';

// Re-exported so existing `import { ROOT_FALLBACK } from '@/composables/useFolders'`
// callers keep working while the canonical definition lives in `@continuum/shared`.
export { ROOT_FALLBACK };

const tree = ref<FolderNode[]>([]);
const loaded = ref(false);
const loading = ref(false);

/** Walk a forest and yield every node depth-first. */
function* walk(nodes: FolderNode[]): Generator<FolderNode> {
  for (const n of nodes) {
    yield n;
    yield* walk(n.children);
  }
}

/** Map every node id → node, plus every node id → its parent (or null). */
function indexTree(nodes: FolderNode[]): {
  byId: Map<string, FolderNode>;
  parentOf: Map<string, FolderNode | null>;
} {
  const byId = new Map<string, FolderNode>();
  const parentOf = new Map<string, FolderNode | null>();
  const visit = (node: FolderNode, parent: FolderNode | null): void => {
    byId.set(node.id, node);
    parentOf.set(node.id, parent);
    for (const c of node.children) visit(c, node);
  };
  for (const root of nodes) visit(root, null);
  return { byId, parentOf };
}

export interface UseFoldersReturn {
  tree: Ref<FolderNode[]>;
  flat: ComputedRef<FolderNode[]>;
  loaded: Ref<boolean>;
  loading: Ref<boolean>;
  load: (force?: boolean) => Promise<void>;
  refresh: () => Promise<void>;
  byId: (id: string | null | undefined) => FolderNode | null;
  childrenOf: (parentId: string | null) => FolderNode[];
  breadcrumb: (id: string | null | undefined) => FolderNode[];
  pathSlugs: (id: string | null | undefined) => string[];
  effectiveFor: (id: string | null | undefined) => FolderEffective;
}

/**
 * Singleton folder store. The first caller triggers a `load()`; subsequent
 * callers reuse the cached forest until `refresh()` (or `load(true)`) is
 * invoked.
 */
export function useFolders(): UseFoldersReturn {
  async function load(force = false): Promise<void> {
    if (loaded.value && !force) return;
    loading.value = true;
    try {
      tree.value = await api.folders.tree();
      loaded.value = true;
    } finally {
      loading.value = false;
    }
  }

  /** Force a re-fetch even if already loaded. */
  function refresh(): Promise<void> {
    return load(true);
  }

  const flat = computed<FolderNode[]>(() => Array.from(walk(tree.value)));

  function byId(id: string | null | undefined): FolderNode | null {
    if (!id) return null;
    return indexTree(tree.value).byId.get(id) ?? null;
  }

  function childrenOf(parentId: string | null): FolderNode[] {
    if (parentId === null) return tree.value;
    return byId(parentId)?.children ?? [];
  }

  /** Path from root → leaf for the given folder. Empty array when not found. */
  function breadcrumb(id: string | null | undefined): FolderNode[] {
    if (!id) return [];
    const { byId: idx, parentOf } = indexTree(tree.value);
    const node = idx.get(id);
    if (!node) return [];
    const path: FolderNode[] = [];
    let cursor: FolderNode | null = node;
    let depth = 0;
    while (cursor && depth < 64) {
      path.unshift(cursor);
      cursor = parentOf.get(cursor.id) ?? null;
      depth += 1;
    }
    return path;
  }

  function pathSlugs(id: string | null | undefined): string[] {
    return breadcrumb(id).map((n) => n.slug);
  }

  /**
   * Resolve effective inherited values by walking ancestors. Returns the
   * project-wide fallback ({@link ROOT_FALLBACK}) when no ancestor sets a
   * given field.
   */
  function effectiveFor(id: string | null | undefined): FolderEffective {
    if (!id) return ROOT_FALLBACK;
    const path = breadcrumb(id);
    if (path.length === 0) return ROOT_FALLBACK;
    let kind: string | null = null;
    let icon: string | null = null;
    let color: string | null = null;
    // Walk leaf → root so the nearest ancestor wins for each field.
    for (let i = path.length - 1; i >= 0; i -= 1) {
      const f = path[i];
      if (kind === null && f.defaultKind) kind = f.defaultKind;
      if (icon === null && f.icon) icon = f.icon;
      if (color === null && f.color) color = f.color;
      if (kind !== null && icon !== null && color !== null) break;
    }
    return {
      defaultKind: kind ?? ROOT_FALLBACK.defaultKind,
      icon: icon ?? ROOT_FALLBACK.icon,
      color: color ?? ROOT_FALLBACK.color,
    };
  }

  return {
    tree,
    flat,
    loaded,
    loading,
    load,
    refresh,
    byId,
    childrenOf,
    breadcrumb,
    pathSlugs,
    effectiveFor,
  };
}

