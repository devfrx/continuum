import { eq, sql } from 'drizzle-orm';
import { db } from './client.js';
import { kinds, type NewKind } from './schema.js';

/**
 * Default categories created the first time the database is initialised.
 *
 * Only `'note'` is marked as `builtin: true` and protected from edits. The
 * remaining kinds are seeded as user-editable defaults so the new-note picker
 * is never empty on a fresh install. They are NOT recreated if the user
 * deletes them.
 */
const DEFAULT_KINDS: readonly NewKind[] = [
  { id: 'note',      label: 'Note',      color: '#9A9286', icon: 'kind-note',      builtin: true,  description: 'Generic note' },
  { id: 'character', label: 'Character', color: '#C97B63', icon: 'kind-character', builtin: false, description: 'A person, NPC or creature' },
  { id: 'race',      label: 'Race',      color: '#7BA48A', icon: 'kind-race',      builtin: false, description: 'A species or ancestry' },
  { id: 'class',     label: 'Class',     color: '#B69248', icon: 'kind-class',     builtin: false, description: 'A profession, archetype or class' },
  { id: 'location',  label: 'Location',  color: '#6F8FB5', icon: 'kind-location',  builtin: false, description: 'A place, region or landmark' },
  { id: 'item',      label: 'Item',      color: '#A07BB5', icon: 'kind-item',      builtin: false, description: 'An object, artifact or equipment' },
  { id: 'faction',   label: 'Faction',   color: '#B5556B', icon: 'kind-faction',   builtin: false, description: 'A group, guild or organisation' },
  { id: 'event',     label: 'Event',     color: '#D8A24A', icon: 'kind-event',     builtin: false, description: 'A historical or in-world event' },
  { id: 'lore',      label: 'Lore',      color: '#8A6FB5', icon: 'kind-lore',      builtin: false, description: 'Background, mythology or worldbuilding' },
  { id: 'custom',    label: 'Custom',    color: '#9A9286', icon: 'kind-custom',    builtin: false, description: 'Anything else' },
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
