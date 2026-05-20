import { computed, ref } from 'vue';
import { STORAGE_KEYS } from '@/lib/storageKeys';

const STORAGE_KEY = STORAGE_KEYS.notesSidebarOpen;

function readOpen(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === '1';
  } catch {
    return true;
  }
}

function writeOpen(value: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* storage unavailable - in-memory state still works */
  }
}

const isOpen = ref(readOpen());
const open = computed<boolean>(() => isOpen.value);

function show(): void {
  if (isOpen.value) return;
  isOpen.value = true;
  writeOpen(true);
}

function hide(): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  writeOpen(false);
}

function toggle(): void {
  isOpen.value = !isOpen.value;
  writeOpen(isOpen.value);
}

export function useNotesSidebar() {
  return { open, show, hide, toggle };
}