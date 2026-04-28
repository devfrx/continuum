<script setup lang="ts">
import { UiButton, UiEmpty } from '@/components/ui';

const emit = defineEmits<{ (e: 'create'): void }>();
</script>

<template>
    <div class="empty-editor">
        <UiEmpty title="Select or create a note"
            description="Pick a note from the sidebar, or start a new one to begin writing.">
            <template #action>
                <UiButton variant="primary" @click="emit('create')">+ New note</UiButton>
            </template>
        </UiEmpty>
    </div>
</template>

<style scoped>
.empty-editor {
    display: grid;
    place-items: center;
    height: 100%;
    padding: var(--space-16);
}
</style>
