import { onBeforeUnmount, watch, type Ref } from 'vue';

/**
 * Minimum surface a context-menu item must expose for keyboard navigation.
 * Compatible with the `ContextMenuItem` type from `@continuum/shared` and
 * the locally-narrowed variant in `UiContextMenu.vue`.
 */
export interface KeyboardMenuItem {
    id: string;
    disabled?: boolean;
    divider?: boolean;
    header?: boolean;
    children?: KeyboardMenuItem[];
}

export interface UseContextMenuKeyboardOptions<T extends KeyboardMenuItem> {
    open: Ref<boolean>;
    items: Ref<T[]>;
    /** Open submenu chain — `openPath[level]` is the parent item id at that level. */
    openPath: Ref<string[]>;
    /** Currently focused index per open level. */
    focusIndex: Ref<number[]>;
    /** Called when Enter activates a leaf item (no children). */
    onActivate: (item: T) => void;
    /** Called when Escape is pressed at the root level. */
    onClose: () => void;
}

/**
 * Walks `items` along `openPath` to return the items visible at the given
 * level (level 0 = root).
 */
export function visibleItemsAt<T extends KeyboardMenuItem>(
    items: T[],
    openPath: string[],
    level: number,
): T[] {
    if (level === 0) return items;
    let current: T[] = items;
    for (let i = 0; i < level; i += 1) {
        const id = openPath[i];
        const node = current.find((n) => n.id === id);
        if (!node?.children) return [];
        current = node.children as T[];
    }
    return current;
}

/**
 * Keyboard navigation for a nested context menu:
 *   - ArrowUp / ArrowDown — move focus within the current level (wrapping,
 *     skipping headers/dividers/disabled rows).
 *   - ArrowRight / Enter on a parent — open its submenu and focus its first item.
 *   - ArrowLeft — close the current submenu (no-op at root).
 *   - Enter on a leaf — invoke `onActivate(item)`.
 *   - Escape — close the deepest submenu, or invoke `onClose()` at root.
 *
 * Listens on `window` while `open.value` is true and tears down on unmount.
 */
export function useContextMenuKeyboard<T extends KeyboardMenuItem>(
    opts: UseContextMenuKeyboardOptions<T>,
): {
    visibleItems: (level: number) => T[];
} {
    function getVisible(level: number): T[] {
        return visibleItemsAt(opts.items.value, opts.openPath.value, level);
    }

    function moveFocus(level: number, delta: number): void {
        const all = getVisible(level);
        const enabled = all.filter((i) => !i.divider && !i.header && !i.disabled);
        if (!enabled.length) return;
        const cur = opts.focusIndex.value[level] ?? 0;
        const curEnabledIdx = enabled.indexOf(all[cur] as T);
        const baseIdx = curEnabledIdx >= 0 ? curEnabledIdx : 0;
        let next = baseIdx + delta;
        if (next < 0) next = enabled.length - 1;
        if (next >= enabled.length) next = 0;
        const target = enabled[next]!;
        const slice = opts.focusIndex.value.slice(0, level + 1);
        slice[level] = all.indexOf(target);
        opts.focusIndex.value = slice;
    }

    function openSubmenu(level: number, item: T): void {
        opts.openPath.value = [...opts.openPath.value, item.id];
        const focus = [...opts.focusIndex.value];
        focus[level + 1] = 0;
        opts.focusIndex.value = focus;
    }

    function closeOneLevel(level: number): void {
        opts.openPath.value = opts.openPath.value.slice(0, -1);
        opts.focusIndex.value = opts.focusIndex.value.slice(0, level);
    }

    function onKeydown(e: KeyboardEvent): void {
        if (!opts.open.value) return;
        const level = opts.openPath.value.length;
        if (e.key === 'Escape') {
            e.preventDefault();
            if (level > 0) closeOneLevel(level);
            else opts.onClose();
            return;
        }
        if (e.key === 'ArrowDown') { e.preventDefault(); moveFocus(level, 1); return; }
        if (e.key === 'ArrowUp') { e.preventDefault(); moveFocus(level, -1); return; }
        if (e.key === 'ArrowRight') {
            const items = getVisible(level);
            const cur = items[opts.focusIndex.value[level] ?? 0];
            if (cur?.children?.length) {
                e.preventDefault();
                openSubmenu(level, cur);
            }
            return;
        }
        if (e.key === 'ArrowLeft') {
            if (level > 0) {
                e.preventDefault();
                closeOneLevel(level);
            }
            return;
        }
        if (e.key === 'Enter') {
            const items = getVisible(level);
            const cur = items[opts.focusIndex.value[level] ?? 0];
            if (!cur) return;
            e.preventDefault();
            if (cur.children?.length) openSubmenu(level, cur);
            else opts.onActivate(cur);
        }
    }

    watch(opts.open, (isOpen) => {
        if (isOpen) window.addEventListener('keydown', onKeydown, true);
        else window.removeEventListener('keydown', onKeydown, true);
    }, { immediate: true });

    onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown, true));

    return { visibleItems: getVisible };
}
