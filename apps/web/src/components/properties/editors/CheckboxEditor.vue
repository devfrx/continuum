<script setup lang="ts">
/**
 * Boolean property editor — uses the shared `UiSwitch` primitive.
 */
import { computed } from 'vue';
import { UiSwitch } from '@/components/ui';
import type { CheckboxValue, PropertyDefinition } from '@continuum/shared';

const props = defineProps<{
    value: CheckboxValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: CheckboxValue] }>();

const checked = computed(() => props.value?.value ?? false);

function onUpdate(v: boolean): void {
    emit('update:value', { type: 'checkbox', value: v });
}

void props;
</script>

<template>
    <label class="prop-cb">
        <UiSwitch :modelValue="checked" @update:modelValue="onUpdate" />
        <span class="prop-cb__state" :class="{ 'is-on': checked }">
            {{ checked ? 'Yes' : 'No' }}
        </span>
    </label>
</template>

<style scoped>
.prop-cb {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    cursor: pointer;
    user-select: none;
}

.prop-cb__state {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    transition: color var(--duration-fast) var(--ease-standard);
}

.prop-cb__state.is-on {
    color: var(--fg);
}
</style>
