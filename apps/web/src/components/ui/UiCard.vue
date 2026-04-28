<script setup lang="ts">
interface Props {
    padded?: boolean;
    interactive?: boolean;
    as?: 'div' | 'article' | 'section';
}

withDefaults(defineProps<Props>(), {
    padded: true,
    interactive: false,
    as: 'div',
});
</script>

<template>
    <component :is="as" class="ui-card" :class="{ 'is-padded': padded, 'is-interactive': interactive }">
        <header v-if="$slots.header" class="ui-card__header">
            <slot name="header" />
        </header>
        <div class="ui-card__body">
            <slot />
        </div>
        <footer v-if="$slots.footer" class="ui-card__footer">
            <slot name="footer" />
        </footer>
    </component>
</template>

<style scoped>
.ui-card {
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-sm);
    transition:
        box-shadow var(--duration-base) var(--ease-standard),
        border-color var(--duration-base) var(--ease-standard),
        transform var(--duration-base) var(--ease-standard);
    display: flex;
    flex-direction: column;
}

.ui-card.is-padded {
    padding: var(--space-12) var(--space-10);
    gap: var(--space-6);
}

.ui-card.is-interactive {
    cursor: pointer;
}

.ui-card.is-interactive:hover {
    box-shadow: var(--shadow-md);
    border-color: var(--border-strong);
}

.ui-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-6);
}

.ui-card__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
}

.ui-card__footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-4);
    padding-top: var(--space-2);
}
</style>
