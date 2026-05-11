import { onBeforeUnmount, ref, watch, type Ref } from 'vue';

/**
 * Reactive style object applied to a teleported floating panel.
 *
 * Typed as a string-keyed dict so it satisfies Vue's `CSSProperties`
 * (which carries an index signature for `--*` custom properties).
 */
export type FloatingPositionStyle = {
    top: string;
    left: string;
    width: string;
    minWidth: string;
    maxHeight: string;
} & Record<string, string>;

export interface UseFloatingPositionOptions {
    /** Element the panel anchors to (e.g. a select trigger button). */
    triggerRef: Ref<HTMLElement | null>;
    /** The panel element itself, needed to measure its scrollHeight. */
    panelRef: Ref<HTMLElement | null>;
    /** When true, scroll/resize listeners are attached and `reposition()` is honoured. */
    open: Ref<boolean>;
    /** Hard cap on panel height in px. Defaults to 320. */
    maxHeight?: number;
    /** Floor for panel width in px when the trigger is narrower. Defaults to 160. */
    minWidth?: number;
    /** Padding from viewport edges in px. Defaults to 8. */
    pad?: number;
}

/**
 * Anchors a teleported popup beneath an element trigger and flips it above
 * when the panel would overflow the viewport bottom. Re-positions on
 * window scroll/resize while open.
 *
 * Use this for trigger-anchored popups (selects, dropdowns, comboboxes).
 * For point-anchored popups (right-click menus opened at mouse coords),
 * see `useContextMenuPosition`.
 */
export function useFloatingPosition(opts: UseFloatingPositionOptions): {
    style: Ref<FloatingPositionStyle>;
    reposition: () => void;
} {
    const maxH = opts.maxHeight ?? 320;
    const minW = opts.minWidth ?? 160;
    const pad = opts.pad ?? 8;

    const style = ref<FloatingPositionStyle>({
        top: '0px',
        left: '0px',
        width: 'auto',
        minWidth: '0px',
        maxHeight: `${maxH}px`,
    });

    function reposition(): void {
        const trigger = opts.triggerRef.value;
        const panel = opts.panelRef.value;
        if (!trigger || !panel) return;

        const tRect = trigger.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        const panelHeight = Math.min(panel.scrollHeight, maxH);
        const spaceBelow = vh - tRect.bottom - pad;
        const spaceAbove = tRect.top - pad;
        const placeAbove = spaceBelow < panelHeight && spaceAbove > spaceBelow;

        const top = placeAbove
            ? Math.max(pad, tRect.top - panelHeight - 4)
            : Math.min(vh - panelHeight - pad, tRect.bottom + 4);

        const width = Math.max(tRect.width, minW);
        const left = Math.max(pad, Math.min(tRect.left, vw - width - pad));

        style.value = {
            top: `${top}px`,
            left: `${left}px`,
            width: `${width}px`,
            minWidth: `${tRect.width}px`,
            maxHeight: `${Math.max(120, placeAbove ? spaceAbove : spaceBelow)}px`,
        };
    }

    function onWindowReposition(): void {
        if (opts.open.value) reposition();
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

    onBeforeUnmount(() => {
        window.removeEventListener('resize', onWindowReposition);
        window.removeEventListener('scroll', onWindowReposition, true);
    });

    return { style, reposition };
}
