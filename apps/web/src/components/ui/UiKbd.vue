<script setup lang="ts"></script>

<template>
    <kbd class="ui-kbd">
        <slot />
    </kbd>
</template>

<style scoped>
.ui-kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    padding: var(--space-1) var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--fg-muted);
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-xs);
    box-shadow: var(--shadow-sm);
    line-height: 1;
}
</style>
