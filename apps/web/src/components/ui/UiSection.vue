<script setup lang="ts">
interface Props {
    title: string;
    description?: string;
}

defineProps<Props>();
</script>

<template>
    <section class="ui-section">
        <header class="ui-section__head">
            <h3 class="ui-section__title">{{ title }}</h3>
            <p v-if="description" class="ui-section__desc">{{ description }}</p>
        </header>
        <div class="ui-section__body">
            <slot />
        </div>
    </section>
</template>

<style scoped>
.ui-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.ui-section__head {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.ui-section__title {
    margin: 0;
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--fg-subtle);
}

.ui-section__desc {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--fg-muted);
    line-height: var(--leading-normal);
}

.ui-section__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}
</style>
