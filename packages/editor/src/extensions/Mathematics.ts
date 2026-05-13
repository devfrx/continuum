/**
 * KaTeX-powered inline math rendering.
 *
 * The official `@tiptap/extension-mathematics` extension is decoration
 * based: it scans the document for the configured regex (default:
 * `$...$`) and replaces each match with a KaTeX-rendered widget while
 * leaving the underlying source text intact. There is no dedicated
 * node — write `$E = mc^2$` anywhere and the formula renders live;
 * place the caret inside the dollars and the raw source returns so
 * editing keeps working.
 *
 * Scope is limited to a thin factory so call sites stay symmetric with
 * the other extension wrappers in this folder (`TrailingNode`,
 * `SlashCommand`, `TableOfContents`).
 */
import Mathematics from '@tiptap/extension-mathematics';
import type { Extension } from '@tiptap/core';
import type { MathematicsOptions } from '@tiptap/extension-mathematics';

/** Sensible defaults: never throw on a malformed expression so a stray
 *  `$` mid-paragraph cannot crash the editor — display the LaTeX source
 *  in red instead, mirroring KaTeX's `errorColor` convention. */
export function buildMathematics(
  overrides: Partial<MathematicsOptions> = {},
): Extension<MathematicsOptions, unknown> {
  return Mathematics.configure({
    katexOptions: {
      throwOnError: false,
      errorColor: 'var(--danger, #c62828)',
      ...overrides.katexOptions,
    },
    ...(overrides.regex ? { regex: overrides.regex } : {}),
    ...(overrides.shouldRender ? { shouldRender: overrides.shouldRender } : {}),
  });
}
