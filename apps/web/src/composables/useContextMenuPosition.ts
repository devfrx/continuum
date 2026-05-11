import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue';

/**
 * Style object applied to the root context-menu panel (point-anchored).
 */
export interface ContextMenuRootStyle {
    top: string;
    left: string;
    minWidth: string;
    maxHeight: string;
}

/**
 * Style object applied to a single submenu panel (anchored to its parent row).
 */
export interface ContextMenuSubStyle {
    top: string;
    left: string;
}

interface ViewportRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

function viewportBounds(): ViewportRect {
    const v = window.visualViewport;
    return {
        left: v?.offsetLeft ?? 0,
        top: v?.offsetTop ?? 0,
        width: v?.width ?? window.innerWidth,
        height: v?.height ?? window.innerHeight,
    };
}

export interface UseContextMenuPositionOptions {
    open: Ref<boolean>;
    /** Anchor point in viewport space (typically `event.clientX/Y`). */
    x: Ref<number>;
    y: Ref<number>;
    /** Min panel width in px (used for both root and submenu computation). */
    minWidth: Ref<number>;
    /** Reference to the root panel element (needed for measurement). */
    rootRef: Ref<HTMLElement | null>;
    /** Open submenu chain — `openPath[level]` is the parent item id at that level. */
    openPath: Ref<string[]>;
}

/**
 * Positioning for point-anchored context menus with nested submenus.
 *
 * Distinct from `useFloatingPosition`, which anchors a panel below a
 * trigger element: here the root panel is placed at an arbitrary `(x, y)`
 * point (e.g. mouse coordinates from a right-click) and clamped to the
 * viewport. Submenus are positioned relative to their parent row's DOM
 * rect with viewport-aware horizontal flipping (right → left when
 * overflowing) and vertical clamping.
 *
 * Submenus are looked up in the DOM via `[data-cm-level][data-cm-id]`
 * row attributes and `[data-cm-panel="${level}:${id}"]` panel attributes,
 * so the consuming component must set those data-attrs on each row and
 * each rendered submenu panel.
 */
export function useContextMenuPosition(opts: UseContextMenuPositionOptions): {
    rootStyle: Ref<ContextMenuRootStyle>;
    subStyles: Ref<Record<string, ContextMenuSubStyle>>;
    repositionRoot: () => Promise<void>;
    repositionSubmenus: () => Promise<void>;
    panelMaxHeight: () => string;
} {
    const pad = 8;

    const rootStyle = ref<ContextMenuRootStyle>({
        top: '0px',
        left: '0px',
        minWidth: `${opts.minWidth.value}px`,
        maxHeight: '70vh',
    });

    const subStyles = ref<Record<string, ContextMenuSubStyle>>({});

    function panelMaxHeight(): string {
        return `${Math.max(160, viewportBounds().height - 16)}px`;
    }

    function clampPosition(x: number, y: number, w: number, h: number): { top: number; left: number } {
        const v = viewportBounds();
        const maxLeft = v.left + Math.max(pad, v.width - w - pad);
        const maxTop = v.top + Math.max(pad, v.height - h - pad);
        // Floor at `pad` so the panel never escapes off the top/left even when
        // the content is taller/wider than the viewport (in which case the
        // panel's own internal scroll handles overflow).
        return {
            top: Math.max(v.top + pad, Math.min(y, maxTop)),
            left: Math.max(v.left + pad, Math.min(x, maxLeft)),
        };
    }

    async function repositionRoot(): Promise<void> {
        await nextTick();
        const el = opts.rootRef.value;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const { top, left } = clampPosition(opts.x.value, opts.y.value, rect.width, rect.height);
        rootStyle.value = {
            top: `${top}px`,
            left: `${left}px`,
            minWidth: `${opts.minWidth.value}px`,
            maxHeight: panelMaxHeight(),
        };
    }

    function computeSubmenuPosition(level: number, id: string, h: number): ContextMenuSubStyle | null {
        const row = document.querySelector<HTMLElement>(
            `[data-cm-level="${level}"][data-cm-id="${id}"]`,
        );
        if (!row) return null;
        const v = viewportBounds();
        const w = opts.minWidth.value;
        const rect = row.getBoundingClientRect();
        const viewportRight = v.left + v.width;
        const viewportBottom = v.top + v.height;
        const left = rect.right + 4 + w > viewportRight - pad
            ? Math.max(v.left + pad, rect.left - w - 4)
            : rect.right + 4;
        let top = rect.top;
        if (top + h > viewportBottom - pad) {
            top = Math.max(v.top + pad, viewportBottom - pad - h);
        }
        return { top: `${top}px`, left: `${left}px` };
    }

    async function repositionSubmenus(): Promise<void> {
        await nextTick();
        const next: Record<string, ContextMenuSubStyle> = {};
        // First pass: estimate using a conservative 320px so panels don't flash
        // off-screen before measurement.
        for (let level = 0; level < opts.openPath.value.length; level += 1) {
            const id = opts.openPath.value[level]!;
            const pos = computeSubmenuPosition(level, id, 320);
            if (pos) next[`${level}:${id}`] = pos;
        }
        subStyles.value = next;
        // Second pass: measure each rendered panel and adjust if needed.
        await nextTick();
        const adjusted: Record<string, ContextMenuSubStyle> = { ...next };
        for (let level = 0; level < opts.openPath.value.length; level += 1) {
            const id = opts.openPath.value[level]!;
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

    function onWindowReposition(): void {
        if (opts.open.value) {
            void repositionRoot();
            void repositionSubmenus();
        }
    }

    watch(opts.open, (isOpen) => {
        if (isOpen) {
            window.addEventListener('resize', onWindowReposition);
            window.addEventListener('scroll', onWindowReposition, true);
        } else {
            window.removeEventListener('resize', onWindowReposition);
            window.removeEventListener('scroll', onWindowReposition, true);
        }
    });

    watch(
        () => [opts.x.value, opts.y.value],
        () => { if (opts.open.value) void repositionRoot(); },
    );

    watch(
        opts.openPath,
        () => { if (opts.open.value) void repositionSubmenus(); },
        { deep: true },
    );

    onBeforeUnmount(() => {
        window.removeEventListener('resize', onWindowReposition);
        window.removeEventListener('scroll', onWindowReposition, true);
    });

    return { rootStyle, subStyles, repositionRoot, repositionSubmenus, panelMaxHeight };
}
