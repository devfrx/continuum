import { eq, sql } from 'drizzle-orm';
import { KIND_COLORS } from '@continuum/shared';
import { db } from './client.js';
import { kinds, type NewKind } from './schema.js';

/**
 * Default categories created the first time the database is initialised.
 *
 * Only `'note'` is marked as `builtin: true` and protected from edits. The
 * remaining kinds are seeded as user-editable defaults so the new-note picker
 * is never empty on a fresh install. They are NOT recreated if the user
 * deletes them.
 *
 * Colours are sourced from `KIND_COLORS` in `@continuum/shared` — the single
 * source of truth shared with the web client. Existing rows in the `kinds`
 * table are never rewritten from this map; only first-install defaults
 * derive from it.
 */
const DEFAULT_KINDS: readonly NewKind[] = [
  { id: 'note',      label: 'Note',      color: KIND_COLORS.note!,      icon: 'kind-note',      builtin: true,  description: 'Generic note' },
  { id: 'character', label: 'Character', color: KIND_COLORS.character!, icon: 'kind-character', builtin: false, description: 'A person, NPC or creature' },
  { id: 'race',      label: 'Race',      color: KIND_COLORS.race!,      icon: 'kind-race',      builtin: false, description: 'A species or ancestry' },
  { id: 'class',     label: 'Class',     color: KIND_COLORS.class!,     icon: 'kind-class',     builtin: false, description: 'A profession, archetype or class' },
  { id: 'location',  label: 'Location',  color: KIND_COLORS.location!,  icon: 'kind-location',  builtin: false, description: 'A place, region or landmark' },
  { id: 'item',      label: 'Item',      color: KIND_COLORS.item!,      icon: 'kind-item',      builtin: false, description: 'An object, artifact or equipment' },
  { id: 'faction',   label: 'Faction',   color: KIND_COLORS.faction!,   icon: 'kind-faction',   builtin: false, description: 'A group, guild or organisation' },
  { id: 'event',     label: 'Event',     color: KIND_COLORS.event!,     icon: 'kind-event',     builtin: false, description: 'A historical or in-world event' },
  { id: 'lore',      label: 'Lore',      color: KIND_COLORS.lore!,      icon: 'kind-lore',      builtin: false, description: 'Background, mythology or worldbuilding' },
  { id: 'custom',    label: 'Custom',    color: KIND_COLORS.custom!,    icon: 'kind-custom',    builtin: false, description: 'Anything else' },
];

/**
 * Idempotent kind initialisation:
 *
 * 1. Always upsert the `'note'` row (label/icon/builtin guaranteed correct).
 * 2. If the table has no other rows, insert all default kinds. Existing
 *    user installations are left untouched.
 */
export async function seedKinds(): Promise<{ inserted: number }> {
  // 1. Ensure 'note' always exists and is marked builtin.
  await db
    .insert(kinds)
    .values(DEFAULT_KINDS[0]!)
    .onConflictDoUpdate({
      target: kinds.id,
      set: { label: 'Note', icon: 'kind-note', builtin: true },
    });

  // 2. Seed remaining defaults only on a fresh database.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kinds)
    .where(eq(kinds.builtin, false));

  if (count > 0) return { inserted: 0 };

  await db.insert(kinds).values(DEFAULT_KINDS.slice(1)).onConflictDoNothing();
  return { inserted: DEFAULT_KINDS.length - 1 };
}
