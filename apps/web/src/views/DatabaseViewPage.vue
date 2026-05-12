<script setup lang="ts">
/**
 * Route page for `/k/:kindId` and `/k/:kindId/:viewId`.
 *
 * Hosts the `<DatabaseView>` shell and dispatches the `layout` slot to
 * the right alternative layout (table / board / gallery / calendar /
 * timeline / list) via {@link layoutComponent}. Layouts are resolved
 * lazily so each split lives in its own chunk.
 */
import { computed, defineAsyncComponent, h, type Component } from 'vue';
import { useRoute } from 'vue-router';
import DatabaseView from '@/components/database/DatabaseView.vue';
import DbToolbar from '@/components/database/toolbar/DbToolbar.vue';
import ViewTabs from '@/components/database/views/ViewTabs.vue';
import type { LayoutConfig } from '@continuum/shared';

const route = useRoute();
const kindId = computed(() => String(route.params.kindId ?? ''));
const viewId = computed(() => {
  const id = route.params.viewId;
  return typeof id === 'string' && id.length > 0 ? id : null;
});

/** Inline placeholder used while the table layout (M3) is still WIP. */
const TablePlaceholder: Component = {
  name: 'TablePlaceholder',
  render: () =>
    h(
      'div',
      { style: 'padding:24px;color:var(--text-muted);text-align:center;' },
      'Loading layout…',
    ),
};

const BoardLayout = defineAsyncComponent(
  () => import('@/components/database/layouts/board/BoardLayout.vue'),
);
const GalleryLayout = defineAsyncComponent(
  () => import('@/components/database/layouts/gallery/GalleryLayout.vue'),
);
const CalendarLayout = defineAsyncComponent(
  () => import('@/components/database/layouts/calendar/CalendarLayout.vue'),
);
const TimelineLayout = defineAsyncComponent(
  () => import('@/components/database/layouts/timeline/TimelineLayout.vue'),
);
const ListLayout = defineAsyncComponent(
  () => import('@/components/database/layouts/list/ListLayout.vue'),
);
const TableLayout = defineAsyncComponent({
  loader: () => import('@/components/database/layouts/table/TableLayout.vue'),
  errorComponent: TablePlaceholder,
  loadingComponent: TablePlaceholder,
});

/** Map a {@link LayoutConfig.type} to its concrete component. */
function layoutComponent(type: LayoutConfig['type'] | undefined): Component {
  switch (type) {
    case 'board':    return BoardLayout;
    case 'gallery':  return GalleryLayout;
    case 'calendar': return CalendarLayout;
    case 'timeline': return TimelineLayout;
    case 'list':     return ListLayout;
    case 'table':
    default:         return TableLayout;
  }
}
</script>

<template>
  <DatabaseView v-if="kindId" :kind-id="kindId" :view-id="viewId">
    <template #view-tabs>
      <ViewTabs :kind-id="kindId" :current-view-id="viewId" />
    </template>
    <template #toolbar="{ view, patch, reload }">
      <DbToolbar :view="view" :patch="patch" :reload="reload" />
    </template>
    <template #layout="{ view, rows, groups, calc, total, loading, hasMore, loadMore, reloadRow, patch }">
      <component
        :is="layoutComponent(view?.layout?.type)"
        :view="view"
        :rows="rows"
        :groups="groups"
        :calc="calc"
        :total="total"
        :loading="loading"
        :has-more="hasMore"
        :load-more="loadMore"
        :reload-row="reloadRow"
        :patch="patch"
      />
    </template>
    <!--
      The table layout renders its own calc footer inside the scroll
      container so it shares the row grid. The `calc-row` slot is left
      unbound here so `<DatabaseView>` skips its outer footer entirely;
      M-future layouts can opt back in by providing the slot.
    -->
  </DatabaseView>
</template>
