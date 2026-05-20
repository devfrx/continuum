/**
 * Database node — embeds a Notion-like Database block into the document.
 *
 * Storage strategy mirrors `Chart.ts`: the node is an atom whose entire
 * payload is serialized as a JSON string in `data-database`. This keeps
 * the schema flat (one node, one attribute) and survives Tiptap's HTML
 * round-trip without bespoke serialization.
 *
 * Payload (schema v3):
 *   - `blockId`        — stable id (used to scope ephemeral UI state and
 *                        the server-side `database_block_views.block_id`).
 *   - `activeViewId`   — id of the currently visible `BlockView`, or
 *                        `null` while the block has no views yet
 *                        (unbound picker state).
 *   - `initialView`    — one-shot creation intent used by slash commands
 *                        such as "Line chart" / "Board view" before the
 *                        first server-backed block view exists.
 *   - `schemaVersion`  — version stamp so future migrations can gate.
 *
 * v1 → v2 migration: legacy blocks stored `databaseId` and `viewId`
 * directly. Those fields are silently dropped on load; the v2 block
 * starts unbound and the user re-links the datasource via the picker.
 * (The corresponding `database_views` table is dropped server-side, so
 * the legacy `viewId` is meaningless anyway.)
 *
 * Row data, schema and views all live server-side keyed by `blockId` /
 * `dataSourceDatabaseId`; the editor never serializes that content into
 * the doc.
 */
import { Node, mergeAttributes } from '@tiptap/core';
import {
  DATABASE_VIEW_TYPES,
  DATABASE_BLOCK_SCHEMA_VERSION,
  createDatabaseBlockAttrs,
  type DatabaseBlockInitialView,
  type DatabaseBlockAttrs,
} from '@continuum/shared';

function safeInitialView(value: unknown): DatabaseBlockInitialView | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<DatabaseBlockInitialView>;
  if (!candidate.type || !DATABASE_VIEW_TYPES.includes(candidate.type)) return null;
  return {
    type: candidate.type,
    ...(typeof candidate.name === 'string' ? { name: candidate.name } : {}),
    ...(candidate.config && typeof candidate.config === 'object'
      ? { config: candidate.config }
      : {}),
  };
}

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
      blockId:
        typeof parsed.blockId === 'string' && parsed.blockId.length > 0
          ? parsed.blockId
          : fallback.blockId,
      activeViewId:
        typeof parsed.activeViewId === 'string' ? parsed.activeViewId : null,
      initialView: safeInitialView(parsed.initialView),
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
      activeViewId: {
        default: null as string | null,
        parseHTML: (el) =>
          safeParse(el.getAttribute('data-database')).activeViewId,
      },
      initialView: {
        default: null as DatabaseBlockInitialView | null,
        parseHTML: (el) =>
          safeParse(el.getAttribute('data-database')).initialView,
      },
      schemaVersion: {
        default: DATABASE_BLOCK_SCHEMA_VERSION,
        parseHTML: (el) =>
          safeParse(el.getAttribute('data-database')).schemaVersion,
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="database"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const payload: DatabaseBlockAttrs = {
      blockId: node.attrs.blockId,
      activeViewId: node.attrs.activeViewId,
      initialView: safeInitialView(node.attrs.initialView),
      schemaVersion:
        node.attrs.schemaVersion ?? DATABASE_BLOCK_SCHEMA_VERSION,
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
