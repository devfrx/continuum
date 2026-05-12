<script setup lang="ts">
/**
 * `TableColumnMenu` — dropdown menu rendered by `TableHeaderCell`.
 *
 * Pure UI: receives the current column state, emits semantic actions
 * upward. Owning the menu in its own component keeps the parent cell
 * within the per-file line budget.
 */
import type { ColumnConfig } from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';

type SimpleAction = 'sort-asc' | 'sort-desc' | 'hide' | 'delete';
type ToggleAction = 'freeze-up-to' | 'unfreeze' | 'toggle-wrap';

defineProps<{
  column: ColumnConfig;
}>();

const emit = defineEmits<{
  action: [action: SimpleAction | ToggleAction];
}>();
</script>

<template>
  <div class="t-col-menu" role="menu">
    <button type="button" class="t-col-menu__item" role="menuitem" @click="emit('action', 'sort-asc')">
      <Icon name="arrow-up" :size="12" /><span>Sort A → Z</span>
    </button>
    <button type="button" class="t-col-menu__item" role="menuitem" @click="emit('action', 'sort-desc')">
      <Icon name="arrow-down" :size="12" /><span>Sort Z → A</span>
    </button>
    <button
      v-if="!column.frozen"
      type="button"
      class="t-col-menu__item"
      role="menuitem"
      @click="emit('action', 'freeze-up-to')"
    >
      <Icon name="snowflake" :size="12" /><span>Freeze up to this column</span>
    </button>
    <button
      v-else
      type="button"
      class="t-col-menu__item"
      role="menuitem"
      @click="emit('action', 'unfreeze')"
    >
      <Icon name="snowflake" :size="12" /><span>Unfreeze</span>
    </button>
    <button
      type="button"
      class="t-col-menu__item"
      role="menuitem"
      @click="emit('action', 'toggle-wrap')"
    >
      <Icon name="solar:text-bold" :size="12" />
      <span>{{ column.wrap ? 'Unwrap text' : 'Wrap text' }}</span>
    </button>
    <button type="button" class="t-col-menu__item" role="menuitem" @click="emit('action', 'hide')">
      <Icon name="eye-off" :size="12" /><span>Hide column</span>
    </button>
    <button
      type="button"
      class="t-col-menu__item t-col-menu__item--danger"
      role="menuitem"
      @click="emit('action', 'delete')"
    >
      <Icon name="trash" :size="12" /><span>Delete property</span>
    </button>
  </div>
</template>

<style scoped>
.t-col-menu {
  position: absolute;
  top: calc(100% + 2px);
  left: 0;
  z-index: 5;
  min-width: 200px;
  padding: 4px;
  background: var(--bg);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 24px rgb(0 0 0 / 0.28);
  display: flex;
  flex-direction: column;
}
.t-col-menu__item {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 8px;
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--fg);
  font-size: var(--text-sm);
  cursor: pointer;
  text-align: left;
}
.t-col-menu__item:hover {
  background: color-mix(in srgb, var(--bg-soft) 60%, transparent);
}
.t-col-menu__item--danger {
  color: var(--danger, #d6534b);
}
</style>
