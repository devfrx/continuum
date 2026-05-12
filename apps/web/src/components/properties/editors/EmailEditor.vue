<script setup lang="ts">
/**
 * Email property editor. Mailto link when present + valid; editable input
 * otherwise.
 */
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { PROPERTY_TYPE_PLACEHOLDERS, type EmailValue, type PropertyDefinition } from '@continuum/shared';

const props = defineProps<{
    value: EmailValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: EmailValue] }>();

const local = computed(() => props.value?.value ?? '');
const editing = ref(false);

function onInput(e: Event): void {
    emit('update:value', { type: 'email', value: (e.target as HTMLInputElement).value });
}

function isLikelyEmail(s: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

void props.definition;
</script>

<template>
    <div class="prop-email" :class="{ 'is-editing': editing }">
        <a v-if="local && !editing && isLikelyEmail(local)" :href="`mailto:${local}`" class="prop-email__link"
            @click.stop>
            <Icon name="prop-email" :size="11" />
            <span>{{ local }}</span>
        </a>
        <input v-else class="prop-email__input" type="email" :value="local"
            :placeholder="PROPERTY_TYPE_PLACEHOLDERS.email" @input="onInput" @focus="editing = true"
            @blur="editing = false" />
    </div>
</template>

<style scoped>
.prop-email {
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--duration-fast) var(--ease-standard);
}

.prop-email:hover,
.prop-email:focus-within {
    background: var(--bg-soft);
}

.prop-email__input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: var(--fg);
    font: inherit;
    font-size: var(--text-sm);
}

.prop-email__input::placeholder {
    color: var(--fg-subtle);
}

.prop-email__link {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--accent, #5B7B95);
    text-decoration: underline;
    font-size: var(--text-sm);
    word-break: break-all;
}

.prop-email__link:hover {
    text-decoration: none;
}
</style>
