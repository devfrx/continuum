/**
 * Normalize note body excerpts for compact previews.
 *
 * Notes can arrive as Markdown-ish text, rich-editor HTML fragments, or
 * entity-escaped HTML snippets depending on which editor mode produced the
 * last save. Previews should show the readable text, never raw tags.
 */
export function cleanSnippet(input: string): string {
    return input
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&amp;/gi, '&')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '$1')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function excerptSnippet(input: string, maxLength = 140): string {
    const text = cleanSnippet(input);
    if (!text) return '';
    if (text.length <= maxLength) return text;
    const slice = text.slice(0, maxLength);
    const lastSpace = slice.lastIndexOf(' ');
    return `${(lastSpace > Math.floor(maxLength * 0.55) ? slice.slice(0, lastSpace) : slice).trimEnd()}…`;
}