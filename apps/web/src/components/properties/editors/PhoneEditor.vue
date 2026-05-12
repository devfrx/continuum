<script setup lang="ts">
/**
 * Phone property editor.
 *
 * Functionally similar to URL/email: shows the value as a `tel:` link when
 * idle and a free-form input when focused. Validation matches the schema
 * in `valueSchemaFor` (allowing `+`, digits, spaces, dashes, parentheses
 * and dots) so the user gets the same feedback on the client as the API
 * eventually returns.
 */
import { computed, ref, watch } from 'vue';
import { PROPERTY_TYPE_PLACEHOLDERS, type PhoneValue, type PropertyDefinition } from '@continuum/shared';

const props = defineProps<{
    value: PhoneValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: PhoneValue] }>();

const local = ref(props.value?.value ?? '');
const editing = ref(false);

watch(
    () => props.value?.value,
    (v) => {
        if (!editing.value) local.value = v ?? '';
    },
);

const cfg = computed(() => props.definition.config as { region?: string });
const placeholder = computed(
    () => cfg.value.region ? `${cfg.value.region} • ${PROPERTY_TYPE_PLACEHOLDERS.phone}` : PROPERTY_TYPE_PLACEHOLDERS.phone,
);

function commit(): void {
    editing.value = false;
    const trimmed = local.value.trim();
    if (trimmed === (props.value?.value ?? '')) return;
    emit('update:value', { type: 'phone', value: trimmed });
}

function onInput(e: Event): void {
    local.value = (e.target as HTMLInputElement).value;
}

const telHref = computed(() => `tel:${(props.value?.value ?? '').replace(/\s+/g, '')}`);
</script>

<template>
    <div class="prop-phone">
        <a v-if="!editing && (props.value?.value ?? '').length > 0" class="prop-phone__link" :href="telHref"
            @click.stop @dblclick.prevent="editing = true">
            {{ props.value?.value }}
        </a>
        <input v-else class="prop-phone__input" type="tel" :value="local" :placeholder="placeholder"
            @input="onInput" @focus="editing = true" @blur="commit" @keydown.enter.prevent="commit" />
    </div>
</template>

<style scoped>
.prop-phone {
    display: flex;
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    transition: background var(--duration-fast) var(--ease-standard);
}
.prop-phone:hover, .prop-phone:focus-within { background: var(--bg-soft); }
.prop-phone__input {
    flex: 1; background: transparent; border: none; outline: none;
    color: var(--fg); font: inherit; font-size: var(--text-sm);
}
.prop-phone__input::placeholder { color: var(--fg-subtle); }
.prop-phone__link {
    color: var(--accent); text-decoration: none; font-size: var(--text-sm);
    cursor: text;
}
.prop-phone__link:hover { text-decoration: underline; }
</style>
