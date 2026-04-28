<script setup lang="ts">
import { computed } from 'vue';

interface Props {
    title?: string;
    description?: string;
    /** Alias for `description` (used by some legacy consumers). */
    message?: string;
    /** Reduces vertical padding for inline use inside panels. */
    compact?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
    compact: false,
});

const desc = computed(() => props.description ?? props.message);
</script>

<template>
    <div class="ui-empty" :class="{ 'is-compact': compact }">
        <div v-if="$slots.icon" class="ui-empty__icon">
            <slot name="icon" />
        </div>
        <h4 v-if="title" class="ui-empty__title">{{ title }}</h4>
        <p v-if="desc" class="ui-empty__desc">{{ desc }}</p>
        <div v-if="$slots.action" class="ui-empty__action">
            <slot name="action" />
        </div>
    </div>
</template>

<style scoped>
.ui-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: var(--space-16) var(--space-10);
    color: var(--fg-muted);
    gap: var(--space-4);
}

.ui-empty__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--fg-subtle);
    margin-bottom: var(--space-2);
}

.ui-empty__title {
    margin: 0;
    font-size: var(--text-md);
    font-weight: var(--font-weight-semibold);
    color: var(--fg-strong);
}

.ui-empty__desc {
    margin: 0;
    font-size: var(--text-base);
    color: var(--fg-muted);
    max-width: 340px;
    line-height: var(--leading-normal);
}

.ui-empty__action {
    margin-top: var(--space-4);
}

.ui-empty.is-compact {
    padding: var(--space-7) var(--space-6);
    gap: var(--space-2);
}

.ui-empty.is-compact .ui-empty__title {
    font-size: var(--text-base);
}

.ui-empty.is-compact .ui-empty__desc {
    font-size: var(--text-sm);
}
</style>
