<script setup lang="ts">
/**
 * AddViewModal.vue — two-step "Add view" dialog.
 *
 * Step 1 (type)  : tile grid sourced from `VIEW_REGISTRY_LIST`. The
 *                  user picks the renderer that the new view will use.
 *                  Planned types are pickable; their renderer is the
 *                  shared `PlaceholderView`.
 * Step 2 (source): pick the datasource that backs the new view. The
 *                  user can either choose an existing datasource from
 *                  the list or create a brand-new one inline.
 *
 * Only when both pieces are picked does the modal emit `select` with
 * the full payload `{ type, dataSourceDatabaseId, name? }`. This keeps
 * the toolbar contract straightforward: it never needs to round-trip
 * back to the user to ask for the missing half.
 */
import { computed, ref, watch } from 'vue';
import { api } from '@/api';
import { UiModal, UiButton, UiInput, UiEmpty, Icon } from '@/components/ui';
import type { Database, DatabaseViewType } from '@continuum/shared';
import { VIEW_REGISTRY_LIST } from './views/registry';

const props = defineProps<{
    modelValue: boolean;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    select: [payload: { type: DatabaseViewType; dataSourceDatabaseId: string; name?: string }];
}>();

type Step = 'type' | 'source';

const step = ref<Step>('type');
const pickedType = ref<DatabaseViewType | null>(null);
const search = ref('');

const datasources = ref<Database[]>([]);
const loaded = ref(false);
const loading = ref(false);
const error = ref<string | null>(null);

// Inline "create new datasource" mini-form, lives entirely in this step.
const showCreate = ref(false);
const newTitle = ref('');
const creating = ref(false);

watch(
    () => props.modelValue,
    (open) => {
        if (open) {
            step.value = 'type';
            pickedType.value = null;
            search.value = '';
            showCreate.value = false;
            newTitle.value = '';
            error.value = null;
        }
    },
);

async function ensureLoaded(): Promise<void> {
    if (loaded.value || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
        datasources.value = await api.databases.list();
        loaded.value = true;
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not load datasources';
    } finally {
        loading.value = false;
    }
}

async function chooseType(type: DatabaseViewType): Promise<void> {
    pickedType.value = type;
    step.value = 'source';
    await ensureLoaded();
}

function backToTypes(): void {
    step.value = 'type';
    pickedType.value = null;
}

function close(): void {
    emit('update:modelValue', false);
}

const filtered = computed(() => {
    const q = search.value.trim().toLowerCase();
    if (!q) return datasources.value;
    return datasources.value.filter((d) => (d.title || '').toLowerCase().includes(q));
});

function pickSource(database: Database): void {
    if (!pickedType.value) return;
    emit('select', { type: pickedType.value, dataSourceDatabaseId: database.id });
    close();
}

async function createAndPick(): Promise<void> {
    if (!pickedType.value || creating.value) return;
    creating.value = true;
    error.value = null;
    try {
        const title = newTitle.value.trim() || 'Untitled datasource';
        const { database } = await api.databases.create({ title });
        datasources.value = [database, ...datasources.value];
        emit('select', { type: pickedType.value, dataSourceDatabaseId: database.id });
        close();
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Could not create datasource';
    } finally {
        creating.value = false;
    }
}
</script>

<template>
    <UiModal
        :model-value="modelValue"
        :title="step === 'type' ? 'Add a new view' : 'Pick a datasource'"
        @update:model-value="(v) => emit('update:modelValue', v)">
        <div class="add-view">
            <p class="add-view__hint" v-if="step === 'type'">
                Pick the layout for the new view. You'll choose its datasource next.
            </p>
            <p class="add-view__hint" v-else>
                Choose which datasource this view will render, or create a new one.
            </p>

            <ul v-if="step === 'type'" class="add-view__grid" role="radiogroup">
                <li v-for="entry in VIEW_REGISTRY_LIST" :key="entry.type">
                    <button
                        type="button"
                        class="add-view__tile"
                        :class="{ 'is-planned': entry.status === 'planned' }"
                        :title="entry.description"
                        @click="chooseType(entry.type)">
                        <Icon :name="entry.icon" :size="22" />
                        <span class="add-view__tile-label">{{ entry.label }}</span>
                        <span v-if="entry.status === 'planned'" class="add-view__tile-tag">soon</span>
                    </button>
                </li>
            </ul>

            <div v-else class="add-view__source">
                <p v-if="error" class="add-view__error">{{ error }}</p>

                <div v-if="!showCreate" class="add-view__source-list">
                    <UiInput v-model="search" placeholder="Search datasources…" :disabled="loading" />
                    <div v-if="loading" class="add-view__state">Loading…</div>
                    <ul v-else-if="filtered.length" class="add-view__list">
                        <li
                            v-for="db in filtered"
                            :key="db.id"
                            class="add-view__list-item"
                            @click="pickSource(db)">
                            <Icon :name="db.icon ?? 'database'" :size="14" />
                            <span>{{ db.title || 'Untitled datasource' }}</span>
                        </li>
                    </ul>
                    <UiEmpty v-else label="No datasources match" />
                </div>

                <form v-else class="add-view__create" @submit.prevent="createAndPick">
                    <UiInput
                        v-model="newTitle"
                        placeholder="New datasource title"
                        autofocus
                        :disabled="creating" />
                </form>
            </div>
        </div>
        <template #footer>
            <UiButton
                v-if="step === 'type'"
                variant="ghost"
                type="button"
                @click="close">
                Cancel
            </UiButton>
            <template v-else>
                <UiButton variant="ghost" type="button" @click="backToTypes">Back</UiButton>
                <UiButton
                    v-if="!showCreate"
                    variant="ghost"
                    type="button"
                    @click="() => { showCreate = true; newTitle = ''; }">
                    <Icon name="plus" :size="12" /> New datasource
                </UiButton>
                <template v-else>
                    <UiButton variant="ghost" type="button" @click="() => { showCreate = false; }">
                        Cancel new
                    </UiButton>
                    <UiButton type="button" :disabled="creating" @click="createAndPick">
                        {{ creating ? 'Creating…' : 'Create & use' }}
                    </UiButton>
                </template>
            </template>
        </template>
    </UiModal>
</template>

<style scoped>
.add-view {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.add-view__hint {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-snug, 1.4);
}

.add-view__grid {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-2);
}

.add-view__tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-4) var(--space-3);
    border: var(--border-width-1) solid var(--border);
    background: var(--surface-1);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font: inherit;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard);
}

.add-view__tile:hover {
    background: var(--surface-hover);
    border-color: var(--border-strong);
}

.add-view__tile:active {
    transform: scale(0.985);
}

.add-view__tile-label {
    font-size: var(--text-sm);
    font-weight: var(--font-weight-medium);
    line-height: var(--leading-tight);
}

.add-view__tile-tag {
    position: absolute;
    top: var(--space-1);
    right: var(--space-1);
    font-size: var(--text-2xs);
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: var(--font-weight-semibold);
}

.add-view__tile.is-planned {
    color: var(--text-muted);
}

.add-view__source {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}
.add-view__source-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}
.add-view__create {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.add-view__list {
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    max-height: 240px;
    overflow-y: auto;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
}

.add-view__list-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    font-size: var(--text-sm);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.add-view__list-item:hover {
    background: var(--surface-hover);
}

.add-view__state {
    color: var(--text-muted);
    font-size: var(--text-xs);
    padding: var(--space-3);
    text-align: center;
}

.add-view__error {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--danger-faint);
    border: var(--border-width-1) solid var(--danger-border);
    color: var(--danger);
    font-size: var(--text-xs);
}
</style>
