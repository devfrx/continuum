<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { api } from '@/api';
import type {
  AiHealthResponse,
  AiProviderName,
  EntityKind,
  KindDefinition,
} from '@continuum/shared';
import {
  UiButton,
  UiCard,
  UiSection,
  UiSelect,
  UiInput,
  UiTextarea,
  UiSwitch,
  UiBadge,
  UiIconPicker,
  UiConfirmModal,
  DEFAULT_KIND_ICON,
  Icon,
} from '@/components/ui';
import { useKinds } from '@/composables/useKinds';

interface Settings {
  primary: AiProviderName | '';
  chatModel: string;
  embedModel: string;
  temperature: number;
  autoFallback: boolean;
  showRightPanel: boolean;
  defaultKind: EntityKind;
  defaultEditorMode: 'wysiwyg' | 'markdown';
}

const STORAGE_KEY = 'continuum.settings.v2';
const LEGACY_KEY = 'continuum.aiPrefs';

const DEFAULTS: Settings = {
  primary: '',
  chatModel: '',
  embedModel: '',
  temperature: 0.7,
  autoFallback: true,
  showRightPanel: true,
  defaultKind: 'note',
  defaultEditorMode: 'wysiwyg',
};

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) };
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return { ...DEFAULTS, ...(JSON.parse(legacy) as Partial<Settings>) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

const health = ref<AiHealthResponse | null>(null);
const loading = ref(false);
const settings = ref<Settings>(loadSettings());
const saved = ref(false);
const clearError = ref('');
const confirmDeleteTarget = ref<KindDefinition | null>(null);
const confirmClearAllVisible = ref(false);
const temperatureText = ref(settings.value.temperature.toString());

// ===== Categories (kinds) =====
const kindStore = useKinds();

interface KindDraft {
  id: string;        // empty when creating; preview-only
  label: string;
  color: string;
  icon: string;
  description: string;
}

const editingId = ref<string | null>(null); // null = not editing, '' = creating new
const draft = ref<KindDraft>(emptyDraft());
const draftError = ref('');
const draftBusy = ref(false);

function emptyDraft(): KindDraft {
  return { id: '', label: '', color: '#9A9286', icon: DEFAULT_KIND_ICON, description: '' };
}

/** Mirror the server slugify rule for the live id preview. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const draftIdPreview = computed<string>(() =>
  editingId.value && editingId.value !== '' ? editingId.value : slugify(draft.value.label),
);

function startCreate(): void {
  editingId.value = '';
  draft.value = emptyDraft();
  draftError.value = '';
}
function startEdit(k: KindDefinition): void {
  editingId.value = k.id;
  draft.value = {
    id: k.id,
    label: k.label,
    color: k.color,
    icon: k.icon,
    description: k.description ?? '',
  };
  draftError.value = '';
}
function cancelEdit(): void {
  editingId.value = null;
  draft.value = emptyDraft();
  draftError.value = '';
}

async function saveDraft(): Promise<void> {
  draftError.value = '';
  if (!draft.value.label.trim()) {
    draftError.value = 'Label is required';
    return;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(draft.value.color)) {
    draftError.value = 'Color must be a #RRGGBB hex value';
    return;
  }
  draftBusy.value = true;
  try {
    const payload: Partial<KindDefinition> = {
      label: draft.value.label.trim(),
      color: draft.value.color,
      icon: draft.value.icon,
      description: draft.value.description.trim() || undefined,
    };
    if (editingId.value && editingId.value !== '') {
      await kindStore.update(editingId.value, payload);
    } else {
      await kindStore.create(payload);
    }
    cancelEdit();
  } catch (e) {
    draftError.value = e instanceof Error ? e.message : String(e);
  } finally {
    draftBusy.value = false;
  }
}

function removeKind(k: KindDefinition): void {
  if (k.builtin) return;
  confirmDeleteTarget.value = k;
}

async function executeDeleteKind(): Promise<void> {
  const k = confirmDeleteTarget.value;
  if (!k) return;
  confirmDeleteTarget.value = null;
  try {
    await kindStore.remove(k.id);
    if (settings.value.defaultKind === k.id) settings.value.defaultKind = 'note';
  } catch (e) {
    draftError.value = e instanceof Error ? e.message : String(e);
  }
}

const confirmDeleteMessage = computed<string>(() =>
  confirmDeleteTarget.value
    ? `Delete "${confirmDeleteTarget.value.label}"? Notes using it will be reassigned to "note".`
    : '',
);

const KIND_OPTIONS = computed<{ label: string; value: string }[]>(() =>
  kindStore.sorted.value.map((k) => ({ label: k.label, value: k.id })),
);

const EDITOR_MODE_OPTIONS: { label: string; value: string }[] = [
  { label: 'WYSIWYG (rich)', value: 'wysiwyg' },
  { label: 'Markdown (plain)', value: 'markdown' },
];

async function refresh() {
  loading.value = true;
  try {
    health.value = await api.ai.health();
    if (!settings.value.primary && health.value) {
      settings.value.primary = health.value.primary;
    }
  } finally {
    loading.value = false;
  }
}

const modelOptions = computed<{ label: string; value: string }[]>(() => {
  const out: { label: string; value: string }[] = [
    { label: '(server default)', value: '' },
  ];
  for (const p of health.value?.providers ?? []) {
    for (const m of p.models ?? []) {
      out.push({ label: `${p.name} — ${m.id}`, value: m.id });
    }
  }
  return out;
});

function persist() {
  const parsed = parseFloat(temperatureText.value);
  if (!Number.isNaN(parsed)) settings.value.temperature = parsed;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
}

function save() {
  persist();
  saved.value = true;
  setTimeout(() => (saved.value = false), 1500);
}

watch(
  () => [settings.value.autoFallback, settings.value.showRightPanel] as const,
  () => persist(),
);

function selectKind(v: string) {
  settings.value.defaultKind = v as EntityKind;
}
function selectEditorMode(v: string) {
  if (v === 'wysiwyg' || v === 'markdown') settings.value.defaultEditorMode = v;
}
function selectChatModel(v: string) { settings.value.chatModel = v; }
function selectEmbedModel(v: string) { settings.value.embedModel = v; }

// API exposes notes.remove(id) per-note but no bulk-delete endpoint.
const bulkDeleteAvailable = false;

function clearAllNotes(): void {
  if (!bulkDeleteAvailable) return;
  confirmClearAllVisible.value = true;
}

async function executeClearAllNotes(): Promise<void> {
  confirmClearAllVisible.value = false;
  clearError.value = '';
  try {
    const all = await api.notes.list();
    for (const n of all) await api.notes.remove(n.id);
  } catch (e) {
    clearError.value = e instanceof Error ? e.message : String(e);
  }
}

const reindexing = ref(false);
const reindexResult = ref<string>('');
async function reindexEmbeddings(): Promise<void> {
  reindexing.value = true;
  reindexResult.value = '';
  try {
    const r = await api.notes.reindex();
    reindexResult.value = `Re-indexed ${r.ok}/${r.total} notes${r.failed ? ` (${r.failed} failed)` : ''}.`;
  } catch (e) {
    reindexResult.value = e instanceof Error ? e.message : String(e);
  } finally {
    reindexing.value = false;
  }
}

onMounted(() => {
  void refresh();
  void kindStore.load();
});
</script>

<template>
  <div class="settings">
    <header class="settings__head">
      <div>
        <h2 class="settings__title">Settings</h2>
        <p class="settings__sub">Local preferences. Stored in your browser.</p>
      </div>
      <UiButton variant="subtle" :loading="loading" @click="refresh">
        <template #icon-left>
          <Icon name="refresh" :size="14" />
        </template>
        {{ loading ? 'Checking…' : 'Refresh providers' }}
      </UiButton>
    </header>

    <UiSection title="AI Providers" description="Choose which models drive chat and embeddings.">
      <UiCard>
        <div class="field">
          <label class="field__label">Chat model</label>
          <UiSelect :modelValue="settings.chatModel" :options="modelOptions" @update:modelValue="selectChatModel" />
        </div>
        <div class="field">
          <label class="field__label">Embedding model</label>
          <UiSelect :modelValue="settings.embedModel" :options="modelOptions" @update:modelValue="selectEmbedModel" />
        </div>
        <div class="field">
          <label class="field__label">
            Temperature
            <span class="field__hint">{{ settings.temperature.toFixed(2) }}</span>
          </label>
          <UiInput v-model="temperatureText" type="number" />
          <p class="field__desc">
            Controls creativity. Lower = focused; higher = exploratory. Range 0–2.
          </p>
        </div>
        <div class="field field--row">
          <UiSwitch v-model="settings.autoFallback" label="Auto-fallback on provider error" />
        </div>
        <template #footer>
          <span v-if="saved" class="settings__saved">Saved ✓</span>
          <UiButton variant="primary" @click="save">Save preferences</UiButton>
        </template>
      </UiCard>
    </UiSection>

    <UiSection title="Categories"
      description="Note categories drive labels, icons and graph colors. Only “Note” is built-in.">
      <UiCard>
        <ul class="kinds-list">
          <li v-for="k in kindStore.sorted.value" :key="k.id" class="kind-row">
            <span class="kind-swatch" :style="{ background: k.color }" />
            <Icon :name="k.icon" :size="18" class="kind-row__icon" />
            <div class="kind-row__meta">
              <div class="kind-row__title">
                {{ k.label }}
                <UiBadge v-if="k.builtin" tone="neutral">built-in</UiBadge>
                <code class="kind-row__slug">{{ k.id }}</code>
              </div>
              <div v-if="k.description" class="kind-row__desc">{{ k.description }}</div>
            </div>
            <div class="kind-row__actions">
              <UiButton v-if="!k.builtin" variant="subtle" size="sm" @click="startEdit(k)">Edit</UiButton>
              <UiButton v-if="!k.builtin" variant="danger" size="sm" @click="removeKind(k)">Delete</UiButton>
            </div>
          </li>
          <li v-if="!kindStore.sorted.value.length" class="kinds-empty">
            No categories yet.
          </li>
        </ul>

        <div v-if="editingId === null" class="kinds-actions">
          <UiButton variant="primary" size="sm" @click="startCreate">+ Add category</UiButton>
        </div>

        <div v-else class="kind-form">
          <div class="field">
            <label class="field__label">
              Label
              <span class="field__hint">slug: <code>{{ draftIdPreview || '—' }}</code></span>
            </label>
            <UiInput v-model="draft.label" placeholder="Character" />
          </div>
          <div class="field field--grid">
            <div class="field">
              <label class="field__label">Color</label>
              <input v-model="draft.color" type="color" class="color-picker" />
            </div>
            <div class="field">
              <label class="field__label">Icon</label>
              <UiIconPicker v-model="draft.icon" />
            </div>
          </div>
          <div class="field">
            <label class="field__label">Description (optional)</label>
            <UiTextarea v-model="draft.description" :rows="2" />
          </div>
          <p v-if="draftError" class="kind-form__err">{{ draftError }}</p>
          <div class="kind-form__actions">
            <UiButton variant="subtle" size="sm" :disabled="draftBusy" @click="cancelEdit">
              Cancel
            </UiButton>
            <UiButton variant="primary" size="sm" :loading="draftBusy" @click="saveDraft">
              {{ editingId === '' ? 'Create' : 'Save' }}
            </UiButton>
          </div>
        </div>
      </UiCard>
    </UiSection>

    <UiSection title="Workspace" description="Defaults applied when creating notes.">
      <UiCard>
        <div class="field field--row">
          <UiSwitch v-model="settings.showRightPanel" label="Show right panel by default" />
        </div>
        <div class="field">
          <label class="field__label">Default kind</label>
          <UiSelect :modelValue="settings.defaultKind" :options="KIND_OPTIONS" @update:modelValue="selectKind" />
        </div>
        <div class="field">
          <label class="field__label">Default editor mode</label>
          <UiSelect :modelValue="settings.defaultEditorMode" :options="EDITOR_MODE_OPTIONS"
            @update:modelValue="selectEditorMode" />
        </div>
        <template #footer>
          <UiButton variant="primary" @click="save">Save workspace</UiButton>
        </template>
      </UiCard>
    </UiSection>

    <UiSection title="Maintenance" description="Rebuild derived data without losing notes.">
      <UiCard>
        <div class="danger">
          <div class="danger__text">
            <strong>Rebuild semantic index</strong>
            <p>
              Re-embeds every note with the current embedding model. Run this
              after changing the embedding model or when semantic search
              quality looks poor.
            </p>
          </div>
          <div class="danger__action">
            <UiButton variant="primary" :loading="reindexing" @click="reindexEmbeddings">
              <template #icon-left>
                <Icon name="refresh" :size="14" />
              </template>
              Rebuild index
            </UiButton>
          </div>
        </div>
        <p v-if="reindexResult" class="danger__err" style="color: var(--fg-muted);">{{ reindexResult }}</p>
      </UiCard>
    </UiSection>

    <UiSection title="Danger zone" description="Irreversible operations. Be sure before proceeding.">
      <UiCard>
        <div class="danger">
          <div class="danger__text">
            <strong>Clear all notes</strong>
            <p>
              Permanently removes every note from the database. Backlinks and
              embeddings are deleted with them.
            </p>
          </div>
          <div class="danger__action">
            <UiBadge v-if="!bulkDeleteAvailable" tone="neutral">
              API not available
            </UiBadge>
            <UiButton variant="danger" :disabled="!bulkDeleteAvailable"
              :title="!bulkDeleteAvailable ? 'No bulk-delete endpoint exposed' : ''" @click="clearAllNotes">
              <template #icon-left>
                <Icon name="trash" :size="14" />
              </template>
              Clear all notes
            </UiButton>
          </div>
        </div>
        <p v-if="clearError" class="danger__err">{{ clearError }}</p>
      </UiCard>
    </UiSection>
  </div>

  <!-- Delete category confirmation -->
  <UiConfirmModal :model-value="confirmDeleteTarget !== null" title="Delete category" :message="confirmDeleteMessage"
    confirm-label="Delete" confirm-variant="danger" @confirm="executeDeleteKind" @cancel="confirmDeleteTarget = null"
    @update:model-value="(v) => { if (!v) confirmDeleteTarget = null; }" />

  <!-- Clear all notes confirmation -->
  <UiConfirmModal v-model="confirmClearAllVisible" title="Clear all notes"
    message="Permanently removes every note from the database. Backlinks and embeddings are deleted with them. This cannot be undone."
    confirm-label="Clear all" confirm-variant="danger" @confirm="executeClearAllNotes" />
</template>

<style scoped>
.settings {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-14);
  padding: var(--space-4) var(--space-2) var(--space-20);
}

.settings__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-8);
}

.settings__title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-2xl);
  font-weight: var(--font-weight-semibold);
  color: var(--fg-strong);
  letter-spacing: var(--tracking-tight);
}

.settings__sub {
  margin: 0;
  font-size: var(--text-base);
  color: var(--fg-muted);
}

.settings__saved {
  font-size: var(--text-sm);
  color: var(--success);
  align-self: center;
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.field--row {
  flex-direction: row;
  align-items: center;
}

.field__label {
  display: flex;
  justify-content: space-between;
  font-size: var(--text-sm);
  font-weight: var(--font-weight-medium);
  color: var(--fg-strong);
}

.field__hint {
  color: var(--fg-subtle);
  font-weight: var(--font-weight-regular);
}

.field__desc {
  margin: var(--space-1) 0 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
  line-height: var(--leading-normal);
}

.danger {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--space-8);
}

.danger__text strong {
  display: block;
  font-size: var(--text-base);
  color: var(--fg-strong);
  margin-bottom: var(--space-2);
}

.danger__text p {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--fg-muted);
  line-height: var(--leading-normal);
}

.danger__action {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-shrink: 0;
}

.danger__err {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-sm);
}

/* ===== Categories ===== */
.kinds-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.kind-row {
  display: flex;
  align-items: center;
  gap: var(--space-5);
  padding: var(--space-4) var(--space-5);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-soft);
}

.kind-swatch {
  width: 24px;
  height: 24px;
  border-radius: var(--radius-xs);
  border: var(--border-width-1) solid var(--border);
  flex-shrink: 0;
}

.kind-row__icon {
  color: var(--fg-muted);
  flex-shrink: 0;
}

.kind-row__meta {
  flex: 1;
  min-width: 0;
}

.kind-row__title {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  font-size: var(--text-base);
  font-weight: var(--font-weight-medium);
  color: var(--fg-strong);
}

.kind-row__slug {
  font-size: var(--text-xs);
  color: var(--fg-subtle);
  background: var(--bg-elev);
  padding: 1px var(--space-3);
  border-radius: var(--radius-xs);
}

.kind-row__desc {
  margin-top: var(--space-1);
  font-size: var(--text-sm);
  color: var(--fg-muted);
  line-height: var(--leading-snug);
}

.kind-row__actions {
  display: flex;
  gap: var(--space-3);
  flex-shrink: 0;
}

.kinds-empty {
  color: var(--fg-subtle);
  font-size: var(--text-sm);
  padding: var(--space-4) var(--space-2);
}

.kinds-actions {
  display: flex;
  justify-content: flex-end;
}

.kind-form {
  margin-top: var(--space-6);
  padding: var(--space-6);
  border: var(--border-width-1) dashed var(--border);
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.field--grid {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-8);
  align-items: start;
}

.color-picker {
  width: 48px;
  height: 32px;
  padding: 0;
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-xs);
  background: transparent;
  cursor: pointer;
}

.icon-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(36px, 1fr));
  gap: var(--space-2);
}

.icon-tile {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--bg-elev);
  border: var(--border-width-1) solid var(--border);
  border-radius: var(--radius-xs);
  color: var(--fg-muted);
  cursor: pointer;
  transition:
    background-color var(--duration-fast) var(--ease-standard),
    border-color var(--duration-fast) var(--ease-standard),
    color var(--duration-fast) var(--ease-standard);
}

.icon-tile:hover {
  background: var(--bg-soft);
  color: var(--fg);
}

.icon-tile.active {
  border-color: var(--accent);
  color: var(--accent);
}

.kind-form__err {
  margin: 0;
  color: var(--danger);
  font-size: var(--text-sm);
}

.kind-form__actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-4);
}
</style>
