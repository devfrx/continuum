/**
 * Sidebar open/close state.
 *
 * The Continuum shell sidebar is a *floating* surface controlled by an
 * explicit toggle button — no hover, no peek. The button (rendered inside
 * the main content area) toggles `open`; the state is persisted to
 * `localStorage` so the user's last choice survives reloads.
 *
 * Implemented as a module-level singleton so every consumer (toggle button,
 * sidebar surface, keyboard shortcut handler, …) shares the same reactive
 * instance.
 *
 * The Ctrl/Cmd+B global shortcut is registered exactly once at module
 * scope on the first call to `useSidebar()`. Subsequent calls reuse the
 * already-installed listener so multiple consumers don't double-bind.
 */
import { computed, ref } from 'vue';
import { STORAGE_KEYS } from '@/lib/storageKeys';

const STORAGE_KEY = STORAGE_KEYS.sidebarOpen;

function readOpen(): boolean {
  try {
    // Default: closed. Users opt-in by clicking the toggle once.
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeOpen(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable — fail silent, in-memory state still works */
  }
}

const _open = ref(readOpen());

const open = computed<boolean>(() => _open.value);

/** Open the sidebar (idempotent). */
function show(): void {
  if (_open.value) return;
  _open.value = true;
  writeOpen(true);
}

/** Close the sidebar (idempotent). */
function hide(): void {
  if (!_open.value) return;
  _open.value = false;
  writeOpen(false);
}

/** Flip the open state. */
function toggle(): void {
  _open.value = !_open.value;
  writeOpen(_open.value);
}

/**
 * Module-scoped guard ensuring the global Ctrl/Cmd+B handler is bound at
 * most once across the lifetime of the page, regardless of how many
 * components consume `useSidebar()`.
 */
let shortcutInstalled = false;

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b' && !e.repeat) {
    e.preventDefault();
    toggle();
  }
}

function installGlobalShortcut(): void {
  if (shortcutInstalled) return;
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', onKeydown);
  shortcutInstalled = true;
}

export function useSidebar() {
  installGlobalShortcut();
  return { open, show, hide, toggle };
}

