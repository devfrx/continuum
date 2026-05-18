/**
 * Database node — embeds a Notion-like Database into the document.
 *
 * Storage strategy mirrors `Chart.ts`: the node is an atom whose entire
 * payload is serialized as a JSON string in `data-database`. This keeps
 * the schema flat (one node, one attribute) and survives Tiptap's HTML
 * round-trip without bespoke serialization.
 *
 * The payload itself is intentionally narrow: a stable `blockId` (used
 * to scope ephemeral UI state like sticky view tabs), the `databaseId`
 * the block points at (`null` while the user hasn't picked one yet),
 * the active `viewId`, and a `schemaVersion` so future migrations can
 * gate on it. Row data, schema and views all live server-side keyed by
 * `databaseId`; the editor never serializes that content into the doc.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import {
  DATABASE_BLOCK_SCHEMA_VERSION,
  createDatabaseBlockAttrs,
  type DatabaseBlockAttrs,
} from '@continuum/shared';

function safeParse(raw: string | null): DatabaseBlockAttrs {
  const fallback = createDatabaseBlockAttrs(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `block-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<DatabaseBlockAttrs>;
    return {
      blockId: typeof parsed.blockId === 'string' ? parsed.blockId : fallback.blockId,
      databaseId: typeof parsed.databaseId === 'string' ? parsed.databaseId : null,
      viewId: typeof parsed.viewId === 'string' ? parsed.viewId : null,
      schemaVersion:
        typeof parsed.schemaVersion === 'number'
          ? parsed.schemaVersion
          : DATABASE_BLOCK_SCHEMA_VERSION,
    };
  } catch {
    return fallback;
  }
}

export const Database = Node.create({
  name: 'database',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: {
        default: '',
        parseHTML: (el) => safeParse(el.getAttribute('data-database')).blockId,
      },
      databaseId: {
        default: null as string | null,
        parseHTML: (el) => safeParse(el.getAttribute('data-database')).databaseId,
      },
      viewId: {
        default: null as string | null,
        parseHTML: (el) => safeParse(el.getAttribute('data-database')).viewId,
      },
      schemaVersion: {
        default: DATABASE_BLOCK_SCHEMA_VERSION,
        parseHTML: (el) => safeParse(el.getAttribute('data-database')).schemaVersion,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="database"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const payload: DatabaseBlockAttrs = {
      blockId: node.attrs.blockId,
      databaseId: node.attrs.databaseId,
      viewId: node.attrs.viewId,
      schemaVersion: node.attrs.schemaVersion ?? DATABASE_BLOCK_SCHEMA_VERSION,
    };
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'database',
        'data-database': JSON.stringify(payload),
        class: 'continuum-database',
      }),
    ];
  },
});
