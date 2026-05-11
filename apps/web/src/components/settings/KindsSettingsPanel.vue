<script setup lang="ts">
/**
 * KindsSettingsPanel — CRUD for note categories (kinds).
 *
 * Owns the inline create/edit form, the listing, and the "delete kind"
 * confirmation flow. The kinds registry is a global singleton via
 * `useKinds`, so any other consumer (sidebar chips, graph palette, etc.)
 * picks up changes automatically without prop wiring.
 */
import { computed, ref } from 'vue';
import {
    UiBadge,
    UiButton,
    UiCard,
    UiConfirmModal,
    UiIconPicker,
    UiInput,
    UiSection,
    UiTextarea,
    Icon,
} from '@/components/ui';
import { DEFAULT_KIND_ICON } from '@/assets/kindIcons';
import { useKinds } from '@/composables/useKinds';
import type { KindDefinition } from '@continuum/shared';

const emit = defineEmits<{
    /** Fired when a kind is deleted so the parent can re-point the
     *  default-kind preference if it referenced the deleted id. */
    (e: 'kind-removed', id: string): void;
}>();

const kindStore = useKinds();

interface KindDraft {
    id: string;        // empty when creating; preview-only
    label: string;
    color: string;
    icon: string;
    description: string;
}

function emptyDraft(): KindDraft {
    return { id: '', label: '', color: '#A09B90', icon: DEFAULT_KIND_ICON, description: '' };
}

const editingId = ref<string | null>(null); // null = not editing, '' = creating new
const draft = ref<KindDraft>(emptyDraft());
const draftError = ref('');
const draftBusy = ref(false);
const confirmDeleteTarget = ref<KindDefinition | null>(null);

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
        emit('kind-removed', k.id);
    } catch (e) {
        draftError.value = e instanceof Error ? e.message : String(e);
    }
}

const confirmDeleteMessage = computed<string>(() =>
    confirmDeleteTarget.value
        ? `Delete "${confirmDeleteTarget.value.label}"? Notes using it will be reassigned to "note".`
        : '',
);
</script>

<template>
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

    <UiConfirmModal :model-value="confirmDeleteTarget !== null" title="Delete category" :message="confirmDeleteMessage"
        confirm-label="Delete" confirm-variant="danger" @confirm="executeDeleteKind"
        @cancel="confirmDeleteTarget = null" @update:model-value="(v) => { if (!v) confirmDeleteTarget = null; }" />
</template>

<style scoped>
.field {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
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
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-0);
}

.kind-swatch {
    width: 20px;
    height: 20px;
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
    gap: var(--space-3);
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
    margin-top: var(--space-5);
    padding: var(--space-5);
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
