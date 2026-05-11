<script setup lang="ts">
/**
 * FolderColorField — color picker section of the folder form.
 *
 * `modelValue` is the persisted override (`''` = inherit). The native
 * color input always shows a concrete color (override → inherited).
 */
import { Icon, UiInput } from '@/components/ui';
import type { FolderEffective } from '@continuum/shared';

defineProps<{
    /** Override value persisted on the folder (`''` = inherit). */
    modelValue: string;
    /** Effective values resolved from the folder's parent. */
    inherited: FolderEffective;
}>();

const emit = defineEmits<{
    (e: 'update:modelValue', value: string): void;
}>();

function onColorPick(ev: Event): void {
    emit('update:modelValue', (ev.target as HTMLInputElement).value);
}

function onHexInput(value: string): void {
    emit('update:modelValue', value);
}

function clear(): void {
    emit('update:modelValue', '');
}
</script>

<template>
    <label class="field">
        <span class="field__label">Color</span>
        <div class="color-row">
            <input type="color" :value="modelValue || inherited.color" class="color-swatch" @input="onColorPick" />
            <UiInput :model-value="modelValue" :placeholder="`(inherits: ${inherited.color})`" class="color-hex"
                @update:model-value="onHexInput" />
            <button type="button" v-if="modelValue" class="color-clear" title="Clear (inherit)" @click="clear">
                <Icon name="close" :size="12" />
            </button>
        </div>
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

.color-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
}

.color-swatch {
    width: 36px;
    height: 36px;
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    background: transparent;
    padding: 2px;
}

.color-hex {
    flex: 1;
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
