/**
 * Slash-command extension for ContinuumEditor.
 *
 * Wraps Tiptap's official `@tiptap/suggestion` utility to listen for the
 * `/` trigger and surface a filterable, keyboard-navigable command menu.
 * The renderer (popup UI) is injected by the host so this module stays
 * pure logic — no Vue, no DOM — and remains trivially testable.
 *
 * Architecture:
 *   ┌─ SlashCommand (Tiptap Extension) ─ this file
 *   ├─ slashCommandItems.ts            ─ data-driven command catalog
 *   ├─ SlashCommandMenu.vue            ─ popup component (renderer impl)
 *   └─ index.ts                        ─ public surface
 */
import { Extension, type Editor, type Range } from '@tiptap/core';
import Suggestion, { type SuggestionOptions, type SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { SlashCommandItem } from './slashCommandItems';

/** Shared key so the suggestion plugin state can be queried externally. */
export const SlashCommandPluginKey = new PluginKey('continuum:slashCommand');

/**
 * Subset of suggestion props the renderer cares about. Re-typed here so
 * the popup component does not depend on `@tiptap/suggestion` directly,
 * keeping its imports framework-light and easy to mock in tests.
 */
export interface SlashRendererProps {
  editor: Editor;
  range: Range;
  query: string;
  items: SlashCommandItem[];
  /** Run the given item's action and close the menu. */
  command: (item: SlashCommandItem) => void;
  /** Live caret/trigger rect — used to position the popup. */
  clientRect: (() => DOMRect | null) | null;
}

export interface SlashRendererInstance {
  onStart(props: SlashRendererProps): void;
  onUpdate(props: SlashRendererProps): void;
  /** Return `true` if the keystroke was consumed (prevents default). */
  onKeyDown(props: { event: KeyboardEvent }): boolean;
  onExit(): void;
}

export interface SlashCommandOptions {
  /** Catalog of available commands. */
  items: SlashCommandItem[];
  /** Maximum number of items shown after filtering. A value <= 0 disables the cap. */
  limit: number;
  /** Renderer factory — called once per active suggestion session. */
  render: () => SlashRendererInstance;
}

/**
 * Case-insensitive token match against `title + description + keywords`.
 * A trimmed empty query returns the full list so the user immediately
 * sees what is available after typing `/`.
 */
function filterItems(items: SlashCommandItem[], rawQuery: string, limit: number): SlashCommandItem[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return items;
  const hasLimit = limit > 0;
  const out: SlashCommandItem[] = [];
  for (const item of items) {
    const haystack = [item.title, item.description, ...(item.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    if (haystack.includes(q)) {
      out.push(item);
      if (hasLimit && out.length >= limit) break;
    }
  }
  return out;
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: 'continuumSlashCommand',

  addOptions() {
    return {
      items: [],
      limit: 0,
      render: () => ({
        onStart: () => undefined,
        onUpdate: () => undefined,
        onKeyDown: () => false,
        onExit: () => undefined,
      }),
    };
  },

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: '/',
        // Allow `/` anywhere in a regular text block (not just line start)
        // so users can recover from a typo without re-positioning.
        startOfLine: false,
        // Treat the keystroke that produced `/` after a non-letter as a
        // fresh trigger; matches Notion's "type / to invoke menu" rule.
        allowSpaces: false,
        pluginKey: SlashCommandPluginKey,

        // Block inside code blocks, tables, and any node where slash is
        // legitimate user content. Headings and paragraphs are fine.
        allow: ({ state }) => {
          const $from = state.selection.$from;
          for (let depth = $from.depth; depth >= 0; depth--) {
            const name = $from.node(depth).type.name;
            if (name === 'codeBlock' || name === 'table') return false;
          }
          return true;
        },

        items: ({ query }) => filterItems(this.options.items, query, this.options.limit),

        command: ({ editor, range, props }) => {
          (props as SlashCommandItem).action({ editor, range });
        },

        // Bridge Tiptap's suggestion lifecycle into our renderer. We cast
        // through our narrower `SlashRendererProps` to keep the popup API
        // independent of the underlying suggestion library.
        render: () => {
          const renderer = this.options.render();
          const toProps = (p: SuggestionProps<SlashCommandItem>): SlashRendererProps => ({
            editor: p.editor,
            range: p.range,
            query: p.query,
            items: p.items,
            clientRect: p.clientRect ?? null,
            command: (item) => p.command(item),
          });
          return {
            onStart: (p) => renderer.onStart(toProps(p)),
            onUpdate: (p) => renderer.onUpdate(toProps(p)),
            onKeyDown: ({ event }) => renderer.onKeyDown({ event }),
            onExit: () => renderer.onExit(),
          };
        },
      } as SuggestionOptions<SlashCommandItem>),
    ];
  },
});
