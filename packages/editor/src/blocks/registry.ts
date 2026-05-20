/**
 * Block registry.
 *
 * In-memory collection of `BlockDefinition` entries indexed by their
 * Tiptap node name. The registry is intentionally instance-based (not
 * a process-wide singleton) so each `ContinuumEditor` mount can
 * compose its own set of blocks — and tests can build isolated
 * registries without leaking state between assertions.
 */
import type {
  BlockDefinition,
  BlockExtension,
  BlockSlashDescriptor,
  SlashCommandSection,
} from './types';

/**
 * Lightweight registry holding `BlockDefinition` entries.
 *
 * Use `createBlockRegistry()` to obtain an instance pre-populated
 * with a list of definitions, then query it through the read-only
 * helpers (`get`, `list`, `listSlash`, `listExtensions`).
 */
export class BlockRegistry {
  private readonly byType = new Map<string, BlockDefinition>();

  /**
   * Add (or replace) a definition. Throws when two definitions claim
   * the same `type` — duplicate registrations almost always indicate
   * an integration bug rather than an intentional override.
   */
  register(def: BlockDefinition): void {
    if (this.byType.has(def.type)) {
      throw new Error(`[blocks] duplicate block type: ${def.type}`);
    }
    this.byType.set(def.type, def);
  }

  /** Look up a definition by Tiptap node name. */
  get(type: string): BlockDefinition | undefined {
    return this.byType.get(type);
  }

  /** All registered definitions, insertion order preserved. */
  list(): readonly BlockDefinition[] {
    return Array.from(this.byType.values());
  }

  /**
   * Slash-menu descriptors contributed by every registered block,
   * optionally filtered by section. `'planned'` blocks are skipped
   * so unfinished features never surface in the live menu.
   */
  listSlash(section?: SlashCommandSection): BlockSlashDescriptor[] {
    const out: BlockSlashDescriptor[] = [];
    for (const def of this.byType.values()) {
      if (def.status === 'planned') continue;
      if (!def.slash) continue;
      if (section && def.slash.section !== section) continue;
      out.push(def.slash);
    }
    return out;
  }

  /**
   * Flatten every block's Tiptap extension(s) into a single list,
   * preserving registration order. `'planned'` blocks contribute
   * nothing.
   */
  listExtensions(): BlockExtension[] {
    const out: BlockExtension[] = [];
    for (const def of this.byType.values()) {
      if (def.status === 'planned') continue;
      out.push(...def.extensions());
    }
    return out;
  }
}

/**
 * Build a registry from a list of definitions. Convenience wrapper so
 * callers don't have to `new BlockRegistry()` + loop manually.
 */
export function createBlockRegistry(defs: readonly BlockDefinition[] = []): BlockRegistry {
  const registry = new BlockRegistry();
  for (const def of defs) registry.register(def);
  return registry;
}
