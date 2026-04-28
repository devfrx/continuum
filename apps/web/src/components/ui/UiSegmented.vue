<script setup lang="ts">
interface Option {
    label: string;
    value: string;
}

interface Props {
    modelValue: string;
    options: Option[];
    size?: 'sm' | 'md';
}

withDefaults(defineProps<Props>(), {
    size: 'md',
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
</script>

<template>
    <div class="ui-seg" :class="`ui-seg--${size}`" role="tablist">
        <button v-for="opt in options" :key="opt.value" type="button" role="tab"
            :aria-selected="modelValue === opt.value"
            :class="['ui-seg__btn', { 'is-active': modelValue === opt.value }]"
            @click="emit('update:modelValue', opt.value)">
            {{ opt.label }}
        </button>
    </div>
</template>

<style scoped>
.ui-seg {
    display: inline-flex;
    background: var(--bg-soft);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    border: var(--border-width-1) solid var(--border);
    gap: var(--space-1);
}

.ui-seg__btn {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--fg-muted);
    font: inherit;
    cursor: pointer;
    padding: var(--space-3) var(--space-6);
    border-radius: var(--radius-xs);
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard),
        box-shadow var(--duration-fast) var(--ease-standard);
    font-weight: var(--font-weight-medium);
}

.ui-seg--sm .ui-seg__btn {
    padding: var(--space-2) var(--space-5);
    font-size: var(--text-sm);
}

.ui-seg--md .ui-seg__btn {
    font-size: var(--text-base);
}

.ui-seg__btn:hover {
    color: var(--fg);
}

.ui-seg__btn.is-active {
    background: var(--bg-elev);
    color: var(--fg-strong);
    box-shadow: var(--shadow-sm);
}
</style>
