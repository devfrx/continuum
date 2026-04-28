<script setup lang="ts">
interface Props {
    modelValue: string;
    placeholder?: string;
    rows?: number;
    mono?: boolean;
    disabled?: boolean;
}

withDefaults(defineProps<Props>(), {
    rows: 4,
    mono: false,
    disabled: false,
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function onInput(e: Event) {
    emit('update:modelValue', (e.target as HTMLTextAreaElement).value);
}
</script>

<template>
    <div class="ui-textarea" :class="{ 'is-disabled': disabled, 'is-mono': mono }">
        <textarea :value="modelValue" :placeholder="placeholder" :rows="rows" :disabled="disabled" @input="onInput" />
    </div>
</template>

<style scoped>
.ui-textarea {
    display: block;
    width: 100%;
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    transition:
        border-color var(--duration-fast) var(--ease-standard),
        box-shadow var(--duration-fast) var(--ease-standard);
}

.ui-textarea:hover {
    border-color: var(--border-strong);
}

.ui-textarea:focus-within {
    border-color: var(--border-strong);
    box-shadow: none;
}

.ui-textarea.is-disabled {
    opacity: 0.5;
}

.ui-textarea textarea {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-base);
    padding: var(--space-5) var(--space-6);
    resize: vertical;
    min-height: 60px;
    line-height: var(--leading-normal);
}

.ui-textarea.is-mono textarea {
    font-family: var(--font-mono);
    font-size: var(--text-sm);
}

.ui-textarea textarea::placeholder {
    color: var(--fg-subtle);
}
</style>
