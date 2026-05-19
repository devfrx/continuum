<script setup lang="ts">
/**
 * ColorTokenPicker.vue — compact swatch dropdown shared by panels.
 *
 * Mirrors the `UiSelect` look-and-feel but renders a coloured dot for
 * every entry so users can pick a Notion-style palette token without
 * reading the label. Kept here (next to `ConditionalColorPanel.vue`)
 * because no other surface needs a swatch picker yet — if a second
 * caller appears (status pills, tag editor), promote to `ui/`.
 *
 * The dropdown panel is teleported into <body> and positioned through
 * `useFloatingPosition` — same recipe as `UiSelect` — so it is never
 * clipped by `overflow:hidden` ancestors (settings drawer, modals,
 * popovers).
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { Icon } from '@/components/ui';
import { useFloatingPosition } from '@/composables/useFloatingPosition';
import type { DatabaseColorTokenId } from '@continuum/shared';
import { DATABASE_COLOR_TOKENS, colorTokenById } from '../conditionalColor/palette';

const props = defineProps<{
    modelValue: DatabaseColorTokenId;
    ariaLabel?: string;
}>();

const emit = defineEmits<{
    'update:modelValue': [value: DatabaseColorTokenId];
}>();

const open = ref(false);
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLUListElement | null>(null);

const current = computed(() => colorTokenById(props.modelValue));

const { style: panelStyle, reposition } = useFloatingPosition({
    triggerRef,
    panelRef,
    open,
    maxHeight: 280,
    minWidth: 180,
});

async function openPanel(): Promise<void> {
    if (open.value) return;
    open.value = true;
    await nextTick();
    reposition();
}

function closePanel(): void {
    if (!open.value) return;
    open.value = false;
}

function toggle(): void {
    if (open.value) closePanel();
    else void openPanel();
}

function choose(id: DatabaseColorTokenId): void {
    emit('update:modelValue', id);
    closePanel();
}

function onDocPointerDown(event: PointerEvent): void {
    if (!open.value) return;
    const target = event.target as Node | null;
    if (!target) return;
    if (triggerRef.value?.contains(target)) return;
    if (panelRef.value?.contains(target)) return;
    closePanel();
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape' && open.value) closePanel();
}

watch(open, (isOpen) => {
    if (isOpen) {
        document.addEventListener('pointerdown', onDocPointerDown, true);
        document.addEventListener('keydown', onKey);
    } else {
        document.removeEventListener('pointerdown', onDocPointerDown, true);
        document.removeEventListener('keydown', onKey);
    }
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
    document.removeEventListener('keydown', onKey);
});
</script>

<template>
    <div class="color-token-picker" :class="{ 'is-open': open }">
        <button
            ref="triggerRef"
            type="button"
            class="color-token-picker__trigger"
            :aria-label="ariaLabel ?? 'Color'"
            :aria-haspopup="'listbox'"
            :aria-expanded="open"
            @click="toggle">
            <span
                class="color-token-picker__swatch"
                :class="{ 'is-default': current.id === 'default' }"
                :style="{ background: current.swatch }" />
            <span class="color-token-picker__label">{{ current.label }}</span>
            <Icon name="chevron-down" :size="12" class="color-token-picker__chev" />
        </button>
        <Teleport to="body">
            <ul
                v-if="open"
                ref="panelRef"
                class="color-token-picker__panel"
                role="listbox"
                :style="panelStyle">
                <li v-for="token in DATABASE_COLOR_TOKENS" :key="token.id">
                    <button
                        type="button"
                        class="color-token-picker__option"
                        :class="{ 'is-active': token.id === modelValue }"
                        role="option"
                        :aria-selected="token.id === modelValue"
                        @click="choose(token.id)">
                        <span
                            class="color-token-picker__swatch"
                            :class="{ 'is-default': token.id === 'default' }"
                            :style="{ background: token.swatch }" />
                        <span class="color-token-picker__label">{{ token.label }}</span>
                        <Icon
                            v-if="token.id === modelValue"
                            name="check"
                            :size="12"
                            class="color-token-picker__check" />
                    </button>
                </li>
            </ul>
        </Teleport>
    </div>
</template>

<style scoped>
.color-token-picker {
    position: relative;
    min-width: 0;
}

.color-token-picker__trigger {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: var(--border-width-1) solid var(--border);
    background: var(--surface-2);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
    min-height: 30px;
    text-align: left;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
}

.color-token-picker__trigger:hover,
.color-token-picker.is-open .color-token-picker__trigger {
    background: var(--surface-hover);
    border-color: var(--border-strong);
}

.color-token-picker__swatch {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: var(--border-width-1) solid var(--border);
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.color-token-picker__swatch.is-default {
    background-image:
        linear-gradient(45deg, transparent 45%, var(--text-muted) 45%, var(--text-muted) 55%, transparent 55%);
    background-color: transparent;
}

.color-token-picker__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.color-token-picker__chev {
    color: var(--text-muted);
    flex-shrink: 0;
}
</style>

<style>
/**
 * Teleported panel — unscoped because Vue's scoped attribute is bound
 * to the component root, which lives outside <body> after teleport.
 */
.color-token-picker__panel {
    position: fixed;
    z-index: calc(var(--z-modal) + 1);
    list-style: none;
    margin: 0;
    padding: var(--space-1);
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.35));
    overflow-y: auto;
    scrollbar-width: thin;
}

.color-token-picker__option {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: 0;
    background: transparent;
    color: var(--fg);
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: var(--text-sm);
    cursor: pointer;
    text-align: left;
    transition: background-color var(--duration-fast) var(--ease-standard);
}

.color-token-picker__option:hover,
.color-token-picker__option.is-active {
    background: var(--bg-soft);
}

.color-token-picker__swatch {
    width: 14px;
    height: 14px;
    border-radius: 999px;
    border: var(--border-width-1) solid var(--border);
    flex-shrink: 0;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

.color-token-picker__swatch.is-default {
    background-image:
        linear-gradient(45deg, transparent 45%, var(--text-muted) 45%, var(--text-muted) 55%, transparent 55%);
    background-color: transparent;
}

.color-token-picker__label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.color-token-picker__check {
    margin-left: auto;
    color: var(--fg-subtle);
}
</style>
