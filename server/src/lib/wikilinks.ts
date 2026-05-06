/**
 * Wikilink parsing utilities.
 *
 * A wikilink uses the `[[Title]]` or `[[Title|alias]]` syntax. Escaped
 * sequences (`\[\[...]]`) are intentionally ignored so authors can opt out.
 * Titles may contain single square brackets; only the closing `]]` terminates
 * the link.
 */

const WIKILINK_RE = /(\\)?\[\[([^\n]+?)\]\]/g;

/**
 * Extract unique wikilink target titles from a body of text.
 *
 * - Strips any `|alias` portion.
 * - Trims whitespace inside the brackets.
 * - Deduplicates case-insensitively while preserving the casing of the first
 *   occurrence (so display in UI stays natural).
 * - Skips occurrences preceded by a backslash (escaped wikilinks).
 *
 * @param content Raw note content (markdown / plain text).
 * @returns Ordered list of unique titles referenced by the content.
 */
export function extractWikilinks(content: string): string[] {
  if (!content) return [];

  const seen = new Map<string, string>(); // lower -> first-seen casing
  for (const match of content.matchAll(WIKILINK_RE)) {
    const [, escape, inner] = match;
    if (escape) continue;
    const title = inner.split('|', 1)[0]?.trim();
    if (!title) continue;
    const key = title.toLowerCase();
    if (!seen.has(key)) seen.set(key, title);
  }
  return Array.from(seen.values());
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
