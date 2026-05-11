<script setup lang="ts">
/**
 * MaintenanceSettingsPanel — destructive operations against the
 * underlying note store: rebuild semantic embeddings and bulk-delete
 * every note. Both flows are gated behind a confirm modal.
 */
import { ref } from 'vue';
import {
    UiBadge,
    UiButton,
    UiCard,
    UiConfirmModal,
    UiSection,
    Icon,
} from '@/components/ui';
import { api } from '@/api';
import { useAiHealth } from '@/composables/useAiHealth';

const { embeddingsAvailable } = useAiHealth();

const reindexing = ref(false);
const reindexResult = ref<string>('');

async function reindexEmbeddings(): Promise<void> {
    if (!embeddingsAvailable.value) return;
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

// Bulk-delete is exposed as `DELETE /api/notes`; cascade FKs wipe embeddings
// and links in the same statement. The UI still requires the confirmation
// modal below — there's no "undo".
const bulkDeleteAvailable = true;
const clearingAll = ref(false);
const clearError = ref('');
const confirmClearAllVisible = ref(false);

function clearAllNotes(): void {
    if (!bulkDeleteAvailable) return;
    confirmClearAllVisible.value = true;
}

async function executeClearAllNotes(): Promise<void> {
    confirmClearAllVisible.value = false;
    clearError.value = '';
    clearingAll.value = true;
    try {
        const res = await api.notes.removeAll();
        reindexResult.value = `Cleared ${res.deleted} notes.`;
    } catch (e) {
        clearError.value = e instanceof Error ? e.message : String(e);
    } finally {
        clearingAll.value = false;
    }
}
</script>

<template>
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
                    <UiBadge v-if="!embeddingsAvailable" tone="neutral">No embedding model loaded</UiBadge>
                    <UiButton variant="primary" :loading="reindexing" :disabled="!embeddingsAvailable"
                        :title="!embeddingsAvailable ? 'Load an embedding model in your provider to enable re-indexing' : ''"
                        @click="reindexEmbeddings">
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
                    <UiButton variant="danger" :loading="clearingAll" :disabled="!bulkDeleteAvailable"
                        :title="!bulkDeleteAvailable ? 'No bulk-delete endpoint exposed' : 'Permanently delete every note'"
                        @click="clearAllNotes">
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

    <UiConfirmModal v-model="confirmClearAllVisible" title="Clear all notes"
        message="Permanently removes every note from the database. Backlinks and embeddings are deleted with them. This cannot be undone."
        confirm-label="Clear all" confirm-variant="danger" @confirm="executeClearAllNotes" />
</template>

<style scoped>
.danger {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-6);
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
</style>
