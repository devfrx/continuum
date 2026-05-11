/**
 * Markdown export for a single note.
 *
 * Notes are stored in PostgreSQL (`notes` table) as structured rows —
 * they are NOT physical Markdown files on disk. The editor body is
 * persisted as both rich-text JSON (`content_json`) and a Markdown-ish
 * string (`content`), so for an export we fetch the full row and
 * emit a `.md` file with YAML front-matter capturing
 * title/kind/tags/timestamps. The download is performed entirely
 * client-side via a Blob + anchor click, so no extra backend route
 * is needed.
 */
import { api } from '@/api';

export interface UseNoteExportOptions {
  /** Surfaced to the parent error pill (`Export failed: <message>`). */
  onError(message: string): void;
}

export interface UseNoteExportReturn {
  exportNoteAsMarkdown(id: string): Promise<void>;
}

export function useNoteExport(opts: UseNoteExportOptions): UseNoteExportReturn {
  async function exportNoteAsMarkdown(id: string): Promise<void> {
    if (!id) return;
    try {
      const note = await api.notes.get(id);
      const safeTitle = (note.title || 'untitled')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim() || 'untitled';
      const front = [
        '---',
        `title: ${JSON.stringify(note.title ?? '')}`,
        `kind: ${note.kind ?? 'note'}`,
        Array.isArray(note.tags) && note.tags.length
          ? `tags: [${note.tags.map((t) => JSON.stringify(t)).join(', ')}]`
          : null,
        note.createdAt ? `created: ${new Date(note.createdAt).toISOString()}` : null,
        note.updatedAt ? `updated: ${new Date(note.updatedAt).toISOString()}` : null,
        '---',
        '',
      ].filter(Boolean).join('\n');
      const body = (note.content ?? '').trimEnd();
      const blob = new Blob([`${front}${body}\n`], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${safeTitle}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      opts.onError(`Export failed: ${message}`);
    }
  }

  return { exportNoteAsMarkdown };
}
