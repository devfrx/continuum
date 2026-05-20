export const SCROLL_LOCK_ALLOW_ATTRIBUTE = 'data-continuum-scroll-lock-allow';

type ReleaseScrollLock = () => void;

interface ScrollLockState {
  tokens: Set<symbol>;
  previousHtmlOverflow: string;
  previousHtmlOverscrollBehavior: string;
  previousBodyOverflow: string;
  previousBodyOverscrollBehavior: string;
  preventScrollHandler: ((event: Event) => void) | null;
  preventKeyScrollHandler: ((event: KeyboardEvent) => void) | null;
}

const SCROLL_LOCK_STATE_KEY = Symbol.for('continuum.scrollLock.state');
const SCROLL_KEYS = new Set([
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  ' ',
]);

type ScrollLockGlobal = typeof globalThis & {
  [SCROLL_LOCK_STATE_KEY]?: ScrollLockState;
};

function globalState(): ScrollLockState {
  const root = globalThis as ScrollLockGlobal;
  root[SCROLL_LOCK_STATE_KEY] ??= {
    tokens: new Set<symbol>(),
    previousHtmlOverflow: '',
    previousHtmlOverscrollBehavior: '',
    previousBodyOverflow: '',
    previousBodyOverscrollBehavior: '',
    preventScrollHandler: null,
    preventKeyScrollHandler: null,
  };
  return root[SCROLL_LOCK_STATE_KEY];
}

function activeDocument(): Document | null {
  return typeof document === 'undefined' ? null : document;
}

function scrollAllowedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(`[${SCROLL_LOCK_ALLOW_ATTRIBUTE}="true"]`) !== null;
}

function editableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest(`[${SCROLL_LOCK_ALLOW_ATTRIBUTE}="true"]`)) return true;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLSelectElement) return true;
  return target.closest('[contenteditable="true"]') !== null;
}

function preventBackgroundScroll(event: Event): void {
  if (globalState().tokens.size === 0) return;
  if (scrollAllowedTarget(event.target)) return;
  event.preventDefault();
}

function preventBackgroundKeyScroll(event: KeyboardEvent): void {
  if (globalState().tokens.size === 0) return;
  if (!SCROLL_KEYS.has(event.key)) return;
  if (editableTarget(event.target)) return;
  event.preventDefault();
}

function installLockStyles(): void {
  const doc = activeDocument();
  if (!doc) return;
  const state = globalState();
  const html = doc.documentElement;
  const body = doc.body;
  state.previousHtmlOverflow = html.style.overflow;
  state.previousHtmlOverscrollBehavior = html.style.overscrollBehavior;
  state.previousBodyOverflow = body.style.overflow;
  state.previousBodyOverscrollBehavior = body.style.overscrollBehavior;
  html.style.overflow = 'hidden';
  html.style.overscrollBehavior = 'none';
  body.style.overflow = 'hidden';
  body.style.overscrollBehavior = 'none';
  html.dataset.continuumScrollLocked = 'true';
  state.preventScrollHandler = preventBackgroundScroll;
  state.preventKeyScrollHandler = preventBackgroundKeyScroll;
  doc.addEventListener('wheel', state.preventScrollHandler, { capture: true, passive: false });
  doc.addEventListener('touchmove', state.preventScrollHandler, { capture: true, passive: false });
  doc.addEventListener('keydown', state.preventKeyScrollHandler, true);
}

function restoreLockStyles(): void {
  const doc = activeDocument();
  if (!doc) return;
  const state = globalState();
  const html = doc.documentElement;
  const body = doc.body;
  html.style.overflow = state.previousHtmlOverflow;
  html.style.overscrollBehavior = state.previousHtmlOverscrollBehavior;
  body.style.overflow = state.previousBodyOverflow;
  body.style.overscrollBehavior = state.previousBodyOverscrollBehavior;
  delete html.dataset.continuumScrollLocked;
  if (state.preventScrollHandler) {
    doc.removeEventListener('wheel', state.preventScrollHandler, true);
    doc.removeEventListener('touchmove', state.preventScrollHandler, true);
  }
  if (state.preventKeyScrollHandler) {
    doc.removeEventListener('keydown', state.preventKeyScrollHandler, true);
  }
  state.preventScrollHandler = null;
  state.preventKeyScrollHandler = null;
}

export function lockContinuumScroll(): ReleaseScrollLock {
  const doc = activeDocument();
  if (!doc) return () => undefined;
  const state = globalState();
  const token = Symbol('continuum-scroll-lock');
  const wasEmpty = state.tokens.size === 0;
  state.tokens.add(token);
  if (wasEmpty) installLockStyles();
  return () => {
    if (!state.tokens.delete(token)) return;
    if (state.tokens.size === 0) restoreLockStyles();
  };
}