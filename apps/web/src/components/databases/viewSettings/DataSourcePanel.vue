<script setup lang="ts">
/**
 * DataSourcePanel.vue — content of the "Data source" section.
 *
 * Extracted from `DatabaseViewSettings.vue` so the popover shell stays
 * thin and each section panel lives in its own file with focused
 * responsibilities. Lets the user override the database this view
 * resolves against; the parent block's `databaseId` stays put.
 *
 * Owns no business logic — emits `change-source` with the target db id
 * (or `null` to clear the override) and lets the toolbar lift it up to
 * `useDatabaseBundle.patchView`.
 */
import { onMounted, ref } from 'vue';
import { api } from '@/api';
import { Icon } from '@/components/ui';
import type { Database, DatabaseView } from '@continuum/shared';

const props = defineProps<{
    view: DatabaseView;
    /** Database id this view currently resolves against (parent or override). */
    effectiveDatabaseId: string;
    /** Parent block's database id — used as the fallback target. */
    parentDatabaseId: string;
}>();

const emit = defineEmits<{
    'change-source': [databaseId: string | null];
}>();

const databases = ref<Database[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);

async function load(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
        databases.value = await api.databases.list();
    } catch (err) {
        error.value = err instanceof Error ? err.message : 'Failed to load databases';
    } finally {
        loading.value = false;
    }
}

onMounted(load);

const hasOverride = (): boolean =>
    !!props.view.dataSourceDatabaseId
    && props.view.dataSourceDatabaseId !== props.parentDatabaseId;

function pickDatabase(database: Database): void {
    // Picking the parent's database clears the override; any other choice sets it.
    const next = database.id === props.parentDatabaseId ? null : database.id;
    emit('change-source', next);
}
</script>

<template>
    <div class="data-source">
        <p class="data-source__hint">
            Choose which database this view resolves rows and schema against. Changing the source resets this view's layout to the defaults of the new database.
        </p>
        <div v-if="loading" class="data-source__empty">Loading…</div>
        <div v-else-if="error" class="data-source__error">{{ error }}</div>
        <ul v-else class="data-source__list">
            <li
                v-for="db in databases"
                :key="db.id"
                class="data-source__item"
                :class="{ 'is-active': db.id === effectiveDatabaseId }"
                @click.stop="pickDatabase(db)">
                <Icon :name="(db.icon as never) ?? 'database'" :size="14" />
                <span class="data-source__name">{{ db.title || 'Untitled database' }}</span>
                <span v-if="db.id === parentDatabaseId" class="data-source__badge">block default</span>
                <span v-else-if="db.id === effectiveDatabaseId" class="data-source__badge data-source__badge--active">current</span>
            </li>
        </ul>
        <button
            v-if="hasOverride()"
            type="button"
            class="data-source__clear"
            @click="emit('change-source', null)">
            <Icon name="refresh" :size="12" />
            <span>Reset to block default</span>
        </button>
    </div>
</template>

<style scoped>
.data-source {
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
}

.data-source__hint {
    margin: 0;
    color: var(--fg-muted, #a09b90);
    font-size: 0.72rem;
    line-height: 1.35;
}

.data-source__error {
    color: var(--danger, #b85c5c);
    font-size: 0.72rem;
}

.data-source__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
}

.data-source__item {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.45rem;
    border-radius: 4px;
    cursor: pointer;
    color: var(--fg, #ededed);
}

.data-source__item:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.04));
}

.data-source__item.is-active {
    background: var(--surface-hover, rgba(255, 255, 255, 0.06));
}

.data-source__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.data-source__badge {
    font-size: 0.65rem;
    color: var(--fg-muted, #a09b90);
    padding: 0.05rem 0.3rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.06);
}

.data-source__badge--active {
    color: var(--accent, #e8dcc8);
    background: var(--accent-faint, rgba(232, 220, 200, 0.12));
}

.data-source__clear {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.3rem 0.5rem;
    border: var(--border-width-1, 1px) solid var(--border, rgba(255, 255, 255, 0.12));
    background: transparent;
    color: var(--fg, #ededed);
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.72rem;
}

.data-source__clear:hover {
    background: var(--surface-hover, rgba(255, 255, 255, 0.04));
}
</style>
