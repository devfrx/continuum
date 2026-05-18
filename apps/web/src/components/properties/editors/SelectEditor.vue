<script setup lang="ts">
/**
 * Single-select property editor.
 *
 * The trigger doubles as a coloured chip showing the current option (or a
 * placeholder when empty). Clicking the trigger — chip included — opens
 * a Notion-style popover (teleported to <body> via
 * {@link PropertyPopoverPanel} so it can never be clipped by the
 * surrounding block) that lets the user pick another option or clear
 * the value.
 */
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import PropertyPopoverPanel from './PropertyPopoverPanel.vue';
import {
    PROPERTY_TYPE_PLACEHOLDERS,
    type PropertyDefinition,
    type PropertyOption,
    type SelectValue,
} from '@continuum/shared';

const props = defineProps<{
    value: SelectValue | null;
    definition: PropertyDefinition;
}>();

const emit = defineEmits<{ 'update:value': [v: SelectValue] }>();

const options = computed(
    () => (props.definition.config as { options: PropertyOption[] }).options ?? [],
);
const current = computed(() => props.value?.value ?? '');
const currentOption = computed<PropertyOption | null>(
    () => options.value.find((o) => o.id === current.value) ?? null,
);

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);

function pick(id: string): void {
    emit('update:value', { type: 'select', value: id });
    open.value = false;
}

function clear(): void {
    emit('update:value', { type: 'select', value: '' });
    open.value = false;
}

function toggle(): void {
    open.value = !open.value;
}
</script>

<template>
    <div class="prop-sel">
        <button ref="triggerRef" type="button" class="prop-sel__trigger" @click="toggle">
            <span v-if="currentOption" class="prop-sel__chip" :style="{ background: currentOption.color }">
                <span class="prop-sel__chip-label">{{ currentOption.label }}</span>
            </span>
            <span v-else class="prop-sel__placeholder">{{ PROPERTY_TYPE_PLACEHOLDERS.select }}</span>
            <Icon name="chevron-down" :size="12" class="prop-sel__caret" />
        </button>

        <PropertyPopoverPanel v-model="open" :trigger-el="triggerRef" :min-width="200" :max-height="240">
            <button v-if="currentOption" type="button" class="prop-pop__row prop-pop__row--clear" @click="clear">
                <span class="prop-pop__check">
                    <Icon name="close" :size="11" />
                </span>
                <span class="prop-pop__clear-label">Clear selection</span>
            </button>
            <button v-for="opt in options" :key="opt.id" type="button" class="prop-pop__row"
                :class="{ 'is-on': opt.id === current }" @click="pick(opt.id)">
                <span class="prop-pop__check">
                    <Icon v-if="opt.id === current" name="check" :size="12" />
                </span>
                <span class="prop-pop__chip" :style="{ background: opt.color }">
                    {{ opt.label }}
                </span>
            </button>
            <div v-if="options.length === 0" class="prop-pop__empty">
                No options. Configure them when adding the property.
            </div>
        </PropertyPopoverPanel>
    </div>
</template>

<style scoped>
.prop-sel {
    position: relative;
    width: 100%;
    min-width: 0;
    max-width: 100%;
}

.prop-sel__trigger {
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

.prop-sel__trigger:hover,
.prop-sel__trigger:focus {
    background: var(--surface-hover);
    outline: none;
}

.prop-sel__placeholder {
    color: var(--text-muted);
    font-size: var(--text-sm);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.prop-sel__chip {
    display: inline-flex;
    align-items: center;
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

.prop-sel__chip-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.prop-sel__caret {
    margin-left: auto;
    color: var(--text-muted);
    flex-shrink: 0;
}
</style>
