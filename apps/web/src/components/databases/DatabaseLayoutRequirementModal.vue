<script setup lang="ts">
/**
 * DatabaseLayoutRequirementModal.vue — creates properties required by
 * a database view layout before the user intent continues.
 *
 * The modal is intentionally generic: it receives requirement metadata
 * from the view registry, lets the user adjust label/type for each
 * missing property, then returns a compact payload to DatabaseBody.
 */
import { reactive, watch } from 'vue';
import { UiButton, UiInput, UiModal, UiSelect } from '@/components/ui';
import {
    PROPERTY_TYPE_LABELS,
    type PropertyType,
} from '@continuum/shared';
import type { LayoutPropertyRequirement } from './views/types';
import type { RequiredPropertyCreateInput } from './views/layoutRequirements';

const props = defineProps<{
    modelValue: boolean;
    viewLabel: string;
    requirements: LayoutPropertyRequirement[];
    busy?: boolean;
    error?: string | null;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    submit: [items: RequiredPropertyCreateInput[]];
    cancel: [];
}>();

interface DraftState {
    label: string;
    type: PropertyType;
}

const drafts = reactive<Record<string, DraftState>>({});

watch(
    [() => props.modelValue, () => props.requirements],
    ([open]) => {
        if (!open) return;
        for (const requirement of props.requirements) {
            drafts[requirement.key] = {
                label: requirement.defaultLabel,
                type: requirement.defaultType,
            };
        }
    },
    { immediate: true },
);

function optionsFor(requirement: LayoutPropertyRequirement): { label: string; value: string }[] {
    const types = requirement.createTypes ?? requirement.propertyTypes;
    return types.map((type) => ({ label: PROPERTY_TYPE_LABELS[type], value: type }));
}

function setDraftLabel(requirement: LayoutPropertyRequirement, value: string): void {
    const draft = drafts[requirement.key];
    if (!draft) return;
    draft.label = value;
}

function setDraftType(requirement: LayoutPropertyRequirement, value: string): void {
    const draft = drafts[requirement.key];
    if (!draft) return;
    draft.type = value as PropertyType;
}

function onCancel(): void {
    emit('cancel');
    emit('update:modelValue', false);
}

function onSubmit(): void {
    const items = props.requirements.map((requirement) => {
        const draft = drafts[requirement.key];
        return {
            requirementKey: requirement.key,
            label: draft?.label.trim() || requirement.defaultLabel,
            type: draft?.type ?? requirement.defaultType,
        };
    });
    emit('submit', items);
}
</script>

<template>
    <UiModal
        :model-value="modelValue"
        :title="`${viewLabel} setup`"
        size="md"
        persistent
        @update:model-value="(value) => { if (!value) onCancel(); }">
        <form class="layout-requirements" @submit.prevent="onSubmit">
            <p class="layout-requirements__lead">
                Create the missing database properties required by this layout.
            </p>

            <div
                v-for="requirement in requirements"
                :key="requirement.key"
                class="layout-requirements__item">
                <div class="layout-requirements__copy">
                    <strong>{{ requirement.label }}</strong>
                    <span>{{ requirement.description }}</span>
                </div>
                <div class="layout-requirements__controls">
                    <UiInput
                        :model-value="drafts[requirement.key]?.label ?? requirement.defaultLabel"
                        placeholder="Property label"
                        :disabled="busy"
                        @update:model-value="(value) => setDraftLabel(requirement, String(value))" />
                    <UiSelect
                        :model-value="drafts[requirement.key]?.type ?? requirement.defaultType"
                        :options="optionsFor(requirement)"
                        :disabled="busy"
                        aria-label="Property type"
                        @update:model-value="(value) => setDraftType(requirement, String(value))" />
                </div>
            </div>

            <p v-if="error" class="layout-requirements__error">{{ error }}</p>
        </form>
        <template #footer>
            <UiButton variant="ghost" type="button" :disabled="busy" @click="onCancel">Cancel</UiButton>
            <UiButton type="button" :disabled="busy" @click="onSubmit">
                {{ busy ? 'Creating…' : 'Create properties' }}
            </UiButton>
        </template>
    </UiModal>
</template>

<style scoped>
.layout-requirements {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
}

.layout-requirements__lead {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-snug);
}

.layout-requirements__item {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface-1);
}

.layout-requirements__copy {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    font-size: var(--text-xs);
    color: var(--text-muted);
}

.layout-requirements__copy strong {
    color: var(--text-primary);
    font-size: var(--text-sm);
}

.layout-requirements__controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(124px, 0.45fr);
    gap: var(--space-2);
}

.layout-requirements__error {
    margin: 0;
    color: var(--danger);
    font-size: var(--text-xs);
}
</style>
