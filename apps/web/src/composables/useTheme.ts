/**
 * Theme system — light / dark / system, with persistence.
 *
 * `initTheme()` applies the saved preference (or system default) to the
 * <html> element before Vue mounts so there's no flash of wrong colors.
 *
 * `useTheme()` is the reactive Vue composable used by components such as
 * the theme toggle in the sidebar.
 *
 * Storage key: `continuum:theme` — value is one of `'light' | 'dark' | 'system'`.
 */

import { ref, computed, watch, type Ref, type ComputedRef } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'continuum:theme';
const DARK_MQ = '(prefers-color-scheme: dark)';

const mode: Ref<ThemeMode> = ref<ThemeMode>(loadStoredMode());

function loadStoredMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(DARK_MQ).matches;
}

function applyToDom(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', resolved);
}

function resolve(m: ThemeMode): ResolvedTheme {
  if (m === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return m;
}

/**
 * Bootstrap — call once before app mount.
 * Also wires a listener so 'system' mode reacts to OS theme changes.
 */
export function initTheme(): void {
  applyToDom(resolve(mode.value));

  if (typeof window !== 'undefined' && window.matchMedia) {
    const mq = window.matchMedia(DARK_MQ);
    const handler = (): void => {
      if (mode.value === 'system') applyToDom(resolve('system'));
    };
    mq.addEventListener?.('change', handler);
  }
}

interface UseThemeReturn {
  mode: Ref<ThemeMode>;
  resolved: ComputedRef<ResolvedTheme>;
  isDark: ComputedRef<boolean>;
  setMode: (next: ThemeMode) => void;
  toggle: () => void;
}

export function useTheme(): UseThemeReturn {
  const resolved = computed<ResolvedTheme>(() => resolve(mode.value));
  const isDark = computed<boolean>(() => resolved.value === 'dark');

  function setMode(next: ThemeMode): void {
    mode.value = next;
  }

  function toggle(): void {
    // Cycle through the most useful binary: dark ↔ light.
    // 'system' is set explicitly via the picker.
    mode.value = resolved.value === 'dark' ? 'light' : 'dark';
  }

  return { mode, resolved, isDark, setMode, toggle };
}

// Persist + apply on every change.
watch(mode, (m) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, m);
  }
  applyToDom(resolve(m));
});
