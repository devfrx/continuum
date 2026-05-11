import { defineComponent, h, type VNode } from 'vue';
import { mount, type VueWrapper } from '@vue/test-utils';

/**
 * Mounts a transient host component so a composable can register
 * lifecycle hooks (onBeforeUnmount, watch with effects) without
 * Vue warning that there is no active instance.
 *
 * Returns the composable's return value plus an `unmount()` helper.
 */
export function withHost<T>(factory: () => T): { value: T; unmount: () => void } {
  let captured!: T;
  const Host = defineComponent({
    setup(): () => VNode {
      captured = factory();
      return () => h('div');
    },
  });
  const wrapper: VueWrapper = mount(Host);
  return {
    value: captured,
    unmount: () => wrapper.unmount(),
  };
}
