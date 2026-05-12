<script setup lang="ts">
/**
 * UiPopover — minimal teleported popover anchored to a trigger element.
 *
 * Props:
 *   - `open`         : controlled visibility (v-model:open).
 *   - `triggerRef`   : the element the popover anchors under.
 *   - `width`        : optional fixed width (px) for the panel.
 *   - `align`        : 'start' | 'end' alignment relative to trigger (default 'start').
 *
 * Behaviour:
 *   - Teleports into <body>, repositions on scroll/resize.
 *   - Closes on outside click and on Escape.
 *   - Keeps no global state; each instance is self-contained.
 */
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { useFloatingPosition } from '@/composables/useFloatingPosition';

const props = withDefaults(
    defineProps<{
        open: boolean;
        triggerRef: HTMLElement | null;
        width?: number;
        align?: 'start' | 'end';
    }>(),
    { align: 'start' },
);

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const panelRef = ref<HTMLDivElement | null>(null);
const triggerRefInternal = ref<HTMLElement | null>(props.triggerRef);
watch(
    () => props.triggerRef,
    (v) => {
        triggerRefInternal.value = v;
    },
);

const openRef = computed({
    get: () => props.open,
    set: (v: boolean) => emit('update:open', v),
});

const { style, reposition } = useFloatingPosition({
    triggerRef: triggerRefInternal,
    panelRef,
    open: openRef,
    minWidth: props.width ?? 240,
    maxHeight: 480,
});

function onDocClick(e: MouseEvent): void {
    if (!props.open) return;
    const t = e.target as Node;
    if (panelRef.value?.contains(t)) return;
    if (props.triggerRef?.contains(t)) return;
    emit('update:open', false);
}

function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && props.open) {
        e.stopPropagation();
        emit('update:open', false);
    }
}

watch(
    () => props.open,
    async (isOpen) => {
        if (isOpen) {
            await nextTick();
            reposition();
            document.addEventListener('mousedown', onDocClick, true);
            document.addEventListener('keydown', onKey, true);
        } else {
            document.removeEventListener('mousedown', onDocClick, true);
            document.removeEventListener('keydown', onKey, true);
        }
    },
);

onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocClick, true);
    document.removeEventListener('keydown', onKey, true);
});

const panelStyle = computed(() => {
    const base = { ...style.value } as Record<string, string>;
    if (props.width) {
        base.width = `${props.width}px`;
        base.minWidth = `${props.width}px`;
    }
    return base;
});
</script>

<template>
    <Teleport to="body">
        <div
            v-if="open"
            ref="panelRef"
            class="ui-popover"
            :style="panelStyle"
            role="dialog"
        >
            <slot />
        </div>
    </Teleport>
</template>

<style scoped>
.ui-popover {
    position: fixed;
    z-index: 1000;
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md, 0 8px 24px rgba(0, 0, 0, 0.18));
    overflow: auto;
    padding: var(--space-3);
}
</style>
