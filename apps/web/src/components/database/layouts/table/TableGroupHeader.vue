<script setup lang="ts">
/**
 * `TableGroupHeader` — collapsible bucket header rendered between row
 * blocks inside the table grid.
 *
 * Spans the full grid width (`grid-column: 1 / -1`) so it docks above
 * the rows that belong to the bucket. The whole row acts as a click
 * target that toggles the collapse state; the chevron rotates to mirror
 * the current state for affordance.
 *
 * Visual: subtle `--bg-soft` background, slightly bolder font, and a
 * small grey count chip on the right.
 */
import type { QueryGroupBucket } from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';

defineProps<{
  bucket: QueryGroupBucket;
  collapsed: boolean;
}>();

const emit = defineEmits<{ toggle: [bucketKey: string | null] }>();

/** Flip the collapse state for this bucket (parent owns the set). */
function onToggle(event: MouseEvent, bucketKey: string | null): void {
  event.stopPropagation();
  emit('toggle', bucketKey);
}
</script>

<template>
  <div
    class="t-group-header"
    role="button"
    :aria-expanded="!collapsed"
    @click="onToggle($event, bucket.key)"
  >
    <span class="t-group-header__chev" :class="{ 'is-collapsed': collapsed }">
      <Icon name="chevron-down" :size="12" />
    </span>
    <span class="t-group-header__label">{{ bucket.label }}</span>
    <span class="t-group-header__count">{{ bucket.count }}</span>
  </div>
</template>

<style scoped>
.t-group-header {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--row-h, 36px);
  padding: 0 var(--space-3);
  background: var(--bg-soft);
  border-bottom: var(--border-width-1) solid var(--border);
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--fg);
  cursor: pointer;
  user-select: none;
  position: sticky;
  left: 0;
  z-index: 2;
}
.t-group-header:hover { background: var(--bg-elev); }
.t-group-header__chev {
  display: inline-flex;
  transition: transform 120ms ease;
  color: var(--fg-muted);
}
.t-group-header__chev.is-collapsed { transform: rotate(-90deg); }
.t-group-header__label { flex: 0 1 auto; }
.t-group-header__count {
  margin-left: auto;
  font-size: var(--text-xs);
  font-weight: 500;
  color: var(--fg-muted);
  background: var(--bg);
  padding: 2px 8px;
  border-radius: 999px;
  border: var(--border-width-1) solid var(--border);
}
</style>
