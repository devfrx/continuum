<script setup lang="ts">
import { Icon, UiButton } from '@/components/ui';

const emit = defineEmits<{ (e: 'create'): void }>();
</script>

<template>
    <div class="empty-editor">
        <section class="empty-editor__surface" aria-label="No note selected">
            <div class="empty-editor__mark">
                <Icon name="notes" :size="24" />
            </div>
            <div class="empty-editor__copy">
                <span class="empty-editor__eyebrow">Notebook</span>
                <h2>No note selected</h2>
                <p>Select a note or create a new one.</p>
            </div>
            <UiButton variant="primary" @click="emit('create')">
                <template #icon-left>
                    <Icon name="plus" :size="14" />
                </template>
                New note
            </UiButton>
        </section>
    </div>
</template>

<style scoped>
.empty-editor {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: var(--space-16);
}

.empty-editor__surface {
    display: grid;
    justify-items: center;
    gap: var(--space-6);
    max-width: 420px;
    text-align: center;
}

.empty-editor__mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: var(--radius-md);
    background: var(--surface-1);
    color: var(--fg-muted);
    border: var(--border-width-1) solid var(--border);
}

.empty-editor__copy {
    display: grid;
    gap: var(--space-3);
}

.empty-editor__eyebrow {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
}

.empty-editor__copy h2 {
    margin: 0;
    color: var(--fg-strong);
    font-size: var(--text-xl);
    font-weight: var(--font-weight-semibold);
}

.empty-editor__copy p {
    margin: 0;
    color: var(--fg-muted);
    font-size: var(--text-base);
    line-height: var(--leading-relaxed);
}
</style>
