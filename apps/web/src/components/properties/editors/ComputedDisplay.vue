<script setup lang="ts">
/**
 * Shared display component for property types whose values are produced
 * by the server and never edited inline:
 *
 *   uniqueId, formula, rollup,
 *   createdTime, createdBy, lastEditedTime, lastEditedBy.
 *
 * The component exposes a single `value` prop (typed as the union of all
 * supported value types) and renders a styled chip / inline label that
 * matches the visual language of the editable editors.
 */
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import type { AppIconName } from '@/assets/icons';
import type {
    CreatedByValue,
    CreatedTimeValue,
    FormulaValue,
    LastEditedByValue,
    LastEditedTimeValue,
    PropertyDefinition,
    RollupValue,
    UniqueIdValue,
} from '@continuum/shared';

type ComputedDisplayValue =
    | UniqueIdValue
    | FormulaValue
    | RollupValue
    | CreatedTimeValue
    | CreatedByValue
    | LastEditedTimeValue
    | LastEditedByValue
    | null;

const props = defineProps<{
    value: ComputedDisplayValue;
    definition: PropertyDefinition;
}>();

function formatDate(iso: string): string {
    if (!iso) return '';
    // Render YYYY-MM-DD as-is, full ISO trimmed to YYYY-MM-DD HH:mm.
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const display = computed<{ text: string; muted: boolean; icon?: AppIconName; chipCount?: number; error?: string }>(() => {
    const v = props.value;
    if (!v) return { text: '—', muted: true };
    switch (v.type) {
        case 'uniqueId':
            return { text: v.value || '—', muted: !v.value, icon: 'prop-unique-id' };
        case 'formula':
            return {
                text: v.value === null || v.value === undefined ? '—' : String(v.value),
                muted: v.value === null || v.value === undefined,
                error: v.error,
            };
        case 'rollup':
            return {
                text: v.value === null || v.value === undefined ? '—' : String(v.value),
                muted: v.value === null || v.value === undefined,
                chipCount: v.count,
            };
        case 'createdTime':
        case 'lastEditedTime':
            return { text: v.value ? formatDate(v.value) : '—', muted: !v.value, icon: 'prop-clock' };
        case 'createdBy':
        case 'lastEditedBy':
            return { text: v.value || '—', muted: !v.value, icon: 'prop-created-by' };
    }
});
</script>

<template>
    <div class="prop-disp" :class="{ 'is-muted': display.muted, 'is-err': !!display.error }"
        :title="display.error ?? undefined">
        <Icon v-if="display.icon" :name="display.icon" :size="12" class="prop-disp__icon" />
        <span class="prop-disp__text">{{ display.text }}</span>
        <span v-if="display.chipCount !== undefined" class="prop-disp__count">{{ display.chipCount }}</span>
        <Icon v-if="display.error" name="warning" :size="12" class="prop-disp__err-icon" />
    </div>
</template>

<style scoped>
.prop-disp {
    display: inline-flex; align-items: center; gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--fg); font-size: var(--text-sm);
    min-height: 30px;
}
.prop-disp.is-muted { color: var(--fg-subtle); }
.prop-disp.is-err { color: var(--danger, #ef4444); }
.prop-disp__icon { color: var(--fg-subtle); flex-shrink: 0; }
.prop-disp__text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.prop-disp__count {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 18px; height: 16px; padding: 0 4px;
    border-radius: var(--radius-sm); background: var(--bg-soft);
    color: var(--fg-subtle); font-size: var(--text-2xs, 10px);
    font-weight: var(--font-weight-semibold);
}
.prop-disp__err-icon { color: var(--danger, #ef4444); }
</style>
