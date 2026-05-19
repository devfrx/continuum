<script setup lang="ts">
/**
 * PropertySettingsRow.vue — one labelled row inside a settings panel.
 *
 * Provides the consistent "label on the left, control on the right"
 * layout used across every per-type panel. A short `hint` slot renders
 * below the row in a muted style for explanatory copy. The control
 * lives in the default slot so panels stay declarative.
 */
defineProps<{
    label: string;
    /** Stack the control under the label instead of side-by-side. */
    stacked?: boolean;
}>();
</script>

<template>
    <label class="prop-set-row" :class="{ 'prop-set-row--stacked': stacked }">
        <span class="prop-set-row__label">{{ label }}</span>
        <span class="prop-set-row__control">
            <slot />
        </span>
        <span v-if="$slots.hint" class="prop-set-row__hint">
            <slot name="hint" />
        </span>
    </label>
</template>

<style scoped>
.prop-set-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
        'label control'
        'hint  hint';
    align-items: center;
    gap: var(--space-2) var(--space-3);
    padding: var(--space-2) 0;
    font-size: var(--text-sm);
}

.prop-set-row--stacked {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
        'label'
        'control'
        'hint';
    align-items: stretch;
    gap: var(--space-2);
}

.prop-set-row__label {
    grid-area: label;
    color: var(--fg-muted);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
}

.prop-set-row__control {
    grid-area: control;
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
    min-width: 0;
}

.prop-set-row--stacked .prop-set-row__control {
    justify-content: stretch;
}

.prop-set-row__hint {
    grid-area: hint;
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    line-height: var(--leading-snug);
}
</style>
