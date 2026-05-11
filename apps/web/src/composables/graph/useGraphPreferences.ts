/**
 * Persistent graph view preferences: view mode, layout mode, legend
 * open, hidden kinds and pinned (highlighted) node ids.
 *
 * Two `localStorage` keys back this state — both routed through
 * `STORAGE_KEYS` so there is exactly one source of truth for the
 * literal strings:
 *   - `graphViewSettings` — viewMode, layoutMode, legendOpen, hiddenKinds
 *   - `graphHighlights`   — pinned node id list
 *
 * The composable persists view-settings automatically via a watcher;
 * highlights are persisted explicitly because they are mutated as a
 * side effect of context-menu actions and graph reloads.
 */
import { reactive, ref, watch, type Ref } from 'vue';
import type { Graph } from '@continuum/graph';
import { STORAGE_KEYS } from '@/lib/storageKeys';

export type LayoutMode = 'force' | 'circular';
export type ViewMode = '3d' | '2d';

interface StoredGraphViewSettings {
  viewMode?: ViewMode;
  layoutMode?: LayoutMode;
  legendOpen?: boolean;
  hiddenKinds?: string[];
}

const VIEW_SETTINGS_KEY = STORAGE_KEYS.graphViewSettings;
const HIGHLIGHTS_KEY = STORAGE_KEYS.graphHighlights;

function isViewMode(v: unknown): v is ViewMode {
  return v === '3d' || v === '2d';
}

function isLayoutMode(v: unknown): v is LayoutMode {
  return v === 'force' || v === 'circular';
}

function readStoredViewSettings(): StoredGraphViewSettings {
  try {
    const raw = localStorage.getItem(VIEW_SETTINGS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const hiddenKindsValue = parsed.hiddenKinds;
    return {
      viewMode: isViewMode(parsed.viewMode) ? parsed.viewMode : undefined,
      layoutMode: isLayoutMode(parsed.layoutMode) ? parsed.layoutMode : undefined,
      legendOpen: typeof parsed.legendOpen === 'boolean' ? parsed.legendOpen : undefined,
      hiddenKinds: Array.isArray(hiddenKindsValue)
        ? hiddenKindsValue.filter((k): k is string => typeof k === 'string' && k.length > 0)
        : undefined,
    };
  } catch {
    return {};
  }
}

function readStoredHighlights(): Set<string> {
  try {
    const raw = localStorage.getItem(HIGHLIGHTS_KEY);
    if (!raw) return new Set<string>();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set<string>();
    return new Set<string>(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set<string>();
  }
}

function writeHighlights(ids: Set<string>): void {
  try {
    localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify([...ids].sort()));
  } catch {
    // Restrictive WebViews — graph still works in memory.
  }
}

export interface UseGraphPreferencesReturn {
  viewMode: Ref<ViewMode>;
  layoutMode: Ref<LayoutMode>;
  legendOpen: Ref<boolean>;
  /** Reactive Set; mutate via `.add` / `.delete`. Persistence is automatic. */
  hiddenKinds: Set<string>;
  highlightedIds: Ref<Set<string>>;
  /** Persist `graphViewSettings` immediately (call after direct hiddenKinds mutation). */
  saveViewSettings(): void;
  /** Persist current highlightedIds to localStorage. */
  saveHighlights(): void;
  /** Drop kinds no longer present in the registry; persists if changed. */
  pruneHiddenKinds(knownKinds: Iterable<string>): void;
  /** Mark every persisted highlighted id on the graph; returns the surviving set. */
  applyStoredHighlights(graph: Graph, stored: Set<string>): Set<string>;
  /** Re-read the persisted highlight ids from storage. */
  loadHighlights(): Set<string>;
}

export function useGraphPreferences(): UseGraphPreferencesReturn {
  const stored = readStoredViewSettings();
  const viewMode = ref<ViewMode>(stored.viewMode ?? '3d');
  const layoutMode = ref<LayoutMode>(stored.layoutMode ?? 'force');
  const legendOpen = ref<boolean>(stored.legendOpen ?? false);
  const hiddenKinds = reactive(new Set<string>(stored.hiddenKinds ?? []));
  const highlightedIds = ref<Set<string>>(new Set<string>());

  function saveViewSettings(): void {
    try {
      localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify({
        viewMode: viewMode.value,
        layoutMode: layoutMode.value,
        legendOpen: legendOpen.value,
        hiddenKinds: [...hiddenKinds].sort(),
      }));
    } catch {
      // Graph stays usable when localStorage is unavailable.
    }
  }

  function saveHighlights(): void {
    writeHighlights(highlightedIds.value);
  }

  function pruneHiddenKinds(knownKinds: Iterable<string>): void {
    const known = new Set(knownKinds);
    let changed = false;
    for (const k of [...hiddenKinds]) {
      if (known.has(k)) continue;
      hiddenKinds.delete(k);
      changed = true;
    }
    if (changed) saveViewSettings();
  }

  function loadHighlights(): Set<string> {
    return readStoredHighlights();
  }

  function applyStoredHighlights(graph: Graph, stored: Set<string>): Set<string> {
    const active = new Set<string>();
    graph.forEachNode((id) => {
      if (!stored.has(id)) return;
      graph.setNodeAttribute(id, 'userHighlight', true);
      active.add(id);
    });
    if (active.size !== stored.size) writeHighlights(active);
    highlightedIds.value = active;
    return active;
  }

  // Persist whenever any of the four bits of view-settings change. The
  // hiddenKinds Set is stringified into a stable token so the watcher
  // fires only on real membership changes (insertion order ignored).
  watch(
    [viewMode, layoutMode, legendOpen, () => [...hiddenKinds].sort().join('\u0000')],
    saveViewSettings,
  );

  return {
    viewMode,
    layoutMode,
    legendOpen,
    hiddenKinds,
    highlightedIds,
    saveViewSettings,
    saveHighlights,
    pruneHiddenKinds,
    applyStoredHighlights,
    loadHighlights,
  };
}
