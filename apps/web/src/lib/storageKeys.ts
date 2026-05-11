/**
 * Single source of truth for every `localStorage` key used by the web app.
 *
 * Centralising these strings makes them grep-friendly, prevents typos that
 * would silently fork user state, and gives us a single place to bump
 * version suffixes when a stored payload's schema changes.
 *
 * The actual literal strings must NOT change without a migration plan —
 * doing so orphans existing user state.
 */
export const STORAGE_KEYS = {
  /** Sidebar open/closed flag. Value: `'1'` or `'0'`. */
  sidebarOpen: 'continuum:sidebar:open',
  /** Active theme mode. Value: `'light'` or `'dark'`. */
  theme: 'continuum:theme',
  /** Recently-viewed notes list. Value: JSON `RecentEntry[]`. */
  recentNotes: 'continuum.recentNotes.v1',
  /** Persisted graph filter sliders/toggles. Value: JSON `GraphFilters`. */
  graphFilters: 'continuum.graph.filters.v1',
  /** Set of pinned/highlighted node ids on the graph. Value: JSON `string[]`. */
  graphHighlights: 'continuum.graph.highlightedNoteIds.v1',
  /** Misc. graph view settings (mode, layout, hidden kinds…). Value: JSON object. */
  graphViewSettings: 'continuum.graph.viewSettings.v1',
} as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
