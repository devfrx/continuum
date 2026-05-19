/**
 * Database view layout helpers shared by settings panels and renderers.
 *
 * The settings UI writes these keys into `DatabaseView.config.layout`;
 * every implemented renderer reads them through this module so the
 * contract stays centralised and the UI never exposes dead toggles.
 */
import type { Router } from 'vue-router';

export type OpenInMode = 'sidePeek' | 'centerPeek' | 'fullPage';

export interface CommonDisplayLayout {
  /** Show the row's note kind icon next to the title. Default `true`. */
  showPageIcon?: boolean;
  /** Wrap long title / property text across multiple lines. Default `false`. */
  wrapContent?: boolean;
  /** How clicking a row opens the note. Default `'fullPage'`. */
  openIn?: OpenInMode;
}

export interface ResolvedCommonDisplayLayout {
  showPageIcon: boolean;
  wrapContent: boolean;
  openIn: OpenInMode;
}

export const DATABASE_ROW_OPEN_EVENT = 'continuum:database-row-open';

export interface DatabaseRowOpenDetail {
  noteId: string;
  mode: OpenInMode;
}

/** Pull a typed common-display value out of an open layout record. */
export function readCommonDisplay(
  layout: Record<string, unknown> | null | undefined,
): ResolvedCommonDisplayLayout {
  const src = (layout ?? {}) as CommonDisplayLayout;
  return {
    showPageIcon: src.showPageIcon ?? true,
    wrapContent: src.wrapContent ?? false,
    openIn: src.openIn ?? 'fullPage',
  };
}

export function isPeekOpenMode(mode: OpenInMode): mode is 'sidePeek' | 'centerPeek' {
  return mode === 'sidePeek' || mode === 'centerPeek';
}

/**
 * Open a row's backing note according to the saved view layout.
 *
 * Peek modes are handled by `NotesView` via a cancelable custom event;
 * if no listener handles the event (e.g. future host surface), we fall
 * back to full-page navigation so row clicks never become inert.
 */
export function openDatabaseRow(router: Router, noteId: string, mode: OpenInMode): void {
  if (isPeekOpenMode(mode) && typeof window !== 'undefined') {
    const event = new CustomEvent<DatabaseRowOpenDetail>(DATABASE_ROW_OPEN_EVENT, {
      detail: { noteId, mode },
      cancelable: true,
    });
    const notHandled = window.dispatchEvent(event);
    if (!notHandled) return;
  }
  void router.push({ path: '/', query: { note: noteId } });
}

// ────────────────────────── Card layout knobs ──────────────────────────

/**
 * Optional card preview source for Board / Gallery layouts. Controls
 * what appears at the top of each card.
 *
 *   - `none`        no media block; only the title + properties (compact).
 *   - `pageCover`   the note's own cover image (or the picked
 *                   `coverPropertyId` file/url when set).
 *   - `properties`  the visible properties block becomes the primary
 *                   preview surface (useful for spec / index galleries).
 *   - `pageContent` first paragraph of the note's body, rendered as a
 *                   plain-text snippet.
 */
export type CardPreviewMode = 'none' | 'pageCover' | 'properties' | 'pageContent';

/** Card scale shared by Board and Gallery. */
export type CardSize = 'small' | 'medium' | 'large';

/**
 * High-level card flow. `compact` keeps cards in a packed grid while
 * `list` stacks them in a single column with wider rows — handy for
 * dense Kanban columns or reading-oriented galleries.
 */
export type CardLayout = 'compact' | 'list';

export interface CardDisplayLayout {
  /** Where the colour swatch is applied on Board columns. */
  colorColumns?: boolean;
  cardPreview?: CardPreviewMode;
  cardSize?: CardSize;
  cardLayout?: CardLayout;
  /** When true, the preview media is letterboxed to keep its full aspect. */
  fitMedia?: boolean;
}

export interface ResolvedCardDisplayLayout {
  colorColumns: boolean;
  cardPreview: CardPreviewMode;
  cardSize: CardSize;
  cardLayout: CardLayout;
  fitMedia: boolean;
}

/**
 * Pull a typed card-display value out of an open layout record. Honours
 * Notion-ish defaults: page cover preview, medium card, packed grid,
 * media fitted (letterboxed) so portrait images don't get clipped.
 */
export function readCardDisplay(
  layout: Record<string, unknown> | null | undefined,
): ResolvedCardDisplayLayout {
  const src = (layout ?? {}) as CardDisplayLayout;
  return {
    colorColumns: src.colorColumns ?? false,
    cardPreview: src.cardPreview ?? 'pageCover',
    cardSize: src.cardSize ?? 'medium',
    cardLayout: src.cardLayout ?? 'compact',
    fitMedia: src.fitMedia ?? true,
  };
}
