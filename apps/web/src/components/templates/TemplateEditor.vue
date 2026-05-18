<script setup lang="ts">
/**
 * TemplateEditor — single-template detail pane embedded inside
 * `TemplatesView`. Owns its own debounced autosave for the metadata
 * + body channel (name / description / tags / content / contentJson)
 * and delegates the property-list mutations to `TemplatePropertiesPanel`,
 * which calls back into `usePageTemplates` so the cache stays in sync.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { ContinuumEditor, type IconCatalogEntry } from '@continuum/editor';
import type { EntityKind, PageTemplate } from '@continuum/shared';
import { Icon, UiButton, UiConfirmModal, UiInput, UiSelect, UiTextarea } from '@/components/ui';
import { ICONS, type AppIconName } from '@/assets/icons';
import { useKinds } from '@/composables/useKinds';
import { usePageTemplates } from '@/composables/usePageTemplates';
import TemplatePropertiesPanel from './TemplatePropertiesPanel.vue';

const props = defineProps<{
  template: PageTemplate;
}>();

const emit = defineEmits<{
  deleted: [id: string];
}>();

const templates = usePageTemplates();
const kinds = useKinds();

// Local mirrors of the editable fields. Server-pushed changes (e.g.
// version bumps after a property edit) overwrite these via the watcher
// below; user edits flow back through the debounced save.
const name = ref(props.template.name);
const description = ref(props.template.description ?? '');
const targetKind = ref<string>(props.template.targetKind ?? '');
const tagsText = ref((props.template.tags ?? []).join(', '));
const content = ref(props.template.content ?? '');
const contentJson = ref<unknown>(props.template.contentJson ?? null);

const saving = ref(false);
const saveError = ref<string | null>(null);
const deleteOpen = ref(false);
let syncingFromTemplate = false;
let persistedSnapshot = snapshotFromTemplate(props.template);

const kindOptions = computed(() => [
  { value: '', label: 'No kind hint' },
  ...kinds.sorted.value.map((k) => ({ value: k.id, label: k.label })),
]);

const editorIconCatalog = computed<IconCatalogEntry[]>(() => {
  const names = Object.keys(ICONS) as AppIconName[];
  return names.map((id) => ({
    id,
    label: id.replace(/-/g, ' '),
    group: id.startsWith('kind-') ? 'Kinds' : id.startsWith('folder') ? 'Folders' : 'General',
  }));
});

function parseTags(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function snapshot(data: {
  name: string;
  description: string | null;
  targetKind: EntityKind | null;
  tags: string[];
  content: string;
  contentJson: unknown | null;
}): string {
  return JSON.stringify(data);
}

function snapshotFromTemplate(template: PageTemplate): string {
  return snapshot({
    name: template.name,
    description: template.description,
    targetKind: template.targetKind,
    tags: template.tags ?? [],
    content: template.content ?? '',
    contentJson: template.contentJson ?? null,
  });
}

function currentPayload(): {
  name: string;
  description: string | null;
  targetKind: EntityKind | null;
  tags: string[];
  content: string;
  contentJson: unknown | null;
} {
  return {
    name: name.value.trim() || 'Untitled template',
    description: description.value.trim() ? description.value : null,
    targetKind: (targetKind.value || null) as EntityKind | null,
    tags: parseTags(tagsText.value),
    content: content.value,
    contentJson: contentJson.value ?? null,
  };
}

function currentSnapshot(): string {
  return snapshot(currentPayload());
}

function syncFromTemplate(template: PageTemplate): void {
  syncingFromTemplate = true;
  name.value = template.name;
  description.value = template.description ?? '';
  targetKind.value = template.targetKind ?? '';
  tagsText.value = (template.tags ?? []).join(', ');
  content.value = template.content ?? '';
  contentJson.value = template.contentJson ?? null;
  void nextTick(() => {
    syncingFromTemplate = false;
  });
}

function scheduleSave(): void {
  if (syncingFromTemplate) return;
  void debouncedSave();
}

async function save(): Promise<void> {
  const payload = currentPayload();
  const nextSnapshot = snapshot(payload);
  if (nextSnapshot === persistedSnapshot) return;

  saving.value = true;
  saveError.value = null;
  try {
    const updated = await templates.update(props.template.id, payload);
    persistedSnapshot = snapshotFromTemplate(updated);
  } catch (err) {
    saveError.value = err instanceof Error ? err.message : String(err);
  } finally {
    saving.value = false;
  }
}

const debouncedSave = useDebounceFn(save, 600);

// Watch only the user-facing scalar fields. The body channel
// (`content` / `contentJson`) is watched separately because the editor
// may emit both close together and we want a single debounced save.
watch([name, description, targetKind, tagsText], () => {
  scheduleSave();
});

watch([content, contentJson], () => {
  scheduleSave();
});

watch(
  () => props.template,
  (next) => {
    const nextSnapshot = snapshotFromTemplate(next);
    const localWasClean = currentSnapshot() === persistedSnapshot;
    persistedSnapshot = nextSnapshot;
    if (localWasClean || currentSnapshot() === nextSnapshot) syncFromTemplate(next);
  },
  { deep: false },
);

void kinds.load();

async function confirmDelete(): Promise<void> {
  deleteOpen.value = false;
  emit('deleted', props.template.id);
}
</script>

<template>
  <div class="template-editor">
    <header class="template-editor__header">
      <div class="template-editor__title">
        <UiInput v-model="name" class="template-editor__name" placeholder="Template name" size="md" />
        <span class="template-editor__version">v{{ template.version }}</span>
      </div>
      <div class="template-editor__actions">
        <span v-if="saving" class="template-editor__status">Saving…</span>
        <span v-else-if="saveError" class="template-editor__status template-editor__status--error">
          {{ saveError }}
        </span>
        <UiButton variant="ghost" size="sm" @click="deleteOpen = true">
          <template #icon-left>
            <Icon name="trash" :size="13" />
          </template>
          Delete
        </UiButton>
      </div>
    </header>

    <div class="template-editor__body">
      <section class="template-editor__content">
        <h3 class="template-editor__section-title">Body</h3>
        <ContinuumEditor
          v-model="content"
          v-model:json="contentJson"
          class="template-editor__editor"
          mode="wysiwyg"
          placeholder="Write the template body — appears in every note created from this template."
          :icon-catalog="editorIconCatalog"
          :icon-component="Icon"
        />
      </section>

      <section class="template-editor__meta">
        <label class="field">
          <span>Description</span>
          <UiTextarea
            v-model="description"
            placeholder="What is this template for?"
            :rows="2"
          />
        </label>
        <div class="field-grid">
          <label class="field">
            <span>Suggested kind</span>
            <UiSelect v-model="targetKind" :options="kindOptions" />
          </label>
          <label class="field">
            <span>Tags (comma-separated)</span>
            <UiInput v-model="tagsText" placeholder="e.g. meeting, weekly" />
          </label>
        </div>
      </section>

      <section class="template-editor__properties">
        <h3 class="template-editor__section-title">Properties</h3>
        <TemplatePropertiesPanel :template="template" />
      </section>
    </div>

    <UiConfirmModal
      :model-value="deleteOpen"
      title="Delete template"
      :message="`Delete '${template.name}'? Notes previously created from it will keep their content and properties.`"
      confirm-label="Delete"
      confirm-variant="danger"
      @confirm="confirmDelete"
      @cancel="deleteOpen = false"
      @update:model-value="(v) => { if (!v) deleteOpen = false; }"
    />
  </div>
</template>

<style scoped>
.template-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
}

.template-editor__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-raised);
}

.template-editor__title {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.template-editor__name {
  flex: 1;
}

.template-editor__version {
  font-size: 11px;
  color: var(--text-muted);
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--surface-hover);
}

.template-editor__actions {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.template-editor__status {
  font-size: 12px;
  color: var(--text-muted);
}

.template-editor__status--error {
  color: var(--danger);
}

.template-editor__body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px 18px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.template-editor__meta {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.template-editor__section-title {
  font-size: 13px;
  font-weight: 600;
  margin: 0 0 8px;
  color: var(--text-primary);
}

.template-editor__editor {
  --drag-handle-gutter: 44px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  min-height: clamp(360px, 52vh, 640px);
  padding: 6px 10px;
  background: var(--surface-base);
  overflow: hidden;
}
</style>
