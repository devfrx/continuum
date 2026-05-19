<script setup lang="ts">
/**
 * LongTextSettingsPanel.vue — per-property settings for `longText`.
 *
 *   – Max characters — optional cap (server enforces 50000 hard ceiling).
 *   – Placeholder    — hint text shown when the value is empty.
 */
import { computed } from 'vue';
import { UiInput } from '@/components/ui';
import PropertySettingsRow from '../PropertySettingsRow.vue';
import type { LongTextConfig, PropertyDefinition } from '@continuum/shared';

const props = defineProps<{ definition: PropertyDefinition; config: LongTextConfig }>();
const emit = defineEmits<{ 'update:config': [value: LongTextConfig] }>();

const maxLength = computed(() =>
    props.config.maxLength === undefined ? '' : String(props.config.maxLength),
);
const placeholder = computed(() => props.config.placeholder ?? '');

function setMaxLength(value: string): void {
    if (!value.trim()) {
        const next: LongTextConfig = { ...props.config };
        delete next.maxLength;
        emit('update:config', next);
        return;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    emit('update:config', { ...props.config, maxLength: Math.floor(parsed) });
}

function setPlaceholder(value: string): void {
    if (!value) {
        const next: LongTextConfig = { ...props.config };
        delete next.placeholder;
        emit('update:config', next);
        return;
    }
    emit('update:config', { ...props.config, placeholder: value });
}
</script>

<template>
    <div class="lt-settings">
        <PropertySettingsRow label="Max characters">
            <UiInput :model-value="maxLength" type="number" size="sm" placeholder="No limit"
                @update:model-value="setMaxLength" />
        </PropertySettingsRow>

        <PropertySettingsRow label="Placeholder">
            <UiInput :model-value="placeholder" size="sm" placeholder="Add a description…"
                @update:model-value="setPlaceholder" />
        </PropertySettingsRow>
    </div>
</template>

<style scoped>
.lt-settings {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 240px;
}
</style>
