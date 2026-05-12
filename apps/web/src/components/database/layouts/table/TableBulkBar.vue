<script setup lang="ts">
/**
 * `TableBulkBar` — floating action bar shown when one or more rows are
 * Shift-selected in the table layout. Surfaces a clear-selection control
 * and a destructive bulk-delete action; both are emit-only so the parent
 * owns the actual mutation logic.
 */
defineProps<{ count: number }>();

const emit = defineEmits<{ clear: []; delete: [] }>();
</script>

<template>
  <div class="t-bulk" role="toolbar" aria-label="Bulk actions">
    <span class="t-bulk__count">{{ count }} selected</span>
    <button type="button" class="t-bulk__btn" @click="emit('clear')">Clear</button>
    <button type="button" class="t-bulk__btn is-danger" @click="emit('delete')">
      Delete {{ count }} rows
    </button>
  </div>
</template>

<style scoped>
.t-bulk {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1) var(--space-3);
  background: var(--bg-soft);
  border-bottom: var(--border-width-1) solid var(--border);
  font-size: var(--text-sm);
}
.t-bulk__count {
  color: var(--fg-muted);
}
.t-bulk__btn {
  background: transparent;
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  color: var(--fg);
  cursor: pointer;
  font: inherit;
}
.t-bulk__btn.is-danger {
  color: var(--danger, #d6534b);
  border-color: color-mix(in srgb, var(--danger, #d6534b) 60%, transparent);
}
</style>
