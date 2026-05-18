<script setup lang="ts">
/**
 * ApplyTemplateModal — pick a template + merge options and preview the
 * outcome before committing. The merge runs server-side via
 * `api.templates.apply`; the preview path keeps the user honest about
 * what will change (added properties, body delta, conflicts).
 *
 * Locked notes are blocked client-side as a hint, and the server also
 * answers 423 if a stale client tries to apply against a locked note.
 */
import { computed, ref, watch } from 'vue';
import type {
  TemplateApplicationOptions,
  TemplateApplicationPreview,
  TemplateContentPlacement,
} from '@continuum/shared';
import { Icon, UiButton, UiModal, UiSelect, UiSwitch } from '@/components/ui';
import { usePageTemplates } from '@/composables/usePageTemplates';

const props = defineProps<{
  modelValue: boolean;
  noteId: string;
  noteLocked: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  applied: [];
}>();

const templates = usePageTemplates();

const templateId = ref<string>('');
const contentPlacement = ref<TemplateContentPlacement>('append');
const mergeTags = ref(true);
const applyDefaults = ref(true);

const preview = ref<TemplateApplicationPreview | null>(null);
const previewBusy = ref(false);
const applyBusy = ref(false);
const error = ref<string | null>(null);

const templateOptions = computed(() => [
  { value: '', label: 'Pick a template…' },
  ...templates.sorted.value.map((t) => ({ value: t.id, label: t.name })),
]);

const placementOptions: { value: TemplateContentPlacement; label: string }[] = [
  { value: 'append', label: 'Append after current body' },
  { value: 'prepend', label: 'Prepend before current body' },
  { value: 'replace-empty-only', label: 'Replace only if empty' },
];

const buildOptions = computed<TemplateApplicationOptions>(() => ({
  contentPlacement: contentPlacement.value,
  mergeTags: mergeTags.value,
  applyDefaults: applyDefaults.value,
}));

async function refreshPreview(): Promise<void> {
  if (!templateId.value) {
    preview.value = null;
    return;
  }
  previewBusy.value = true;
  error.value = null;
  try {
    preview.value = await templates.preview(props.noteId, {
      templateId: templateId.value,
      options: buildOptions.value,
    });
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
    preview.value = null;
  } finally {
    previewBusy.value = false;
  }
}

watch([templateId, contentPlacement, mergeTags, applyDefaults], () => {
  void refreshPreview();
});

watch(
  () => props.modelValue,
  async (open) => {
    if (!open) return;
    templateId.value = '';
    contentPlacement.value = 'append';
    mergeTags.value = true;
    applyDefaults.value = true;
    preview.value = null;
    error.value = null;
    await templates.load();
  },
);

async function confirmApply(): Promise<void> {
  if (!templateId.value || props.noteLocked) return;
  applyBusy.value = true;
  error.value = null;
  try {
    await templates.apply(props.noteId, {
      templateId: templateId.value,
      options: buildOptions.value,
    });
    emit('applied');
    emit('update:modelValue', false);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    applyBusy.value = false;
  }
}

function close(): void {
  if (!applyBusy.value) emit('update:modelValue', false);
}
</script>

<template>
  <UiModal
    :model-value="modelValue"
    title="Apply template"
    size="md"
    :persistent="applyBusy"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <div class="apply-template">
      <p v-if="noteLocked" class="warning" role="alert">
        <Icon name="lock" :size="14" />
        This note is locked. Unlock it before applying a template.
      </p>

      <label class="field">
        <span>Template</span>
        <UiSelect v-model="templateId" :options="templateOptions" />
      </label>

      <div class="field-grid">
        <label class="field">
          <span>Body merge</span>
          <UiSelect v-model="contentPlacement" :options="placementOptions" />
        </label>
        <div class="field-toggles">
          <UiSwitch v-model="mergeTags" label="Merge tags" />
          <UiSwitch v-model="applyDefaults" label="Apply property defaults" />
        </div>
      </div>

      <section v-if="preview" class="preview">
        <h4>Preview</h4>
        <p>
          Properties to add:
          <strong>{{ preview.propertyKeysToCreate.length }}</strong>
          / skipped: <strong>{{ preview.propertyKeysToSkip.length }}</strong>
        </p>
        <p>Body change: <strong>{{ preview.contentChange }}</strong></p>
        <p v-if="preview.tagsToAdd.length > 0">
          Tags to add: <strong>{{ preview.tagsToAdd.join(', ') }}</strong>
        </p>
        <ul v-if="preview.conflicts.length > 0" class="conflicts">
          <li v-for="c in preview.conflicts" :key="`${c.propertyKey}:${c.reason}`">
            <Icon name="warning" :size="12" />
            <span>{{ c.message }}</span>
          </li>
        </ul>
      </section>
      <p v-else-if="previewBusy" class="muted">Loading preview…</p>

      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>

    <template #footer>
      <UiButton variant="ghost" size="sm" :disabled="applyBusy" @click="close">Cancel</UiButton>
      <UiButton
        variant="primary"
        size="sm"
        :disabled="!templateId || noteLocked || applyBusy"
        @click="confirmApply"
      >
        {{ applyBusy ? 'Applying…' : 'Apply template' }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.apply-template {
  display: flex;
  flex-direction: column;
  gap: 14px;
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
  align-items: start;
}

.field-toggles {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 18px;
}

.preview {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--surface-raised);
  font-size: 12px;
}

.preview h4 {
  margin: 0 0 6px;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}

.preview p {
  margin: 2px 0;
}

.conflicts {
  margin: 6px 0 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--warning, var(--text-secondary));
}

.conflicts li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.warning {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--danger);
  font-size: 12px;
}

.muted {
  color: var(--text-muted);
  font-size: 12px;
}

.error {
  color: var(--danger);
  font-size: 12px;
}
</style>
