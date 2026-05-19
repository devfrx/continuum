<script setup lang="ts">
/**
 * Multi-line text property editor (auto-grows).
 */
import { computed, nextTick, ref, watch } from 'vue';
import {
    PROPERTY_TYPE_PLACEHOLDERS,
    type LongTextConfig,
    type LongTextValue,
    type PropertyDefinition,
} from '@continuum/shared';

const props = defineProps<{
    value: LongTextValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: LongTextValue] }>();

const local = computed(() => props.value?.value ?? '');
const cfg = computed<LongTextConfig>(() => props.definition.config as LongTextConfig);
const maxLength = computed(() => cfg.value.maxLength);
const placeholder = computed(() => {
    return cfg.value.placeholder ?? PROPERTY_TYPE_PLACEHOLDERS.longText;
});

const ref_ = ref<HTMLTextAreaElement | null>(null);

function autosize(): void {
    const el = ref_.value;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
}

watch(local, () => {
    void nextTick(autosize);
}, { immediate: true });

function onInput(e: Event): void {
    const textarea = e.target as HTMLTextAreaElement;
    const limit = maxLength.value;
    const next = limit && textarea.value.length > limit
        ? textarea.value.slice(0, limit)
        : textarea.value;
    if (next !== textarea.value) textarea.value = next;
    emit('update:value', {
        type: 'longText',
        value: next,
    });
    autosize();
}
</script>

<template>
    <textarea ref="ref_" class="prop-editor" rows="1" :value="local" :placeholder="placeholder" :spellcheck="false"
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
    resize: none;
    overflow: hidden;
    transition: background var(--duration-fast) var(--ease-standard);
}

.prop-editor::placeholder {
    color: var(--fg-subtle);
}

.prop-editor:hover,
.prop-editor:focus {
    background: var(--bg-soft);
}
</style>
