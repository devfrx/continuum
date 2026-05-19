<script setup lang="ts">
/**
 * Single panel of a `UiContextMenu`. Recursive: when `openPath` exposes
 * an open child at this depth, the panel mounts another
 * `<ContextMenuPanel>` for that child's items.
 *
 * The root component (`UiContextMenu`) owns all state — open path,
 * focus indexes, position style maps, keyboard handlers — and passes
 * everything down. This component is purely presentational plus the
 * recursive mount.
 *
 * Each row carries `data-cm-level` and `data-cm-id` attrs and submenu
 * panels carry `data-cm-panel` so `useContextMenuPosition` can measure
 * them via `document.querySelector` on the second positioning pass.
 */
import { computed, ref } from 'vue';
import Icon from './Icon.vue';
import type { ContextMenuItem } from './UiContextMenu.vue';
import type { ContextMenuSubStyle } from '@/composables/useContextMenuPosition';

interface Props {
    /** Items rendered by this panel. */
    items: ContextMenuItem[];
    /** Panel depth (0 = root). */
    depth: number;
    /** Inline style applied to this panel (positioning + sizing). */
    panelStyle: Record<string, string>;
    /** Open submenu chain — `openPath[depth]` is the id whose children form the next panel. */
    openPath: string[];
    /** Focused index per depth. */
    focusIndex: number[];
    /** Min width for nested panels. */
    minWidth: number;
    /** Max-height value for nested panels. */
    maxHeight: string;
    /** Style map for submenu panels keyed by `${depth}:${parentId}`. */
    subStyles: Record<string, ContextMenuSubStyle>;
    /** Optional `data-cm-panel` attribute (set on submenu panels for position lookup). */
    panelDataAttr?: string;
}

const props = defineProps<Props>();

const emit = defineEmits<{
    hover: [depth: number, item: ContextMenuItem, idx: number];
    activate: [item: ContextMenuItem];
}>();

const panelEl = ref<HTMLElement | null>(null);

const openChildId = computed<string | undefined>(() => props.openPath[props.depth]);

const openChildItem = computed<ContextMenuItem | null>(() => {
    const id = openChildId.value;
    if (id === undefined) return null;
    return props.items.find((i) => i.id === id) ?? null;
});

const childItems = computed<ContextMenuItem[]>(() => openChildItem.value?.children ?? []);

const hasChildPanel = computed<boolean>(() => Boolean(openChildItem.value?.panel));

const childStyle = computed<Record<string, string>>(() => {
    const id = openChildId.value;
    if (id === undefined) return {};
    return {
        ...(props.subStyles[`${props.depth}:${id}`] ?? {}),
        minWidth: `${props.minWidth}px`,
        maxHeight: props.maxHeight,
    };
});

defineExpose({ panelEl });
</script>

<template>
    <div ref="panelEl" class="ui-context-menu ui-context-menu__panel" role="menu" :data-cm-panel="panelDataAttr"
        :style="panelStyle">
        <div v-for="(item, idx) in items" :key="item.id" class="ui-cm__item">
            <div v-if="item.divider" class="ui-cm__divider" role="separator" />
            <div v-else-if="item.header" class="ui-cm__header">{{ item.label }}</div>
            <button v-else type="button" class="ui-cm__row" role="menuitem" :data-cm-level="depth" :data-cm-id="item.id"
                :class="{
                    'is-active': item.active,
                    'is-disabled': item.disabled,
                    'is-danger': item.danger,
                    'is-focused': focusIndex[depth] === idx,
                    'has-children': !!item.children?.length || !!item.panel,
                }" :disabled="item.disabled" @pointerenter="emit('hover', depth, item, idx)"
                @click="emit('activate', item)">
                <span v-if="item.swatch" class="ui-cm__swatch" :style="{ background: item.swatch }" />
                <Icon v-else-if="item.icon" :name="item.icon" :size="14" class="ui-cm__icon" />
                <span v-else class="ui-cm__icon ui-cm__icon--placeholder" />
                <span class="ui-cm__label">{{ item.label }}</span>
                <span v-if="item.active" class="ui-cm__check">
                    <Icon name="check" :size="12" />
                </span>
                <span v-else-if="item.shortcut" class="ui-cm__shortcut">{{ item.shortcut }}</span>
                <span v-else-if="item.children?.length || item.panel" class="ui-cm__chev">
                    <Icon name="chevron-right" :size="12" />
                </span>
            </button>
        </div>
    </div>

    <ContextMenuPanel v-if="openChildItem && !hasChildPanel" :items="childItems" :depth="depth + 1"
        :panel-style="childStyle" :open-path="openPath" :focus-index="focusIndex" :min-width="minWidth"
        :max-height="maxHeight" :sub-styles="subStyles" :panel-data-attr="`${depth + 1}:${openChildId}`"
        @hover="(d, item, i) => emit('hover', d, item, i)" @activate="(item) => emit('activate', item)" />

    <div v-else-if="openChildItem && hasChildPanel"
        class="ui-context-menu ui-context-menu__panel ui-context-menu__panel--custom" role="dialog"
        :data-cm-panel="`${depth + 1}:${openChildId}`" :style="childStyle">
        <component :is="openChildItem.panel" v-bind="openChildItem.panelProps ?? {}" />
    </div>
</template>

<style scoped>
.ui-context-menu {
    position: fixed;
    z-index: var(--z-tooltip);
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding: var(--space-3);
    background: var(--bg-elev);
    border: var(--border-width-1) solid var(--border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg, var(--shadow-md));
    font-size: var(--text-sm);
    color: var(--fg);
    max-height: min(70vh, var(--ui-context-menu-max-height, 70vh));
    overflow-y: auto;
}

.ui-cm__item {
    display: contents;
}

.ui-cm__row {
    display: grid;
    grid-template-columns: 18px 1fr auto;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
    background: transparent;
    border: var(--border-width-1) solid transparent;
    border-radius: var(--radius-sm);
    color: var(--fg);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
        background-color var(--duration-fast) var(--ease-standard),
        color var(--duration-fast) var(--ease-standard);
}

.ui-cm__row:hover,
.ui-cm__row.is-focused {
    background: var(--bg-soft);
    color: var(--fg-strong);
}

.ui-cm__row.is-active {
    color: var(--accent);
}

.ui-cm__row.is-danger {
    color: var(--danger);
}

.ui-cm__row.is-danger:hover {
    background: var(--danger-soft);
}

.ui-cm__row.is-disabled,
.ui-cm__row:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    background: transparent;
}

.ui-cm__icon {
    width: 14px;
    height: 14px;
    color: var(--fg-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
}

.ui-cm__icon--placeholder {
    background: transparent;
}

.ui-cm__swatch {
    width: 14px;
    height: 14px;
    border-radius: var(--radius-xs);
    border: var(--border-width-1) solid var(--border);
}

.ui-cm__label {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.ui-cm__shortcut {
    font-size: var(--text-xs);
    color: var(--fg-subtle);
    font-family: var(--font-mono);
    letter-spacing: 0;
}

.ui-cm__check {
    color: var(--accent);
    display: inline-flex;
}

.ui-cm__chev {
    color: var(--fg-subtle);
    display: inline-flex;
}

.ui-cm__divider {
    height: 1px;
    margin: var(--space-2) calc(-1 * var(--space-3));
    background: var(--border);
}

.ui-cm__header {
    padding: var(--space-3) var(--space-4) var(--space-2);
    font-size: var(--text-2xs);
    font-weight: var(--font-weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--fg-subtle);
}
</style>
