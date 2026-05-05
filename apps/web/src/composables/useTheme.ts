/**
 * Theme system for Continuum.
 *
 * Applies a persisted `light` / `dark` preference to the document root before
 * Vue mounts, then exposes a small reactive API for the sidebar toggle.
 */

import { computed, ref, watch, type ComputedRef, type Ref } from 'vue';

export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'continuum:theme';

const mode: Ref<ThemeMode> = ref(loadStoredMode());

function loadStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === 'light' || raw === 'dark' ? raw : 'dark';
}

function applyToDom(next: ThemeMode): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', next);
}

/** Apply the persisted theme before the app mounts. */
export function initTheme(): void {
  applyToDom(mode.value);
}

export interface ThemeHandle {
  /** Persisted theme mode. */
  mode: Ref<ThemeMode>;
  /** True when the active mode is dark. */
  isDark: ComputedRef<boolean>;
  /** Set and persist an explicit mode. */
  setMode: (next: ThemeMode) => void;
  /** Toggle between light and dark. */
  toggle: () => void;
}

/** Access the shared theme state used by app chrome. */
export function useTheme(): ThemeHandle {
  const isDark = computed<boolean>(() => mode.value === 'dark');

  function setMode(next: ThemeMode): void {
    mode.value = next;
  }

  function toggle(): void {
    mode.value = mode.value === 'dark' ? 'light' : 'dark';
  }

  return { mode, isDark, setMode, toggle };
}

watch(mode, (next) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, next);
  }
  applyToDom(next);
});