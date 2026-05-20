export { default as ContinuumEditor } from './ContinuumEditor.vue';
export { default as EditorTableOfContents } from './components/EditorTableOfContents.vue';
export type { IconCatalogEntry } from './hostBridge';
export type { TocAnchor } from './extensions/TableOfContents';
export {
  extractFootnotes,
  FOOTNOTE_NODE_NAME,
  type ExtractedFootnote,
} from './nodes/Footnote';
export { Database as DatabaseNode } from './nodes/Database';
// Block platform (registry-driven definitions, slash descriptors).
export {
  BlockRegistry,
  createBlockRegistry,
  createBuiltinBlocks,
  BUILTIN_BLOCK_SLASH,
  SLASH_COMMAND_SECTIONS,
  type BlockCapability,
  type BlockCategory,
  type BlockDefinition,
  type BlockExtension,
  type BlockSlashDescriptor,
  type BlockStatus,
  type BuiltinBlockViews,
  type SlashCommandSection,
} from './blocks';
export const EDITOR_VERSION = '0.0.1';
