<script setup lang="ts">
/**
 * Generic floating contextual menu with nested submenus.
 *
 * Use cases: right-click menus, command palettes, transform menus.
 * Renders into <body> via <Teleport>, positions itself at the given
 * (x, y) coordinates and clamps to the viewport so submenus never
 * overflow off-screen.
 *
 * Items can be nested (children) — submenus open on hover or via
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
 */
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { ContextMenuItem as SharedContextMenuItem } from '@continuum/shared';
import Icon from './Icon.vue';
import type { IconName } from './icons';

/**
 * Local re-typing that narrows `icon` to the apps/web `IconName` union
 * while staying structurally compatible with `@continuum/shared`.
 */
export type ContextMenuItem = Omit<SharedContextMenuItem, 'icon' | 'children'> & {
    icon?: IconName;
    children?: ContextMenuItem[];
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

const rootRef = ref<HTMLElement | null>(null);

/** Stack of open submenu paths (root id chain). */
const openPath = ref<string[]>([]);
/** Index of the focused item per menu level. */
const focusIndex = ref<number[]>([0]);

const rootStyle = ref<{ top: string; left: string; minWidth: string }>({
    top: '0px', left: '0px', minWidth: `${props.minWidth}px`,
});

function clampPosition(x: number, y: number, w: number, h: number) {
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Floor at `pad` so the panel never escapes off the top/left even when
    // the content is taller/wider than the viewport (in which case the
    // panel's own internal scroll handles overflow).
    const left = Math.max(pad, Math.min(x, Math.max(pad, vw - w - pad)));
    const top = Math.max(pad, Math.min(y, Math.max(pad, vh - h - pad)));
    return { top, left };
}

async function reposition() {
    await nextTick();
    const el = rootRef.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { top, left } = clampPosition(props.x, props.y, rect.width, rect.height);
    rootStyle.value = {
        top: `${top}px`,
        left: `${left}px`,
        minWidth: `${props.minWidth}px`,
    };
}

function close() {
    if (!props.modelValue) return;
    openPath.value = [];
    focusIndex.value = [0];
    emit('update:modelValue', false);
}

function onSelectItem(item: ContextMenuItem) {
    if (item.disabled || item.divider || item.header) return;
    if (item.children?.length) return; // submenu trigger only
    item.onSelect?.();
    emit('select', item);
    close();
}

function onItemPointerEnter(level: number, item: ContextMenuItem, idx: number) {
    focusIndex.value = focusIndex.value.slice(0, level + 1);
    focusIndex.value[level] = idx;
    if (item.children?.length) {
        openPath.value = [...openPath.value.slice(0, level), item.id];
        focusIndex.value[level + 1] = 0;
    } else {
        openPath.value = openPath.value.slice(0, level);
    }
}

function isOpenSubmenu(level: number, item: ContextMenuItem): boolean {
    return openPath.value[level] === item.id;
}
// Suppress "declared but unused" — kept as a public helper for templates
// that might want to introspect submenu state in the future.
void isOpenSubmenu;

/* ── keyboard ─────────────────────────────────────────────────── */

function visibleItems(level: number): ContextMenuItem[] {
    if (level === 0) return props.items;
    // Walk the path to find the current submenu items.
    let current = props.items;
    for (let i = 0; i < level; i += 1) {
        const id = openPath.value[i];
        const node = current.find((n) => n.id === id);
        if (!node?.children) return [];
        current = node.children;
    }
    return current;
}

function moveFocus(level: number, delta: number) {
    const items = visibleItems(level).filter((i) => !i.divider && !i.header && !i.disabled);
    if (!items.length) return;
    const cur = focusIndex.value[level] ?? 0;
    let next = cur + delta;
    if (next < 0) next = items.length - 1;
    if (next >= items.length) next = 0;
    // Map back to absolute index in the unfiltered list.
    const target = items[next];
    const all = visibleItems(level);
    focusIndex.value = focusIndex.value.slice(0, level + 1);
    focusIndex.value[level] = all.indexOf(target);
}

function onKeydown(e: KeyboardEvent) {
    if (!props.modelValue) return;
    const level = openPath.value.length;
    if (e.key === 'Escape') {
        e.preventDefault();
        if (level > 0) {
            openPath.value = openPath.value.slice(0, -1);
            focusIndex.value = focusIndex.value.slice(0, level);
        } else {
            close();
        }
        return;
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(level, 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(level, -1); return; }
    if (e.key === 'ArrowRight') {
        const items = visibleItems(level);
        const cur = items[focusIndex.value[level] ?? 0];
        if (cur?.children?.length) {
            e.preventDefault();
            openPath.value = [...openPath.value, cur.id];
            focusIndex.value[level + 1] = 0;
        }
        return;
    }
    if (e.key === 'ArrowLeft') {
        if (level > 0) {
            e.preventDefault();
            openPath.value = openPath.value.slice(0, -1);
            focusIndex.value = focusIndex.value.slice(0, level);
        }
        return;
    }
    if (e.key === 'Enter') {
        const items = visibleItems(level);
        const cur = items[focusIndex.value[level] ?? 0];
        if (cur) {
            e.preventDefault();
            if (cur.children?.length) {
                openPath.value = [...openPath.value, cur.id];
                focusIndex.value[level + 1] = 0;
            } else {
                onSelectItem(cur);
            }
        }
    }
}

function onBackdropPointerDown(e: PointerEvent) {
    const root = rootRef.value;
    if (!root) return;
    if (root.contains(e.target as Node)) return;
    // Also check submenu panels rendered as siblings via the same teleport.
    const panels = document.querySelectorAll('.ui-context-menu__panel');
    for (const p of panels) {
        if (p.contains(e.target as Node)) return;
    }
    close();
}

watch(
    () => props.modelValue,
    async (open) => {
        if (open) {
            openPath.value = [];
            focusIndex.value = [0];
            await reposition();
            window.addEventListener('keydown', onKeydown, true);
            window.addEventListener('pointerdown', onBackdropPointerDown, true);
            window.addEventListener('resize', reposition);
            window.addEventListener('scroll', reposition, true);
        } else {
            window.removeEventListener('keydown', onKeydown, true);
            window.removeEventListener('pointerdown', onBackdropPointerDown, true);
            window.removeEventListener('resize', reposition);
            window.removeEventListener('scroll', reposition, true);
        }
    },
    { immediate: true },
);

watch(
    () => [props.x, props.y],
    () => { if (props.modelValue) reposition(); },
);

onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true);
    window.removeEventListener('pointerdown', onBackdropPointerDown, true);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
});

defineExpose({ close });

/* ── submenu position helper ──────────────────────────────────── */

/**
 * Position styles per open submenu, keyed by `${level}:${itemId}`.
 *
 * Computed in two passes:
 *   1. Initial pass on `openPath` change uses the parent row rect plus an
 *      estimated height (so the panel doesn't render off-screen).
 *   2. After the panel mounts (`nextTick`), we re-measure its real height
 *      and shift it up if it would overflow the viewport bottom.
 *
 * This guarantees that — even when the root menu is opened near the bottom
 * of the page — long submenus (Color, Code language, …) stay fully visible
 * and clickable without internal scrolling artifacts.
 */
const subStyles = ref<Record<string, { top: string; left: string }>>({});

function computeSubmenuPosition(level: number, id: string, h: number): { top: string; left: string } | null {
    const row = document.querySelector<HTMLElement>(
        `[data-cm-level="${level}"][data-cm-id="${id}"]`,
    );
    if (!row) return null;
    const pad = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = props.minWidth;
    const rect = row.getBoundingClientRect();
    const left = rect.right + 4 + w > vw - pad
        ? Math.max(pad, rect.left - w - 4)
        : rect.right + 4;
    // Default: align top with parent row. Then clamp so bottom fits.
    let top = rect.top;
    if (top + h > vh - pad) top = Math.max(pad, vh - pad - h);
    return { top: `${top}px`, left: `${left}px` };
}

async function repositionSubmenus() {
    await nextTick();
    const next: Record<string, { top: string; left: string }> = {};
    // First pass: estimate using a conservative 320px so panels don't flash
    // off-screen before measurement.
    for (let level = 0; level < openPath.value.length; level += 1) {
        const id = openPath.value[level];
        const pos = computeSubmenuPosition(level, id, 320);
        if (pos) next[`${level}:${id}`] = pos;
    }
    subStyles.value = next;
    // Second pass: measure each rendered panel and adjust if needed.
    await nextTick();
    const adjusted: Record<string, { top: string; left: string }> = { ...next };
    for (let level = 0; level < openPath.value.length; level += 1) {
        const id = openPath.value[level];
        const panel = document.querySelector<HTMLElement>(
            `.ui-context-menu__panel[data-cm-panel="${level + 1}:${id}"]`,
        );
        if (!panel) continue;
        const realH = panel.getBoundingClientRect().height;
        const pos = computeSubmenuPosition(level, id, realH);
        if (pos) adjusted[`${level}:${id}`] = pos;
    }
    subStyles.value = adjusted;
}

watch(openPath, () => { if (props.modelValue) repositionSubmenus(); }, { deep: true });
</script>

<template>
    <Teleport to="body">
        <Transition name="ui-cm">
            <div v-if="modelValue" ref="rootRef" class="ui-context-menu ui-context-menu__panel" role="menu"
                :style="rootStyle">
                <template v-for="(item, idx) in items" :key="item.id">
                    <div v-if="item.divider" class="ui-cm__divider" role="separator" />
                    <div v-else-if="item.header" class="ui-cm__header">{{ item.label }}</div>
                    <button v-else type="button" class="ui-cm__row" role="menuitem" :data-cm-level="0"
                        :data-cm-id="item.id" :class="{
                            'is-active': item.active,
                            'is-disabled': item.disabled,
                            'is-danger': item.danger,
                            'is-focused': focusIndex[0] === idx,
                            'has-children': !!item.children?.length,
                        }" :disabled="item.disabled" @pointerenter="onItemPointerEnter(0, item, idx)" @click="onSelectItem(item)">
                        <span v-if="item.swatch" class="ui-cm__swatch" :style="{ background: item.swatch }" />
                        <Icon v-else-if="item.icon" :name="item.icon" :size="14" class="ui-cm__icon" />
                        <span v-else class="ui-cm__icon ui-cm__icon--placeholder" />
                        <span class="ui-cm__label">{{ item.label }}</span>
                        <span v-if="item.active" class="ui-cm__check">
                            <Icon name="check" :size="12" />
                        </span>
                        <span v-else-if="item.shortcut" class="ui-cm__shortcut">{{ item.shortcut }}</span>
                        <span v-else-if="item.children?.length" class="ui-cm__chev">
                            <Icon name="chevron-right" :size="12" />
                        </span>
                    </button>
                </template>
            </div>

            <!-- Submenu panels: one per open level -->
        </Transition>

        <template v-for="(id, level) in openPath" :key="`sub-${level}-${id}`">
            <div v-if="modelValue" class="ui-context-menu ui-context-menu__panel" role="menu"
                :data-cm-panel="`${level + 1}:${id}`" :style="{
                    ...subStyles[`${level}:${id}`],
                    minWidth: `${minWidth}px`,
                }">
                <template v-for="(item, idx) in visibleItems(level + 1)" :key="item.id">
                    <div v-if="item.divider" class="ui-cm__divider" role="separator" />
                    <div v-else-if="item.header" class="ui-cm__header">{{ item.label }}</div>
                    <button v-else type="button" class="ui-cm__row" role="menuitem" :data-cm-level="level + 1"
                        :data-cm-id="item.id" :class="{
                            'is-active': item.active,
                            'is-disabled': item.disabled,
                            'is-danger': item.danger,
                            'is-focused': focusIndex[level + 1] === idx,
                            'has-children': !!item.children?.length,
                        }" :disabled="item.disabled" @pointerenter="onItemPointerEnter(level + 1, item, idx)"
                        @click="onSelectItem(item)">
                        <span v-if="item.swatch" class="ui-cm__swatch" :style="{ background: item.swatch }" />
                        <Icon v-else-if="item.icon" :name="item.icon" :size="14" class="ui-cm__icon" />
                        <span v-else class="ui-cm__icon ui-cm__icon--placeholder" />
                        <span class="ui-cm__label">{{ item.label }}</span>
                        <span v-if="item.active" class="ui-cm__check">
                            <Icon name="check" :size="12" />
                        </span>
                        <span v-else-if="item.shortcut" class="ui-cm__shortcut">{{ item.shortcut }}</span>
                        <span v-else-if="item.children?.length" class="ui-cm__chev">
                            <Icon name="chevron-right" :size="12" />
                        </span>
                    </button>
                </template>
            </div>
        </template>
    </Teleport>
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
    max-height: 70vh;
    overflow-y: auto;
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
