<script setup lang="ts">
/**
 * Date property editor — Continuum-styled `UiDatePicker`. Stores ISO 8601
 * strings server-side; the picker handles formatting and timezone math.
 */
import { computed } from 'vue';
import { UiDatePicker } from '@/components/ui';
import { PROPERTY_TYPE_PLACEHOLDERS, type DateValue, type PropertyDefinition } from '@continuum/shared';

const props = defineProps<{
    value: DateValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: DateValue] }>();

const datetime = computed(() => {
    const cfg = props.definition.config as { granularity?: 'date' | 'datetime' };
    return cfg.granularity === 'datetime';
});

const iso = computed<string>(() => props.value?.value ?? '');

function onUpdate(v: string): void {
    emit('update:value', { type: 'date', value: v });
}
</script>

<template>
    <div class="prop-date">
        <UiDatePicker :modelValue="iso" :datetime="datetime" :placeholder="PROPERTY_TYPE_PLACEHOLDERS.date" bare
            @update:modelValue="onUpdate" />
    </div>
</template>

<style scoped>
.prop-date {
    width: fit-content;
    max-width: 100%;
    min-width: 168px;
}

.prop-date :deep(.ui-dp) {
    width: 100%;
}
</style>
