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
export { BreadcrumbBlock as BreadcrumbBlockNode } from './nodes/BreadcrumbBlock';
export { MediaBlock as MediaBlockNode } from './nodes/MediaBlock';
export { Tabs as TabsNode, TabPanel as TabPanelNode } from './nodes/Tabs';
export {
  BREADCRUMB_BLOCK_SCHEMA_VERSION,
  DEFAULT_BREADCRUMB_BLOCK_ATTRS,
  normalizeBreadcrumbBlockAttrs,
  type BreadcrumbBlockAttrs,
} from './nodes/breadcrumbBlockTypes';
export {
  MEDIA_BLOCK_SCHEMA_VERSION,
  MEDIA_BLOCK_KINDS,
  createMediaBlockAttrs,
  normalizeMediaBlockAttrs,
  mediaAttrsFromFile,
  isMediaBlockKind,
  type MediaBlockAttrs,
  type MediaBlockKind,
  type MediaBlockSource,
} from './nodes/mediaBlockTypes';
export {
  TABS_SCHEMA_VERSION,
  DEFAULT_TAB_TITLES,
  createTabId,
  createTabsAttrs,
  createTabPanelAttrs,
  createTabsBlockContent,
  normalizeTabsAttrs,
  normalizeTabPanelAttrs,
  type TabsAttrs,
  type TabPanelAttrs,
  type TabsBlockContent,
} from './nodes/tabsTypes';
export type { EditorNoteContext } from './hostBridge';
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
