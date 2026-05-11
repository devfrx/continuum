<script setup lang="ts">
/**
 * FolderIconField — icon picker section of the folder form.
 *
 * Exposes a v-model with the user's *override* (empty string when no
 * override is set, in which case the inherited value drives the
 * preview). The field shows a live preview tinted by the effective
 * color and a clear-to-inherit affordance.
 */
import { computed } from 'vue';
import { Icon, UiIconPicker } from '@/components/ui';
import { KIND_ICON_GROUPS, type KindIconGroup } from '@/assets/kindIcons';
import type { FolderEffective } from '@continuum/shared';

const props = defineProps<{
    /** Override value persisted on the folder (`''` = inherit). */
    modelValue: string;
    /** Effective values resolved from the folder's parent. */
    inherited: FolderEffective;
    /** Active color (override or inherited) used to tint the preview. */
    color: string;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
}>();

const FOLDER_ICON_GROUPS: readonly KindIconGroup[] = [
    {
        label: 'Folders',
        icons: ['folder', 'folder-open', 'folder-with-files', 'folder-add', 'folder-favourite', 'inbox'],
    },
    ...KIND_ICON_GROUPS,
];

/**
 * Two-way computed bridging the picker (which always wants a concrete
 * icon) and our `modelValue` (which uses `''` to mean "inherit").
 */
const selectedIcon = computed<string>({
    get: () => props.modelValue || props.inherited.icon,
    set: (value) => {
        emit('update:modelValue', value === props.inherited.icon ? '' : value);
    },
});

const iconModeLabel = computed(() => (props.modelValue ? 'Custom icon' : 'Inherited icon'));

function clear(): void {
    emit('update:modelValue', '');
}
</script>

<template>
    <div class="field">
        <span class="field__label">Icon</span>
        <div class="icon-row">
            <span class="icon-preview" :style="{ color }">
                <Icon :name="selectedIcon" :size="18" />
            </span>
            <span class="icon-summary">
                <strong>{{ iconModeLabel }}</strong>
                <span>{{ selectedIcon }}</span>
            </span>
            <button v-if="modelValue" type="button" class="color-clear" title="Clear (inherit)" @click="clear">
                <Icon name="close" :size="12" />
            </button>
        </div>
        <UiIconPicker v-model="selectedIcon" :groups="FOLDER_ICON_GROUPS" :show-preview="false" />
        <span class="field__hint">
            Pick an override, or clear it to inherit <code>{{ inherited.icon }}</code>.
        </span>
    </div>
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

.icon-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.icon-preview {
    width: 36px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-soft);
}

.icon-summary {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
    flex: 1;
}

.icon-summary strong {
    color: var(--fg);
    font-size: var(--text-sm);
    font-weight: var(--font-weight-semibold);
}

.icon-summary span {
    color: var(--fg-subtle);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.field :deep(.ui-icon-picker) {
    gap: var(--space-4);
}

.field :deep(.ui-icon-picker__grid) {
    max-height: 176px;
}

.color-clear {
    appearance: none;
    background: transparent;
    border: var(--border-width-1) solid var(--border);
    color: var(--fg-muted);
    width: 28px;
    height: 28px;
    border-radius: var(--radius-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.color-clear:hover {
    color: var(--fg);
    background: var(--bg-soft);
}
</style>
