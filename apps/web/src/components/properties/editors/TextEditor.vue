<script setup lang="ts">
/**
 * Single-line text property editor.
 * Saves on blur (via emit) — the parent debounces persistence.
 */
import { computed } from 'vue';
import {
    PROPERTY_TYPE_PLACEHOLDERS,
    type PropertyDefinition,
    type TextConfig,
    type TextValue,
} from '@continuum/shared';

const props = defineProps<{
    value: TextValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: TextValue] }>();

const local = computed(() => props.value?.value ?? '');
const cfg = computed<TextConfig>(() => props.definition.config as TextConfig);
const maxLength = computed(() => cfg.value.maxLength);
const placeholder = computed(() => {
    return cfg.value.placeholder ?? PROPERTY_TYPE_PLACEHOLDERS.text;
});

function onInput(e: Event): void {
    const input = e.target as HTMLInputElement;
    const limit = maxLength.value;
    const next = limit && input.value.length > limit ? input.value.slice(0, limit) : input.value;
    if (next !== input.value) input.value = next;
    emit('update:value', { type: 'text', value: next });
}
</script>

<template>
    <input class="prop-editor" type="text" :value="local" :placeholder="placeholder" :spellcheck="false"
        :maxlength="maxLength" @input="onInput" />
</template>

<style scoped>
.prop-editor {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    text-overflow: ellipsis;
    transition: background var(--duration-fast) var(--ease-standard);
}

.prop-editor::placeholder {
    color: var(--fg-subtle);
}

.prop-editor:hover {
    background: var(--bg-soft);
}

.prop-editor:focus {
    background: var(--bg-soft);
}
</style>
