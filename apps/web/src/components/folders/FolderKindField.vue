<script setup lang="ts">
/**
 * FolderKindField — default-kind selector for the folder form.
 *
 * The first option is always the synthetic "(inherits: …)" placeholder
 * mapping to `''`; the remaining options come from the global kinds
 * registry.
 */
import { computed } from 'vue';
import { UiSelect } from '@/components/ui';
import { useKinds } from '@/composables/useKinds';
import type { FolderEffective } from '@continuum/shared';

const props = defineProps<{
    /** Override value persisted on the folder (`''` = inherit). */
    modelValue: string;
    /** Effective values resolved from the folder's parent. */
    inherited: FolderEffective;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
}>();

const kinds = useKinds();

const kindOptions = computed(() => [
    { value: '', label: `(inherits: ${kinds.labelOf(props.inherited.defaultKind)})` },
    ...kinds.sorted.value.map((k) => ({ value: k.id, label: k.label })),
]);

function onChange(v: unknown): void {
    emit('update:modelValue', String(v));
}
</script>

<template>
    <label class="field">
        <span class="field__label">Default kind</span>
        <UiSelect :model-value="modelValue" :options="kindOptions" @update:model-value="onChange" />
        <span class="field__hint">
            Used when creating notes inside this folder without picking a kind.
        </span>
    </label>
</template>

<style scoped>
.field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
}

.field__label {
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--fg-subtle);
    font-weight: var(--font-weight-semibold);
}

.field__hint {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
}
</style>
