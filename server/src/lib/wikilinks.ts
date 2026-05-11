/**
 * Wikilink parsing utilities — thin server-side shim around the canonical
 * implementation in `@continuum/shared`.
 *
 * A wikilink uses the `[[Title]]` or `[[Title|alias]]` syntax. Escaped
 * sequences (`\[\[...]]`) are intentionally ignored so authors can opt out.
 * Titles may contain single square brackets; only the closing `]]` terminates
 * the link.
 */

import { extractWikilinkTargets, getWikilinkPattern } from '@continuum/shared';

export { getWikilinkPattern };

/**
 * Extract unique wikilink target titles from a body of text.
 *
 * Preserved as a stable named export for existing server code; the
 * implementation lives in `@continuum/shared` so the web client and the
 * server agree on parsing semantics.
 *
 * @param content Raw note content (markdown / plain text).
 * @returns Ordered list of unique titles referenced by the content.
 */
export function extractWikilinks(content: string): string[] {
  return extractWikilinkTargets(content);
}

/**
 * Resolve extracted wikilink titles against an in-memory title→id map.
 *
 * Lookup is case-insensitive. Unresolved titles are returned with `id: null`
 * so callers can decide whether to surface them (e.g. as broken links).
 *
 * @param titles            Titles produced by {@link extractWikilinks}.
 * @param notesByTitleLower Map keyed by `title.toLowerCase()` → note id.
 */
export function resolveTitlesToIds(
  titles: string[],
  notesByTitleLower: Map<string, string>,
): Array<{ title: string; id: string | null }> {
  return titles.map((title) => ({
    title,
    id: notesByTitleLower.get(title.toLowerCase()) ?? null,
  }));
}
