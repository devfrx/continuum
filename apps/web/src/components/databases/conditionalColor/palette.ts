/**
 * databases/conditionalColor/palette.ts — colour catalogue for the
 * conditional-color engine.
 *
 * Each token carries:
 *   – a *swatch* (saturated dot shown in pickers and pills),
 *   – a *background* (tinted page colour used when the rule scope is
 *     `background`), and
 *   – a *text* colour (high-contrast ink used when the rule scope is
 *     `text`, and applied on top of `background` tints to stay
 *     legible).
 *
 * Tokens deliberately mirror Notion's named palette so the UX feels
 * familiar; values are tuned for the app's dark theme but degrade
 * gracefully on a light surface because they keep a noticeable hue
 * even at low alpha. Keep the list ordered as the picker should
 * display it — UI consumers iterate `DATABASE_COLOR_TOKENS` directly.
 */
import type { DatabaseColorTokenId } from '@continuum/shared';

export interface DatabaseColorToken {
    /** Stable id persisted on the rule and looked up at render time. */
    readonly id: DatabaseColorTokenId;
    /** Picker label. */
    readonly label: string;
    /** Saturated dot shown in the picker / rule chip. */
    readonly swatch: string;
    /** Tinted surface used when the rule scope is `background`. */
    readonly background: string;
    /** Ink colour used by `text`-scope rules and on top of backgrounds. */
    readonly text: string;
}

/**
 * Canonical palette. `default` is a no-op token (rendered as a hollow
 * swatch in the picker) used to clear a rule's colour without removing
 * the rule itself.
 */
export const DATABASE_COLOR_TOKENS: readonly DatabaseColorToken[] = [
    { id: 'default', label: 'Default', swatch: 'transparent', background: 'transparent', text: 'var(--text-primary)' },
    { id: 'gray',    label: 'Gray',    swatch: '#9B9A97', background: 'rgba(155, 154, 151, 0.18)', text: '#D9D9D7' },
    { id: 'brown',   label: 'Brown',   swatch: '#A47864', background: 'rgba(164, 120, 100, 0.22)', text: '#D4B6A5' },
    { id: 'orange',  label: 'Orange',  swatch: '#D9730D', background: 'rgba(217, 115, 13, 0.22)',  text: '#F5B575' },
    { id: 'yellow',  label: 'Yellow',  swatch: '#DFAB01', background: 'rgba(223, 171, 1, 0.20)',   text: '#EFD27A' },
    { id: 'green',   label: 'Green',   swatch: '#0F7B6C', background: 'rgba(15, 123, 108, 0.22)',  text: '#7AC3B5' },
    { id: 'blue',    label: 'Blue',    swatch: '#0B6E99', background: 'rgba(11, 110, 153, 0.22)',  text: '#78B7D6' },
    { id: 'purple',  label: 'Purple',  swatch: '#6940A5', background: 'rgba(105, 64, 165, 0.22)',  text: '#B59DDB' },
    { id: 'pink',    label: 'Pink',    swatch: '#AD1A72', background: 'rgba(173, 26, 114, 0.22)',  text: '#E089BB' },
    { id: 'red',     label: 'Red',     swatch: '#E03E3E', background: 'rgba(224, 62, 62, 0.22)',   text: '#F08A8A' },
] as const;

const TOKEN_BY_ID = new Map<DatabaseColorTokenId, DatabaseColorToken>(
    DATABASE_COLOR_TOKENS.map((t) => [t.id, t]),
);

/** O(1) lookup with a safe fallback to the `default` token. */
export function colorTokenById(id: DatabaseColorTokenId | null | undefined): DatabaseColorToken {
    if (id && TOKEN_BY_ID.has(id)) return TOKEN_BY_ID.get(id)!;
    return DATABASE_COLOR_TOKENS[0];
}
