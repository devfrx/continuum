<script setup lang="ts">
/**
 * PropertyPopoverPanel.vue — shared popover surface for property editors.
 *
 * Provides a uniform, themed dropdown panel that:
 *   – teleports to `<body>` so it is never clipped by overflow:hidden /
 *     contain:paint ancestors (database blocks, modals, popovers, …);
 *   – anchors to a trigger element via {@link useFloatingPosition},
 *     flipping above when there isn't room below;
 *   – installs an outside-click handler that closes the panel when the
 *     pointer goes down outside both the trigger and the panel itself.
 *
 * The component is intentionally minimal: the property editor controls
 * its own `open` state and renders its own rows / chips inside the
 * default slot. Two-way binding via `v-model` keeps the parent state
 * source-of-truth so editors can also close the panel on selection.
 *
 * Centralising this here means every cell editor (select / multiSelect
 * / status / future option-based editors) gets correct overflow
 * escaping for free \u2014 the previous per-editor `position:absolute`
 * panels were getting clipped by the database block's `overflow:auto`.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useFloatingPosition } from '@/composables/useFloatingPosition';

interface Props {
    /** Whether the panel is currently shown. */
    modelValue: boolean;
    /** The trigger element the panel anchors below. */
    triggerEl: HTMLElement | null;
    /** Minimum panel width in px (clamps narrow triggers). Defaults to 200. */
    minWidth?: number;
    /** Maximum panel height in px before scrolling. Defaults to 280. */
    maxHeight?: number;
    /** ARIA role applied to the panel. Defaults to `listbox`. */
    role?: string;
}

const props = withDefaults(defineProps<Props>(), {
    minWidth: 200,
    maxHeight: 280,
    role: 'listbox',
});

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();

const panelRef = ref<HTMLDivElement | null>(null);
const open = computed({
    get: () => props.modelValue,
    set: (v) => emit('update:modelValue', v),
});

// Re-expose the trigger as a ref so useFloatingPosition can watch it.
const triggerRef = ref<HTMLElement | null>(props.triggerEl);
watch(() => props.triggerEl, (el) => { triggerRef.value = el; });

const { style: panelStyle, reposition } = useFloatingPosition({
    triggerRef,
    panelRef,
    open,
    maxHeight: props.maxHeight,
    minWidth: props.minWidth,
});

// Recompute placement once the panel actually mounts (its scrollHeight
// is required to decide whether to flip above the trigger).
watch(open, async (isOpen) => {
    if (!isOpen) return;
    await Promise.resolve();
    reposition();
});

function onDocPointerDown(e: PointerEvent): void {
    if (!open.value) return;
    const target = e.target as Node | null;
    if (!target) return;
    if (triggerRef.value?.contains(target)) return;
    if (panelRef.value?.contains(target)) return;
    open.value = false;
}

watch(open, (isOpen) => {
    if (isOpen) {
        document.addEventListener('pointerdown', onDocPointerDown, true);
    } else {
        document.removeEventListener('pointerdown', onDocPointerDown, true);
    }
});

onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocPointerDown, true);
});

defineExpose({ reposition });
</script>

<template>
    <Teleport to="body">
        <div v-if="open" ref="panelRef" class="prop-popover" :role="role" :style="panelStyle">
            <slot />
        </div>
    </Teleport>
</template>

<style scoped>
.prop-popover {
    position: fixed;
    z-index: 1300;
    background: var(--surface-2);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-dropdown);
    padding: var(--space-2);
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
}
</style>

<!--
    Unscoped row / chip styles shared by every editor rendering its
    options inside this popover (SelectEditor, MultiSelectEditor,
    StatusEditor). Scoped styles cannot reach the teleported subtree
    because Vue's data-* attribute rewrite stops at the Teleport
    boundary, so the shared chrome lives here.
-->
<style>
.prop-pop__row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    background: transparent;
    border: 0;
    color: var(--text-primary);
    cursor: pointer;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    text-align: left;
    width: 100%;
    font: inherit;
}

.prop-pop__row:hover {
    background: var(--surface-hover);
}

.prop-pop__row--clear {
    color: var(--text-muted);
    border-bottom: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-sm);
    margin-bottom: var(--space-1);
    padding-bottom: var(--space-2);
}

.prop-pop__check {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    color: var(--text-primary);
    flex-shrink: 0;
}

.prop-pop__clear-label {
    font-size: var(--text-xs);
}

.prop-pop__chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 20px;
    padding: 0 var(--space-3);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    line-height: 1;
    white-space: nowrap;
}

.prop-pop__chip-dot {
    width: 6px;
    height: 6px;
    border-radius: var(--radius-sm);
    background: var(--text-primary);
    opacity: 0.85;
    flex-shrink: 0;
}

.prop-pop__group-heading {
    padding: var(--space-2) var(--space-2) var(--space-1);
    font-size: var(--text-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.04em;
}

.prop-pop__empty {
    padding: var(--space-3);
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-align: center;
}
</style>
