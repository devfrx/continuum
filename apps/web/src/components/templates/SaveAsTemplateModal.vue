<script setup lang="ts">
/**
 * SaveAsTemplateModal — snapshot the current note into a brand-new
 * template. Includes the note's body/tags and, when `includeProperties`
 * is checked, copies its note-scoped property definitions. When
 * `captureDefaults` is also checked the current values become the
 * template's defaults (computed/button properties are skipped server-side).
 */
import { ref, watch } from 'vue';
import { Icon, UiButton, UiInput, UiModal, UiSwitch, UiTextarea } from '@/components/ui';
import { usePageTemplates } from '@/composables/usePageTemplates';

const props = defineProps<{
  modelValue: boolean;
  noteId: string;
  defaultName?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  saved: [templateId: string];
}>();

const templates = usePageTemplates();

const name = ref('');
const description = ref('');
const includeProperties = ref(true);
const captureDefaults = ref(false);
const busy = ref(false);
const error = ref<string | null>(null);

watch(
  () => props.modelValue,
  (open) => {
    if (!open) return;
    name.value = props.defaultName ?? '';
    description.value = '';
    includeProperties.value = true;
    captureDefaults.value = false;
    error.value = null;
  },
);

async function submit(): Promise<void> {
  const clean = name.value.trim();
  if (!clean) return;
  busy.value = true;
  error.value = null;
  try {
    const created = await templates.fromNote({
      noteId: props.noteId,
      name: clean,
      description: description.value.trim() || null,
      includeProperties: includeProperties.value,
      captureDefaults: captureDefaults.value,
    });
    emit('saved', created.id);
    emit('update:modelValue', false);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    busy.value = false;
  }
}

function close(): void {
  if (!busy.value) emit('update:modelValue', false);
}
</script>

<template>
  <UiModal
    :model-value="modelValue"
    title="Save as template"
    size="md"
    :persistent="busy"
    @update:model-value="(v) => emit('update:modelValue', v)"
  >
    <form class="save-as-tpl" @submit.prevent="submit">
      <label class="field">
        <span>Template name</span>
        <UiInput v-model="name" placeholder="e.g. Weekly review" />
      </label>
      <label class="field">
        <span>Description (optional)</span>
        <UiTextarea v-model="description" :rows="2" placeholder="Short description for the templates list" />
      </label>

      <div class="toggles">
        <UiSwitch v-model="includeProperties" label="Include this note's properties" />
        <UiSwitch v-model="captureDefaults" label="Capture current values as defaults" :disabled="!includeProperties" />
      </div>

      <p v-if="error" class="error" role="alert">
        <Icon name="warning" :size="14" />
        {{ error }}
      </p>
    </form>

    <template #footer>
      <UiButton variant="ghost" size="sm" :disabled="busy" @click="close">Cancel</UiButton>
      <UiButton variant="primary" size="sm" :disabled="!name.trim() || busy" @click="submit">
        {{ busy ? 'Saving…' : 'Save template' }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.save-as-tpl {
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

.toggles {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-raised);
}

.error {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--danger);
  font-size: 12px;
}
</style>
