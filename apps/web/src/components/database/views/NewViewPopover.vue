<script setup lang="ts">
/**
 * Popover hosting the "create new view" form.
 *
 * Anchored to the trigger button passed in via `triggerRef`. Renders a
 * name input + layout-type select; on submit it calls
 * {@link UseViewListReturn.create} and emits the resulting summary so the
 * parent can navigate to the newly-created view.
 *
 * The popover does NOT own the view list — the parent passes its
 * `useViewList` instance so creations land in the same reactive store
 * the tab strip is rendering from.
 */
import { nextTick, ref, watch } from 'vue';
import UiPopover from '@/components/ui/UiPopover.vue';
import UiInput from '@/components/ui/UiInput.vue';
import UiSelect from '@/components/ui/UiSelect.vue';
import UiButton from '@/components/ui/UiButton.vue';
import type { LayoutConfig } from '@continuum/shared';
import type { ViewSummary } from '@/api';
import type { UseViewListReturn } from '@/composables/database/useViewList';
import { viewLabels } from './viewIcons';

const props = defineProps<{
  open: boolean;
  triggerRef: HTMLElement | null;
  viewList: UseViewListReturn;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  created: [view: ViewSummary];
}>();

const LAYOUT_TYPES: LayoutConfig['type'][] = ['table', 'board', 'gallery', 'list', 'calendar', 'timeline'];

const name = ref('');
const layoutType = ref<LayoutConfig['type']>('table');
const submitting = ref(false);
const error = ref<string | null>(null);
const inputRef = ref<InstanceType<typeof UiInput> | null>(null);

const layoutOptions = LAYOUT_TYPES.map((t) => ({ label: viewLabels[t], value: t }));

/** Reset form fields whenever the popover opens. */
watch(
  () => props.open,
  async (isOpen) => {
    if (!isOpen) return;
    name.value = '';
    layoutType.value = 'table';
    error.value = null;
    await nextTick();
    const root = (inputRef.value as unknown as { $el?: HTMLElement } | null)?.$el;
    root?.querySelector<HTMLInputElement>('input')?.focus();
  },
);

async function onCreate(): Promise<void> {
  const trimmed = name.value.trim();
  if (!trimmed || submitting.value) return;
  submitting.value = true;
  error.value = null;
  try {
    const created = await props.viewList.create(trimmed, layoutType.value);
    emit('created', created);
    emit('update:open', false);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to create view';
  } finally {
    submitting.value = false;
  }
}

function onLayoutChange(v: string): void {
  layoutType.value = v as LayoutConfig['type'];
}
</script>

<template>
  <UiPopover
    :open="open"
    :trigger-ref="triggerRef"
    :width="280"
    @update:open="(v: boolean) => emit('update:open', v)"
  >
    <form class="new-view" @submit.prevent="onCreate">
      <label class="new-view__label">
        <span>Name</span>
        <UiInput
          ref="inputRef"
          v-model="name"
          placeholder="View name"
          size="sm"
          @keydown.enter.prevent="onCreate"
        />
      </label>
      <label class="new-view__label">
        <span>Layout</span>
        <UiSelect :model-value="layoutType" :options="layoutOptions" @update:model-value="onLayoutChange" />
      </label>
      <p v-if="error" class="new-view__error">{{ error }}</p>
      <div class="new-view__actions">
        <UiButton variant="ghost" size="sm" type="button" @click="emit('update:open', false)">
          Cancel
        </UiButton>
        <UiButton
          variant="primary"
          size="sm"
          type="submit"
          :loading="submitting"
          :disabled="!name.trim()"
        >
          Create
        </UiButton>
      </div>
    </form>
  </UiPopover>
</template>

<style scoped>
.new-view {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.new-view__label {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  font-size: var(--text-xs);
  color: var(--fg-muted);
}
.new-view__error {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--danger);
}
.new-view__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  margin-top: var(--space-2);
}
</style>
