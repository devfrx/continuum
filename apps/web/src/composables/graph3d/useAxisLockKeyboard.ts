/**
 * Keyboard axis-lock state machine for the 3D drag interaction.
 *
 * While a drag is in progress, holding `x`, `y`, or `z` constrains the
 * dragged node to that axis (relative to its drag origin). Multiple
 * keys can be stacked: the most recently pressed key wins, releasing
 * pops the stack. Window blur clears every lock so a tabbed-away
 * Electron window never re-enters the canvas with a stale modifier.
 *
 * The composable installs `keydown` / `keyup` / `blur` listeners in
 * `onMounted` and removes them in `onBeforeUnmount`. Per-instance: each
 * canvas owns its own stack.
 */
import { onBeforeUnmount, onMounted } from 'vue';
import { AXIS_LOCK_KEYS, type AxisKey } from './types';

export interface AxisLockKeyboardApi {
  /** Most recently pressed axis key, or null if none held. */
  activeAxis(): AxisKey | null;
  /** Drop every held key (used on tab-out). */
  clear(): void;
}

export interface AxisLockKeyboardOptions {
  /** Called whenever the active axis changes (push / pop / clear). */
  onChange: () => void;
  /** When true, axis-key events are `preventDefault()`-ed so the
   *  browser doesn't bubble them into editor shortcuts mid-drag. */
  shouldCapture: () => boolean;
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return !!element
    && (element.isContentEditable
      || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(element.tagName));
}

function axisForKeyboardEvent(event: KeyboardEvent): AxisKey | null {
  return AXIS_LOCK_KEYS[event.key.toLowerCase()] ?? null;
}

export function useAxisLockKeyboard(opts: AxisLockKeyboardOptions): AxisLockKeyboardApi {
  const stack: AxisKey[] = [];
  let active: AxisKey | null = null;

  function pushAxisLock(axis: AxisKey): void {
    const existingIndex = stack.indexOf(axis);
    if (existingIndex >= 0) stack.splice(existingIndex, 1);
    stack.push(axis);
    active = axis;
  }

  function releaseAxisLock(axis: AxisKey): void {
    const existingIndex = stack.indexOf(axis);
    if (existingIndex >= 0) stack.splice(existingIndex, 1);
    active = stack.length > 0 ? stack[stack.length - 1] : null;
  }

  function clear(): void {
    stack.length = 0;
    active = null;
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (isEditableKeyboardTarget(event.target)) return;
    const axis = axisForKeyboardEvent(event);
    if (!axis) return;
    if (event.repeat && active === axis) {
      if (opts.shouldCapture()) event.preventDefault();
      return;
    }
    pushAxisLock(axis);
    if (!opts.shouldCapture()) return;
    event.preventDefault();
    opts.onChange();
  }

  function onKeyUp(event: KeyboardEvent): void {
    const axis = axisForKeyboardEvent(event);
    if (!axis) return;
    releaseAxisLock(axis);
    if (!opts.shouldCapture()) return;
    event.preventDefault();
    opts.onChange();
  }

  function onBlur(): void {
    clear();
    opts.onChange();
  }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
  });

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    clear();
  });

  return {
    activeAxis: () => active,
    clear,
  };
}
