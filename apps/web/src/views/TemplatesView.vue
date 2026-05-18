<script setup lang="ts">
/**
 * TemplatesView — top-level workspace surface that lists every
 * page template and lets the user edit one in a focused detail pane.
 *
 * Layout: a narrow list on the left (cards with name + property count),
 * a single-template editor on the right. Selecting a template syncs the
 * URL (`/templates/:id`) so the view is deep-linkable from anywhere
 * (e.g. from the "Save as template" action on a note).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Icon, UiButton, UiEmpty, UiInput } from '@/components/ui';
import { usePromptModal } from '@/composables/usePromptModal';
import { usePageTemplates } from '@/composables/usePageTemplates';
import TemplateEditor from '@/components/templates/TemplateEditor.vue';

const route = useRoute();
const router = useRouter();
const templates = usePageTemplates();
const { requestPrompt } = usePromptModal();

const search = ref('');
const selectedId = ref<string | null>(null);

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  const all = templates.sorted.value;
  if (!q) return all;
  return all.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      (t.description ?? '').toLowerCase().includes(q),
  );
});

const selected = computed(() =>
  selectedId.value ? templates.byId(selectedId.value) : null,
);

function select(id: string): void {
  selectedId.value = id;
  if (route.params.id !== id) {
    void router.replace({ name: 'template-edit', params: { id } });
  }
}

async function createNew(): Promise<void> {
  const name = await requestPrompt({
    title: 'New template',
    label: 'Name',
    placeholder: 'e.g. Meeting notes',
    confirmLabel: 'Create',
  });
  const clean = name?.trim();
  if (!clean) return;
  const t = await templates.create({ name: clean });
  select(t.id);
}

async function remove(id: string): Promise<void> {
  // Confirmation handled by the editor's danger zone for the active
  // template; this method exists so other surfaces can call it directly.
  await templates.remove(id);
  if (selectedId.value === id) {
    selectedId.value = null;
    void router.replace({ name: 'templates' });
  }
}

watch(
  () => route.params.id,
  (id) => {
    const next = typeof id === 'string' ? id : null;
    if (next !== selectedId.value) selectedId.value = next;
  },
);

onMounted(async () => {
  await templates.load();
  const routeId = typeof route.params.id === 'string' ? route.params.id : null;
  if (routeId) {
    selectedId.value = routeId;
  } else if (templates.sorted.value.length > 0) {
    select(templates.sorted.value[0]!.id);
  }
});
</script>

<template>
  <section class="templates-view">
    <aside class="templates-list">
      <header class="templates-list__header">
        <div class="templates-list__title">
          <Icon name="templates" :size="18" />
          <span>Templates</span>
        </div>
        <UiButton variant="primary" size="sm" @click="createNew">
          <template #icon-left>
            <Icon name="plus" :size="13" />
          </template>
          New
        </UiButton>
      </header>

      <div class="templates-list__search">
        <UiInput v-model="search" placeholder="Filter templates…" size="sm" />
      </div>

      <div class="templates-list__items">
        <button
          v-for="t in filtered"
          :key="t.id"
          type="button"
          class="template-card"
          :class="{ 'template-card--active': selectedId === t.id }"
          @click="select(t.id)"
        >
          <span class="template-card__name">{{ t.name }}</span>
          <span class="template-card__meta">
            {{ t.properties.length }}
            {{ t.properties.length === 1 ? 'property' : 'properties' }}
            <template v-if="t.targetKind"> / {{ t.targetKind }}</template>
          </span>
          <span v-if="t.description" class="template-card__desc">{{ t.description }}</span>
        </button>

        <UiEmpty
          v-if="!templates.loading.value && filtered.length === 0"
          :title="search ? 'No templates match' : 'No templates yet'"
          :message="search ? 'Try a different search term.' : 'Create one to seed new notes with shared structure.'"
        >
          <template #icon>
            <Icon name="templates" :size="28" />
          </template>
        </UiEmpty>
      </div>
    </aside>

    <main class="templates-pane">
      <TemplateEditor
        v-if="selected"
        :key="selected.id"
        :template="selected"
        @deleted="remove"
      />
      <UiEmpty
        v-else
        class="templates-pane__empty"
        title="Select a template"
        message="Pick one on the left, or create a new one to start composing."
      >
        <template #icon>
          <Icon name="templates" :size="32" />
        </template>
      </UiEmpty>
    </main>
  </section>
</template>

<style scoped>
.templates-view {
  display: grid;
  grid-template-columns: 320px 1fr;
  height: 100%;
  min-height: 0;
  background: var(--surface-base);
}

.templates-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border-subtle);
  background: var(--surface-raised);
}

.templates-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-subtle);
}

.templates-list__title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  font-size: 14px;
  color: var(--text-primary);
}

.templates-list__search {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
}

.templates-list__items {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.template-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: stretch;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: transparent;
  text-align: left;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
}

.template-card:hover {
  background: var(--surface-hover);
}

.template-card--active {
  background: var(--surface-selected);
  border-color: var(--border-strong);
}

.template-card__name {
  font-weight: 600;
  font-size: 13px;
}

.template-card__meta {
  font-size: 11px;
  color: var(--text-muted);
}

.template-card__desc {
  font-size: 12px;
  color: var(--text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 4px;
}

.templates-pane {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.templates-pane__empty {
  margin: auto;
}
</style>
