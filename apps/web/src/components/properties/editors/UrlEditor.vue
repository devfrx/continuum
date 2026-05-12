<script setup lang="ts">
/**
 * URL property editor. Displays as a clickable link when present + an
 * editable input when focused.
 */
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { PROPERTY_TYPE_PLACEHOLDERS, type PropertyDefinition, type UrlValue } from '@continuum/shared';

const props = defineProps<{
    value: UrlValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: UrlValue] }>();

const local = computed(() => props.value?.value ?? '');
const editing = ref(false);

function onInput(e: Event): void {
    emit('update:value', { type: 'url', value: (e.target as HTMLInputElement).value });
}

function isLikelyUrl(s: string): boolean {
    return /^https?:\/\//i.test(s);
}

void props.definition;
</script>

<template>
    <div class="prop-url" :class="{ 'is-editing': editing }">
        <a v-if="local && !editing && isLikelyUrl(local)" :href="local" target="_blank" rel="noopener noreferrer"
            class="prop-url__link" @click.stop>
            <Icon name="link" :size="11" />
            <span>{{ local }}</span>
        </a>
        <input v-else class="prop-url__input" type="url" :value="local" :placeholder="PROPERTY_TYPE_PLACEHOLDERS.url"
            @input="onInput" @focus="editing = true" @blur="editing = false" />
    </div>
</template>

<style scoped>
.prop-url {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--duration-fast) var(--ease-standard);
}

.prop-url:hover,
.prop-url:focus-within {
    background: var(--bg-soft);
}

.prop-url__input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
}

.prop-url__input::placeholder {
    color: var(--fg-subtle);
}

.prop-url__link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--accent, #5B7B95);
    text-decoration: underline;
    font-size: var(--text-sm);
    word-break: break-all;
}

.prop-url__link:hover {
    text-decoration: none;
}
</style>
