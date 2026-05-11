import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { useFloatingPosition } from '@/composables/useFloatingPosition';
import { withHost } from './helpers/withHost';

interface RectInit {
  top: number;
  left: number;
  width: number;
  height: number;
}

function makeTrigger(rect: RectInit): HTMLElement {
  const el = document.createElement('button');
  el.getBoundingClientRect = (): DOMRect => ({
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    bottom: rect.top + rect.height,
    right: rect.left + rect.width,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
  return el;
}

function makePanel(scrollHeight: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, configurable: true });
  return el;
}

function setViewport(w: number, h: number): void {
  Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
}

describe('useFloatingPosition', () => {
  it('places below the trigger when there is room', () => {
    setViewport(1024, 768);
    const triggerRef = ref<HTMLElement | null>(makeTrigger({ top: 100, left: 200, width: 240, height: 32 }));
    const panelRef = ref<HTMLElement | null>(makePanel(200));
    const open = ref(true);
    const { value: api, unmount } = withHost(() =>
      useFloatingPosition({ triggerRef, panelRef, open }),
    );
    api.reposition();
    expect(api.style.value.top).toBe('136px'); // 100 + 32 + 4
    expect(api.style.value.left).toBe('200px');
    expect(api.style.value.width).toBe('240px');
    unmount();
  });

  it('flips above when there is not enough room below', () => {
    setViewport(1024, 400);
    const triggerRef = ref<HTMLElement | null>(makeTrigger({ top: 350, left: 100, width: 200, height: 32 }));
    const panelRef = ref<HTMLElement | null>(makePanel(300));
    const open = ref(true);
    const { value: api, unmount } = withHost(() =>
      useFloatingPosition({ triggerRef, panelRef, open }),
    );
    api.reposition();
    expect(api.style.value.top).toBe('46px');
    unmount();
  });

  it('respects minWidth floor when trigger is narrow', () => {
    setViewport(1024, 768);
    const triggerRef = ref<HTMLElement | null>(makeTrigger({ top: 0, left: 0, width: 50, height: 32 }));
    const panelRef = ref<HTMLElement | null>(makePanel(100));
    const open = ref(true);
    const { value: api, unmount } = withHost(() =>
      useFloatingPosition({ triggerRef, panelRef, open, minWidth: 200 }),
    );
    api.reposition();
    expect(api.style.value.width).toBe('200px');
    unmount();
  });

  it('clamps left within viewport padding', () => {
    setViewport(400, 768);
    const triggerRef = ref<HTMLElement | null>(makeTrigger({ top: 50, left: 380, width: 100, height: 32 }));
    const panelRef = ref<HTMLElement | null>(makePanel(100));
    const open = ref(true);
    const { value: api, unmount } = withHost(() =>
      useFloatingPosition({ triggerRef, panelRef, open, pad: 8 }),
    );
    api.reposition();
    const left = parseInt(api.style.value.left, 10);
    expect(left).toBeLessThanOrEqual(232);
    expect(left).toBeGreaterThanOrEqual(8);
    unmount();
  });

  it('does nothing when refs are unset', () => {
    const triggerRef = ref<HTMLElement | null>(null);
    const panelRef = ref<HTMLElement | null>(null);
    const open = ref(false);
    const { value: api, unmount } = withHost(() =>
      useFloatingPosition({ triggerRef, panelRef, open }),
    );
    expect(() => api.reposition()).not.toThrow();
    expect(api.style.value.top).toBe('0px');
    unmount();
  });
});
