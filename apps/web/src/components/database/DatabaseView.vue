<script setup lang="ts">
/**
 * Top-level shell of the Database View page.
 *
 * SCAFFOLD: provides the named-slot contract that every milestone
 * implements. Filled in by M3 (table layout), M5 (toolbar), M7 (view tabs).
 *
 * Layout regions (top → bottom):
 *   1. `view-tabs`   — saved view selector (M7)
 *   2. `toolbar`     — search / sort / filter / properties / + new (M5)
 *   3. `layout`      — the active layout (table / board / gallery / …) (M3, M9)
 *   4. `calc-row`    — footer aggregations (M6)
 *
 * Slot fallbacks render lightweight placeholders so the page is never blank
 * during incremental rollout.
 */
import { computed, toRef } from 'vue';
import { useDatabaseView } from '@/composables/database/useDatabaseView';
import { useViewQuery } from '@/composables/database/useViewQuery';

const props = defineProps<{
  kindId: string;
  viewId?: string | null;
}>();

const kindIdRef = toRef(props, 'kindId');
const viewIdRef = computed(() => props.viewId ?? null);

const dbView = useDatabaseView(kindIdRef, viewIdRef);
const query = useViewQuery(dbView.view);
</script>

<template>
  <div class="db-view">
    <header class="db-view__tabs">
      <slot name="view-tabs" :view="dbView.view.value" :reload="dbView.reload" />
    </header>
    <section class="db-view__toolbar">
      <slot name="toolbar" :view="dbView.view.value" :patch="dbView.patch" :reload="query.reload" />
    </section>
    <main class="db-view__layout">
      <slot
        name="layout"
        :view="dbView.view.value"
        :rows="query.rows.value"
        :groups="query.groups.value"
        :calc="query.calc.value"
        :total="query.total.value"
        :loading="query.loading.value || dbView.loading.value"
        :has-more="query.hasMore.value"
        :load-more="query.loadMore"
        :reload-row="query.reloadRow"
        :patch="dbView.patch"
      />
    </main>
    <footer v-if="$slots['calc-row']" class="db-view__calc">
      <slot
        name="calc-row"
        :view="dbView.view.value"
        :rows="query.rows.value"
        :calc="query.calc.value"
        :total="query.total.value"
      />
    </footer>
  </div>
</template>

<style scoped>
.db-view {
  display: grid;
  grid-template-rows: auto auto 1fr auto;
  height: 100%;
  width: 100%;
  background: var(--bg);
}
.db-view__tabs,
.db-view__toolbar,
.db-view__calc {
  border-bottom: var(--border-width-1) solid var(--border);
}
.db-view__layout {
  overflow: hidden;
  position: relative;
}
.db-view__calc {
  border-top: var(--border-width-1) solid var(--border);
  border-bottom: none;
}
</style>
