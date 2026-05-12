<script setup lang="ts">
/**
 * Floating context menu for one saved view.
 *
 * Mounted by {@link ViewTabs} and re-anchored at the cursor each time it
 * opens. Mutations are dispatched against the {@link UseViewListReturn}
 * instance passed in by the parent — the menu owns no state of its own
 * beyond menu visibility.
 *
 * Rename and delete use native `prompt()` / `confirm()` for v1 to keep
 * this file lean; richer in-tab editing is a future polish pass.
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import UiContextMenu, { type ContextMenuItem } from '@/components/ui/UiContextMenu.vue';
import type { ViewSummary } from '@/api';
import type { UseViewListReturn } from '@/composables/database/useViewList';

const props = defineProps<{
  open: boolean;
  x: number;
  y: number;
  kindId: string;
  view: ViewSummary | null;
  /** Other views — used to pick a redirect target after deletion. */
  siblings: ViewSummary[];
  viewList: UseViewListReturn;
  /** True when this view is the currently-routed one. */
  isCurrent: boolean;
}>();

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const router = useRouter();

function close(): void {
  emit('update:open', false);
}

async function onRename(): Promise<void> {
  const v = props.view;
  if (!v) return;
  const next = window.prompt('View name', v.name);
  if (next == null) return;
  const trimmed = next.trim();
  if (!trimmed || trimmed === v.name) return;
  try {
    await props.viewList.rename(v.id, trimmed);
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Failed to rename view');
  }
}

async function onDuplicate(): Promise<void> {
  const v = props.view;
  if (!v) return;
  try {
    const copy = await props.viewList.duplicate(v.id);
    await router.push({
      name: 'database-view-saved',
      params: { kindId: props.kindId, viewId: copy.id },
    });
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Failed to duplicate view');
  }
}

async function onSetDefault(): Promise<void> {
  const v = props.view;
  if (!v || v.isDefault) return;
  try {
    await props.viewList.setDefault(v.id);
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Failed to set default');
  }
}

async function onToggleLock(): Promise<void> {
  const v = props.view;
  if (!v) return;
  try {
    await props.viewList.setLocked(v.id, !v.locked);
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Failed to update lock');
  }
}

async function onDelete(): Promise<void> {
  const v = props.view;
  if (!v) return;
  if (!window.confirm(`Delete view "${v.name}"?`)) return;
  try {
    await props.viewList.remove(v.id);
    if (props.isCurrent) {
      const fallback = props.siblings.find((s) => s.id !== v.id);
      if (fallback) {
        await router.push({
          name: 'database-view-saved',
          params: { kindId: props.kindId, viewId: fallback.id },
        });
      } else {
        await router.push({ name: 'database-view', params: { kindId: props.kindId } });
      }
    }
  } catch (err) {
    window.alert(err instanceof Error ? err.message : 'Failed to delete view');
  }
}

/** Build the menu items reactively from the current view. */
const items = computed<ContextMenuItem[]>(() => {
  const v = props.view;
  if (!v) return [];
  return [
    { id: 'rename', label: 'Rename', icon: 'edit', onSelect: () => void onRename() },
    { id: 'duplicate', label: 'Duplicate', icon: 'copy', onSelect: () => void onDuplicate() },
    {
      id: 'default',
      label: v.isDefault ? 'Default view' : 'Set as default',
      icon: 'check',
      disabled: v.isDefault,
      onSelect: () => void onSetDefault(),
    },
    {
      id: 'lock',
      label: v.locked ? 'Unlock' : 'Lock',
      icon: 'lock',
      onSelect: () => void onToggleLock(),
    },
    { id: 'sep', divider: true },
    {
      id: 'delete',
      label: 'Delete',
      icon: 'trash',
      danger: true,
      disabled: props.siblings.length <= 1,
      onSelect: () => void onDelete(),
    },
  ] satisfies ContextMenuItem[];
});

const openProxy = computed({
  get: () => props.open,
  set: (v: boolean) => emit('update:open', v),
});
</script>

<template>
  <UiContextMenu v-model="openProxy" :x="x" :y="y" :items="items" @select="close" />
</template>
