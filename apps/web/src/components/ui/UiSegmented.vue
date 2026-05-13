<script setup lang="ts">
interface Option {
    label: string;
    value: string;
}

interface Props {
    modelValue: string;
    options: Option[];
    size?: 'sm' | 'md';
    fill?: boolean;
}

withDefaults(defineProps<Props>(), {
    size: 'md',
    fill: false,
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
    <div class="ui-seg" :class="[`ui-seg--${size}`, { 'ui-seg--fill': fill }]" role="tablist">
        <button v-for="opt in options" :key="opt.value" type="button" role="tab"
            :aria-selected="modelValue === opt.value"
            :class="['ui-seg__btn', { 'is-active': modelValue === opt.value }]"
            @click="emit('update:modelValue', opt.value)">
            {{ opt.label }}
        </button>
    </div>
</template>

<style scoped>
/**
 * Segmented control.
 *
 * The track has an intrinsic height (defaults to 32px / 28px for `sm`) that
 * the parent can override via the `--ui-seg-h` custom property. Buttons
 * stretch to fill the track height with `padding-block: 0`, so the active
 * pill never grows beyond the track regardless of its `box-shadow`.
 */
.ui-seg {
    display: inline-flex;
    align-items: stretch;
    background: var(--bg-soft);
    padding: 2px;
    border-radius: var(--radius-sm);
    border: var(--border-width-1) solid var(--border);
    gap: 2px;
    height: var(--ui-seg-h, 32px);
    box-sizing: border-box;
}

.ui-seg--sm {
    height: var(--ui-seg-h, 28px);
}

.ui-seg--fill {
    width: 100%;
}

.ui-seg__btn {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--fg-muted);
    font: inherit;
    cursor: pointer;
    padding: 0 var(--space-5);
    border-radius: calc(var(--radius-sm) - 2px);
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        box-shadow var(--duration-fast) var(--ease-standard);
    font-weight: var(--font-weight-medium);
}

.ui-seg--fill .ui-seg__btn {
    flex: 1 1 0;
    min-width: 0;
    padding-inline: var(--space-2);
}

.ui-seg--sm .ui-seg__btn {
    padding: 0 var(--space-4);
    font-size: var(--text-sm);
}

.ui-seg--md .ui-seg__btn {
    font-size: var(--text-sm);
}

.ui-seg__btn:hover {
    color: var(--fg);
}

.ui-seg__btn.is-active {
    background: var(--bg-elev, var(--bg-elevated, var(--bg)));
    color: var(--fg-strong);
    box-shadow: var(--shadow-sm);
}
</style>
