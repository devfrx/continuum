<script setup lang="ts">
/**
 * DataSourcePanel.vue — content of the "Data source" section.
 *
 * Lets the user swap the datasource this view resolves against. With
 * the new model each block view targets exactly one datasource (no
 * parent/override concept), so the panel is just a flat picker:
 *
 *   – Click any row → emit `change-source` with that UUID.
 *   – The currently-bound datasource is badged "current"; clicking it
 *     is a no-op (parent toolbar can collapse the popover anyway).
 *
 * Datasource catalogue management (rename / delete / archive) lives in
 * the dedicated `/databases` manager view, not here.
 */
import { onMounted, ref } from 'vue';
import { api } from '@/api';
import { Icon } from '@/components/ui';
import type { Database, DatabaseView } from '@continuum/shared';

const props = defineProps<{
    view: DatabaseView;
    /**
     * Datasource id currently resolved for this view (matches
     * `view.dataSourceDatabaseId`; passed separately so the body can
     * override for diagnostics / future scopes without re-rendering).
     */
    activeDatasourceId: string | null;
}>();

const emit = defineEmits<{
    'change-source': [databaseId: string];
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
        error.value = err instanceof Error ? err.message : 'Failed to load datasources';
    } finally {
        loading.value = false;
    }
}

onMounted(load);

function pickDatabase(database: Database): void {
    if (database.id === props.activeDatasourceId) return;
    emit('change-source', database.id);
}
</script>

<template>
    <div class="data-source">
        <p class="data-source__hint">
            Choose which datasource this view resolves rows and schema against. Changing the datasource resets this view's layout to the defaults of the new source.
        </p>
        <div v-if="loading" class="data-source__empty">Loading…</div>
        <div v-else-if="error" class="data-source__error">{{ error }}</div>
        <ul v-else class="data-source__list">
            <li
                v-for="db in databases"
                :key="db.id"
                class="data-source__item"
                :class="{ 'is-active': db.id === activeDatasourceId }"
                @click.stop="pickDatabase(db)">
                <Icon :name="db.icon ?? 'database'" :size="14" />
                <span class="data-source__name">{{ db.title || 'Untitled datasource' }}</span>
                <span v-if="db.id === activeDatasourceId" class="data-source__badge data-source__badge--active">current</span>
            </li>
        </ul>
    </div>
</template>

<style scoped>
.data-source {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
}

.data-source__hint {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
    line-height: var(--leading-snug, 1.4);
}

.data-source__empty {
    color: var(--text-muted);
    font-size: var(--text-xs);
    padding: var(--space-3) var(--space-2);
    text-align: center;
}

.data-source__error {
    color: var(--danger);
    font-size: var(--text-xs);
    background: var(--danger-faint);
    border: var(--border-width-1) solid var(--danger-border);
    border-radius: var(--radius-sm);
    padding: var(--space-2) var(--space-3);
}

.data-source__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-px);
}

.data-source__item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--text-primary);
    font-size: var(--text-sm);
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.data-source__item:hover {
    background: var(--surface-hover);
}

.data-source__item.is-active {
    background: var(--surface-selected);
}

.data-source__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.data-source__badge {
    font-size: var(--text-2xs);
    color: var(--text-muted);
    padding: 1px var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-3);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: var(--font-weight-semibold);
}

.data-source__badge--active {
    color: var(--accent);
    background: var(--accent-faint);
}
</style>
