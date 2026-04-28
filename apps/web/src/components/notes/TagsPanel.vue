<script setup lang="ts">
import { UiSection, UiChip, UiEmpty } from '@/components/ui';

defineProps<{ tags: string[] }>();
</script>

<template>
    <UiSection title="Tags">
        <div v-if="tags.length" class="chip-row">
            <UiChip v-for="t in tags" :key="t">#{{ t }}</UiChip>
        </div>
        <UiEmpty v-else title="No tags" description="Add tags from the editor header to organize this note." />
    </UiSection>
</template>

<style scoped>
.chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
}
</style>
