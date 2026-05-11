<script setup lang="ts">
/**
 * AiProviderSettingsPanel — chat & embedding model selection plus the
 * shared workspace defaults (default kind, default editor mode, …).
 *
 * Persists the same `continuum.settings.v2` localStorage blob the legacy
 * SettingsView used. The blob is also read by other consumers (e.g. the
 * editor mode toggle) so the storage key is the contract.
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
    UiBadge,
    UiButton,
    UiCard,
    UiInput,
    UiSection,
    UiSelect,
    UiSwitch,
    Icon,
} from '@/components/ui';
import { useAiHealth } from '@/composables/useAiHealth';
import { useKinds } from '@/composables/useKinds';
import ProviderStatusPanel from '@/components/settings/ProviderStatusPanel.vue';
import type { AiProviderName, EntityKind } from '@continuum/shared';

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

const { health, loading, embeddingsAvailable, refresh: refreshHealth } = useAiHealth();
const kindStore = useKinds();
const settings = ref<Settings>(loadSettings());
const saved = ref(false);
const temperatureText = ref(settings.value.temperature.toString());

const KIND_OPTIONS = computed<{ label: string; value: string }[]>(() =>
    kindStore.sorted.value.map((k) => ({ label: k.label, value: k.id })),
);

const EDITOR_MODE_OPTIONS: { label: string; value: string }[] = [
    { label: 'WYSIWYG (rich)', value: 'wysiwyg' },
    { label: 'Markdown (plain)', value: 'markdown' },
];

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

async function refresh() {
    await refreshHealth();
    if (!settings.value.primary && health.value) {
        settings.value.primary = health.value.primary;
    }
}

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

/**
 * Public hook for sibling panels (Kinds): if a kind referenced by
 * `defaultKind` is deleted, fall back to the built-in `note`.
 */
function onKindRemoved(id: string): void {
    if (settings.value.defaultKind === id) {
        settings.value.defaultKind = 'note';
        persist();
    }
}

defineExpose({ onKindRemoved, refresh });

onMounted(() => {
    void refresh();
    void kindStore.load();
});
</script>

<template>
    <UiSection title="Provider status" description="Status of locally-configured AI runtimes.">
        <div class="provider-status-toolbar">
            <UiButton variant="subtle" :loading="loading" @click="refresh">
                <template #icon-left>
                    <Icon name="refresh" :size="14" />
                </template>
                {{ loading ? 'Checking…' : 'Refresh providers' }}
            </UiButton>
        </div>
        <ProviderStatusPanel :health="health" :loading="loading" />
    </UiSection>

    <UiSection title="AI Providers" description="Choose which models drive chat and embeddings.">
        <UiCard>
            <div class="field">
                <label class="field__label">Chat model</label>
                <UiSelect :modelValue="settings.chatModel" :options="modelOptions"
                    @update:modelValue="selectChatModel" />
            </div>
            <div class="field">
                <label class="field__label">
                    Embedding model
                    <UiBadge v-if="!embeddingsAvailable" tone="neutral">No embedding model loaded</UiBadge>
                </label>
                <UiSelect :modelValue="settings.embedModel" :options="modelOptions" :disabled="!embeddingsAvailable"
                    @update:modelValue="selectEmbedModel" />
                <p v-if="!embeddingsAvailable" class="field__desc">
                    Load an embedding model in your provider (e.g. <code>nomic-embed-text</code>) to enable
                    semantic search and re-indexing.
                </p>
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
</template>

<style scoped>
.settings__saved {
    font-size: var(--text-sm);
    color: var(--success);
    align-self: center;
}

.provider-status-toolbar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--space-4);
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
</style>
