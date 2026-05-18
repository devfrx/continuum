<script setup lang="ts">
/**
 * Status property editor.
 *
 * Behaves like {@link SelectEditor} but groups the options by their
 * lifecycle column (`todo` / `inProgress` / `done`) inside the popover,
 * matching the Notion-style status chip UX. The popover is teleported
 * to `<body>` via {@link PropertyPopoverPanel} so it can never be
 * clipped by the surrounding block.
 */
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import PropertyPopoverPanel from './PropertyPopoverPanel.vue';
import {
    PROPERTY_TYPE_PLACEHOLDERS,
    STATUS_GROUP_LABELS,
    type PropertyDefinition,
    type StatusGroupId,
    type StatusOption,
    type StatusValue,
} from '@continuum/shared';

const props = defineProps<{
    value: StatusValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: StatusValue] }>();

const options = computed(
    () => (props.definition.config as { options: StatusOption[] }).options ?? [],
);
const current = computed(() => props.value?.value ?? '');
const currentOption = computed<StatusOption | null>(
    () => options.value.find((o) => o.id === current.value) ?? null,
);

const grouped = computed<Record<StatusGroupId, StatusOption[]>>(() => {
    const out: Record<StatusGroupId, StatusOption[]> = { todo: [], inProgress: [], done: [] };
    for (const opt of options.value) {
        (out[opt.group] ?? out.todo).push(opt);
    }
    return out;
});

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);

function pick(id: string): void {
    emit('update:value', { type: 'status', value: id });
    open.value = false;
}

function clear(): void {
    emit('update:value', { type: 'status', value: '' });
    open.value = false;
}

function toggle(): void {
    open.value = !open.value;
}

const groupOrder: StatusGroupId[] = ['todo', 'inProgress', 'done'];
</script>

<template>
    <div class="prop-status">
        <button ref="triggerRef" type="button" class="prop-status__trigger" @click="toggle">
            <span v-if="currentOption" class="prop-status__chip" :style="{ background: currentOption.color }">
                <span class="prop-status__dot" />
                <span class="prop-status__chip-label">{{ currentOption.label }}</span>
            </span>
            <span v-else class="prop-status__placeholder">{{ PROPERTY_TYPE_PLACEHOLDERS.status }}</span>
            <Icon name="chevron-down" :size="12" class="prop-status__caret" />
        </button>

        <PropertyPopoverPanel v-model="open" :trigger-el="triggerRef" :min-width="220" :max-height="320">
            <button v-if="currentOption" type="button" class="prop-pop__row prop-pop__row--clear" @click="clear">
                <span class="prop-pop__check">
                    <Icon name="close" :size="11" />
                </span>
                <span class="prop-pop__clear-label">Clear status</span>
            </button>

            <template v-for="g in groupOrder" :key="`g-${g}`">
                <div v-if="grouped[g].length > 0" class="prop-pop__group-heading">
                    {{ STATUS_GROUP_LABELS[g] }}
                </div>
                <button v-for="opt in grouped[g]" :key="opt.id" type="button" class="prop-pop__row"
                    :class="{ 'is-on': opt.id === current }" @click="pick(opt.id)">
                    <span class="prop-pop__check">
                        <Icon v-if="opt.id === current" name="check" :size="12" />
                    </span>
                    <span class="prop-pop__chip" :style="{ background: opt.color }">
                        <span class="prop-pop__chip-dot" />
                        {{ opt.label }}
                    </span>
                </button>
            </template>

            <div v-if="options.length === 0" class="prop-pop__empty">
                No status options. Configure them when adding the property.
            </div>
        </PropertyPopoverPanel>
    </div>
</template>

<style scoped>
.prop-status {
    position: relative;
    width: 100%;
    min-width: 0;
    max-width: 100%;
}

.prop-status__trigger {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    background: transparent;
    border: 0;
    color: var(--text-primary);
    text-align: left;
    cursor: pointer;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    min-height: 30px;
    min-width: 0;
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.prop-status__trigger:hover,
.prop-status__trigger:focus {
    background: var(--surface-hover);
    outline: none;
}

.prop-status__placeholder {
    color: var(--text-muted);
    font-size: var(--text-sm);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.prop-status__chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    height: 22px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    white-space: nowrap;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
}

.prop-status__chip-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.prop-status__dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-sm);
    background: var(--text-primary);
    opacity: 0.85;
    flex-shrink: 0;
}

.prop-status__caret {
    margin-left: auto;
    color: var(--text-muted);
    flex-shrink: 0;
}
</style>
