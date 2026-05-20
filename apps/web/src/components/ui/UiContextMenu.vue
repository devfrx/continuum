<script setup lang="ts">
/**
 * Generic floating contextual menu with nested submenus.
 *
 * Use cases: right-click menus, command palettes, transform menus.
 * Renders into <body> via <Teleport>, positions itself at the given
 * (x, y) coordinates and clamps to the viewport so submenus never
 * overflow off-screen.
 *
 * Items can be nested (`children`) — submenus open on hover or via
 * ArrowRight, close on ArrowLeft, and follow the parent menu's row.
 *
 * Behaviour:
 *   - opens only when `modelValue === true`;
 *   - closes on outside-click, Escape, blur, or after `select`;
 *   - sets `role="menu"` + `role="menuitem"` for AX;
 *   - keyboard: Up/Down move, Right opens submenu, Left closes it,
 *     Enter activates, Escape closes everything.
 *
 * Items with `divider: true` render as a 1px separator (label ignored).
 * Items with `children` render an end chevron and never fire `select`.
 *
 * Composition:
 *   - `useContextMenuPosition` — point-anchored root + per-submenu DOM
 *     positioning with viewport flip.
 *   - `useContextMenuKeyboard` — Arrow / Enter / Esc navigation across
 *     the open path.
 *   - `ContextMenuPanel` — recursive presentational panel rendering one
 *     level + its open child.
 */
import { computed, onBeforeUnmount, ref, toRef, watch, type Component } from 'vue';
import type { ContextMenuItem as SharedContextMenuItem } from '@continuum/shared';
import type { AppIconName as IconName } from '@/assets/icons';
import { useContextMenuPosition } from '@/composables/useContextMenuPosition';
import { useContextMenuKeyboard } from '@/composables/useContextMenuKeyboard';
import { useContinuumScrollLock } from '@/composables/useContinuumScrollLock';
import ContextMenuPanel from './ContextMenuPanel.vue';

/**
 * Local re-typing that narrows `icon` to the apps/web `IconName` union
 * while staying structurally compatible with `@continuum/shared`.
 *
 * `panel` opens a custom Vue component (e.g. a settings form) as the
 * submenu instead of a list of items — positioning still flows through
 * the normal nested-submenu machinery so the panel attaches to the
 * parent row exactly like a regular `children`-based submenu.
 */
export type ContextMenuItem = Omit<SharedContextMenuItem, 'icon' | 'children'> & {
    icon?: IconName;
    children?: ContextMenuItem[];
    panel?: Component;
    panelProps?: Record<string, unknown>;
};

interface Props {
    modelValue: boolean;
    /** Anchor coordinates in viewport space (typically event.clientX/Y). */
    x: number;
    y: number;
    items: ContextMenuItem[];
    /** Min width in px. Defaults to 220. */
    minWidth?: number;
}

const props = withDefaults(defineProps<Props>(), { minWidth: 220 });

const emit = defineEmits<{
    'update:modelValue': [value: boolean];
    select: [item: ContextMenuItem];
}>();

/* ── State ───────────────────────────────────────────────────── */

const rootPanelRef = ref<{ panelEl: HTMLElement | null } | null>(null);
const rootRef = computed<HTMLElement | null>(() => rootPanelRef.value?.panelEl ?? null);

const openPath = ref<string[]>([]);
const focusIndex = ref<number[]>([0]);
const open = computed(() => props.modelValue);

/* ── Composables ─────────────────────────────────────────────── */

const {
    rootStyle,
    subStyles,
    repositionRoot,
    panelMaxHeight,
} = useContextMenuPosition({
    open,
    x: toRef(props, 'x'),
    y: toRef(props, 'y'),
    minWidth: toRef(props, 'minWidth'),
    rootRef,
    openPath,
});

function close(): void {
    if (!props.modelValue) return;
    openPath.value = [];
    focusIndex.value = [0];
    emit('update:modelValue', false);
}

function isOpenable(item: ContextMenuItem): boolean {
    return Boolean(item.children?.length || item.panel);
}

function onActivate(item: ContextMenuItem): void {
    if (item.disabled || item.divider || item.header) return;
    if (isOpenable(item)) return; // submenu trigger only
    item.onSelect?.();
    emit('select', item);
    close();
}

function onHover(depth: number, item: ContextMenuItem, idx: number): void {
    const focus = focusIndex.value.slice(0, depth + 1);
    focus[depth] = idx;
    if (isOpenable(item)) {
        openPath.value = [...openPath.value.slice(0, depth), item.id];
        focus[depth + 1] = 0;
    } else {
        openPath.value = openPath.value.slice(0, depth);
    }
    focusIndex.value = focus;
}

useContextMenuKeyboard<ContextMenuItem>({
    open,
    items: toRef(props, 'items'),
    openPath,
    focusIndex,
    onActivate,
    onClose: close,
});
useContinuumScrollLock(open);

/* ── Outside-click ───────────────────────────────────────────── */

function onBackdropPointerDown(e: PointerEvent): void {
    const root = rootRef.value;
    if (!root) return;
    if (root.contains(e.target as Node)) return;
    // Also check submenu panels rendered as siblings via the same teleport.
    const panels = document.querySelectorAll('.ui-context-menu__panel');
    const target = e.target as Node;
    for (let index = 0; index < panels.length; index += 1) {
        if (panels[index]?.contains(target)) return;
    }
    close();
}

watch(
    () => props.modelValue,
    async (isOpen) => {
        if (isOpen) {
            openPath.value = [];
            focusIndex.value = [0];
            await repositionRoot();
            window.addEventListener('pointerdown', onBackdropPointerDown, true);
        } else {
            window.removeEventListener('pointerdown', onBackdropPointerDown, true);
        }
    },
    { immediate: true },
);

onBeforeUnmount(() => {
    window.removeEventListener('pointerdown', onBackdropPointerDown, true);
});

defineExpose({ close });

/* ── Computed style for the root panel ───────────────────────── */

const rootPanelStyle = computed<Record<string, string>>(() => ({
    top: rootStyle.value.top,
    left: rootStyle.value.left,
    minWidth: rootStyle.value.minWidth,
    maxHeight: rootStyle.value.maxHeight,
}));
</script>

<template>
    <Teleport to="body">
        <Transition name="ui-cm">
            <div v-if="modelValue" class="ui-cm-mount">
                <ContextMenuPanel
                    ref="rootPanelRef"
                    :items="items"
                    :depth="0"
                    :panel-style="rootPanelStyle"
                    :open-path="openPath"
                    :focus-index="focusIndex"
                    :min-width="minWidth"
                    :max-height="panelMaxHeight()"
                    :sub-styles="subStyles"
                    @hover="onHover"
                    @activate="onActivate"
                />
            </div>
        </Transition>
    </Teleport>
</template>

<style scoped>
.ui-cm-mount {
    /* Layout-neutral wrapper so <Transition> has a single root to track
       while ContextMenuPanel's own multi-root template (panel + recursive
       child) stays free to render submenus as siblings. */
    display: contents;
}

.ui-cm-enter-active,
.ui-cm-leave-active {
    transition:
        opacity var(--duration-fast) var(--ease-standard),
        transform var(--duration-fast) var(--ease-standard);
}

.ui-cm-enter-from,
.ui-cm-leave-to {
    opacity: 0;
    transform: scale(0.96);
}
</style>
