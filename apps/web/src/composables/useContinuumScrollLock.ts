import { onBeforeUnmount, watch, type WatchSource } from 'vue';
import { lockContinuumScroll } from '@continuum/shared';

export function useContinuumScrollLock(active: WatchSource<boolean>): void {
  let release: (() => void) | null = null;

  watch(
    active,
    (isActive) => {
      if (isActive) {
        release ??= lockContinuumScroll();
        return;
      }
      release?.();
      release = null;
    },
    { immediate: true },
  );

  onBeforeUnmount(() => {
    release?.();
    release = null;
  });
}