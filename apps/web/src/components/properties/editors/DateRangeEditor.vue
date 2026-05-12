<script setup lang="ts">
/**
 * Date-range property editor. Two `UiDatePicker` instances joined by an
 * arrow, sharing the same date / datetime granularity from the property
 * config.
 */
import { computed } from 'vue';
import { UiDatePicker } from '@/components/ui';
import Icon from '@/components/ui/Icon.vue';
import type { DateRangeValue, PropertyDefinition } from '@continuum/shared';

const props = defineProps<{
    value: DateRangeValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: DateRangeValue] }>();

const datetime = computed(() => {
    const cfg = props.definition.config as { granularity?: 'date' | 'datetime' };
    return cfg.granularity === 'datetime';
});

const fromIso = computed(() => props.value?.value.from ?? '');
const toIso = computed(() => props.value?.value.to ?? '');

function update(part: 'from' | 'to', v: string): void {
    emit('update:value', {
        type: 'dateRange',
        value: {
            from: part === 'from' ? v : fromIso.value,
            to: part === 'to' ? v : toIso.value,
        },
    });
}
</script>

<template>
    <div class="prop-range">
        <UiDatePicker class="prop-range__picker" :modelValue="fromIso" :datetime="datetime" placeholder="Start date"
            bare @update:modelValue="(v: string) => update('from', v)" />
        <span class="prop-range__sep">
            <Icon name="arrow-right" :size="11" />
            <span>to</span>
        </span>
        <UiDatePicker class="prop-range__picker" :modelValue="toIso" :datetime="datetime" placeholder="End date" bare
            @update:modelValue="(v: string) => update('to', v)" />
    </div>
</template>

<style scoped>
.prop-range {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    width: min(100%, 560px);
}

.prop-range__picker {
    flex: 0 1 180px;
    min-width: 150px;
}

.prop-range :deep(.ui-dp) {
    width: 100%;
}

.prop-range__sep {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    padding: 0 var(--space-1);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
    flex-shrink: 0;
}

@media (max-width: 760px) {
    .prop-range {
        flex-direction: column;
        align-items: stretch;
        gap: 2px;
    }

    .prop-range__sep {
        padding: 0 var(--space-3);
    }
}
</style>
