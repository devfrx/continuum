<script setup lang="ts">
/**
 * `CellRenderer` — compact, read-only display of a property value inside
 * a database table cell.
 *
 * Mirrors the visual taxonomy of `PropertyRow.vue` (chips for selects,
 * link for url/email/phone, ✓/✗ for checkbox, …) but rendered in a
 * single-line, ellipsised form so a row stays at the configured row
 * height. The actual value-to-variant logic lives in `readonlyValue.ts`
 * and is shared with future consumers (board cards, gallery, …).
 */
import { computed } from 'vue';
import type { PropertyDefinition, PropertyValue } from '@continuum/shared';
import Icon from '@/components/ui/Icon.vue';
import { readonlyValue, type ReadonlyDisplay } from './readonlyValue';

const props = defineProps<{
  definition: PropertyDefinition;
  value: PropertyValue | null;
}>();

const display = computed<ReadonlyDisplay>(() =>
  readonlyValue(props.definition, props.value),
);
</script>

<template>
  <span class="cell-render" :class="`cell-render--${definition.type}`">
    <span v-if="display.kind === 'empty'" class="cell-render__empty">{{ display.text }}</span>

    <span
      v-else-if="display.kind === 'checkbox'"
      class="cell-render__check"
      :class="{ 'is-on': display.checked }"
      :title="display.text"
    >
      <Icon :name="display.checked ? 'check' : 'close'" :size="13" />
    </span>

    <span v-else-if="display.kind === 'chips'" class="cell-render__chips">
      <span
        v-for="chip in display.chips"
        :key="chip.label"
        class="cell-render__chip"
        :style="chip.color ? { background: chip.color } : undefined"
      >
        {{ chip.label }}
      </span>
    </span>

    <a
      v-else-if="display.kind === 'link'"
      class="cell-render__link"
      :href="display.href"
      target="_blank"
      rel="noreferrer"
      @click.stop
    >
      {{ display.text }}
    </a>

    <span v-else-if="display.kind === 'relation'" class="cell-render__chips">
      <span
        v-for="(id, index) in display.ids"
        :key="id"
        class="cell-render__chip cell-render__chip--relation"
      >
        Linked {{ index + 1 }}
      </span>
    </span>

    <span v-else class="cell-render__text">{{ display.text }}</span>
  </span>
</template>

<style scoped>
.cell-render {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  width: 100%;
  min-width: 0;
  font-size: var(--text-sm);
  color: var(--fg);
}
.cell-render__text,
.cell-render__link {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.cell-render__link {
  color: var(--accent);
  text-decoration: none;
}
.cell-render__link:hover {
  text-decoration: underline;
}
.cell-render__empty {
  color: var(--fg-muted);
  font-style: italic;
}
.cell-render__check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--bg-soft) 60%, transparent);
  color: var(--fg-muted);
}
.cell-render__check.is-on {
  background: color-mix(in srgb, var(--accent) 22%, transparent);
  color: var(--accent);
}
.cell-render__chips {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  overflow: hidden;
}
.cell-render__chip {
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--bg-soft) 70%, transparent);
  font-size: var(--text-xs);
  white-space: nowrap;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cell-render__chip--relation {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
}
</style>
