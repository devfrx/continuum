<script setup lang="ts">
/**
 * Multi-select property editor. Renders coloured chips inline plus a
 * caret that toggles a checklist popover. The popover is teleported to
 * `<body>` via {@link PropertyPopoverPanel}, so it can never be clipped
 * by the surrounding block's overflow rules.
 */
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import PropertyPopoverPanel from './PropertyPopoverPanel.vue';
import type { MultiSelectValue, PropertyDefinition, PropertyOption } from '@continuum/shared';

const props = defineProps<{
    value: MultiSelectValue | null;
    definition: PropertyDefinition;
    compact?: boolean;
}>();

const emit = defineEmits<{ 'update:value': [v: MultiSelectValue] }>();

const options = computed(
    () => (props.definition.config as { options: PropertyOption[] }).options ?? [],
);
const selected = computed(() => props.value?.value ?? []);
const selectedOptions = computed(() =>
    selected.value
        .map((id) => options.value.find((o) => o.id === id))
        .filter((o): o is PropertyOption => Boolean(o)),
);
const visibleSelectedOptions = computed(() => (
    props.compact ? selectedOptions.value.slice(0, 2) : selectedOptions.value
));
const hiddenSelectedCount = computed(() => selectedOptions.value.length - visibleSelectedOptions.value.length);

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);

function toggleOption(id: string): void {
    const set = new Set(selected.value);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    emit('update:value', { type: 'multiSelect', value: Array.from(set) });
}

function remove(id: string): void {
    emit('update:value', {
        type: 'multiSelect',
        value: selected.value.filter((s) => s !== id),
    });
}

function onTrigger(): void {
    open.value = !open.value;
}
</script>

<template>
    <div class="prop-ms" :class="{ 'is-compact': compact }">
        <div
            ref="triggerRef"
            class="prop-ms__trigger"
            role="button"
            tabindex="0"
            aria-haspopup="listbox"
            :aria-expanded="open"
            @click="onTrigger"
            @keydown.enter.prevent="onTrigger"
            @keydown.space.prevent="onTrigger">
            <span v-if="selectedOptions.length === 0" class="prop-ms__placeholder">Select options</span>
            <span v-for="opt in visibleSelectedOptions" :key="opt.id" class="prop-ms__chip" :style="{ background: opt.color }">
                <span class="prop-ms__chip-label">{{ opt.label }}</span>
                <button type="button" class="prop-ms__chip-x" @click.stop="remove(opt.id)" aria-label="Remove">
                    <Icon name="close" :size="10" />
                </button>
            </span>
            <span v-if="hiddenSelectedCount > 0" class="prop-ms__more">+{{ hiddenSelectedCount }}</span>
            <Icon name="chevron-down" :size="12" class="prop-ms__caret" />
        </div>

        <PropertyPopoverPanel v-model="open" :trigger-el="triggerRef" :min-width="220" :max-height="280">
            <button v-for="opt in options" :key="opt.id" type="button" class="prop-pop__row"
                :class="{ 'is-on': selected.includes(opt.id) }" @click="toggleOption(opt.id)">
                <span class="prop-pop__check">
                    <Icon v-if="selected.includes(opt.id)" name="check" :size="12" />
                </span>
                <span class="prop-pop__chip" :style="{ background: opt.color }">{{ opt.label }}</span>
            </button>
            <div v-if="options.length === 0" class="prop-pop__empty">
                No options. Configure them in the property settings.
            </div>
        </PropertyPopoverPanel>
    </div>
</template>

<style scoped>
.prop-ms {
    position: relative;
    width: 100%;
    min-width: 0;
    max-width: 100%;
}

.prop-ms__trigger {
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
    flex-wrap: wrap;
    min-height: 30px;
    min-width: 0;
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.prop-ms__trigger:hover,
.prop-ms__trigger:focus {
    background: var(--surface-hover);
    outline: none;
}

.prop-ms__placeholder {
    color: var(--text-muted);
    font-size: var(--text-sm);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.prop-ms__chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 22px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    white-space: nowrap;
    min-width: 0;
    max-width: 140px;
}

.prop-ms.is-compact .prop-ms__chip {
    max-width: 96px;
}

.prop-ms__chip-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
}

.prop-ms__chip-x {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    cursor: pointer;
    padding: 0;
    flex: 0 0 auto;
}

.prop-ms__chip-x:hover {
    background: var(--surface-active);
}

.prop-ms__more {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-secondary);
    border: var(--border-width-1) solid var(--border);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    flex: 0 0 auto;
}

.prop-ms__caret {
    margin-left: auto;
    color: var(--text-muted);
    flex-shrink: 0;
}
</style>
