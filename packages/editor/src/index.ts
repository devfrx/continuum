export { default as ContinuumEditor } from './ContinuumEditor.vue';
export { default as EditorTableOfContents } from './components/EditorTableOfContents.vue';
export type { IconCatalogEntry } from './hostBridge';
export type { TocAnchor } from './extensions/TableOfContents';
export {
  extractFootnotes,
  FOOTNOTE_NODE_NAME,
  type ExtractedFootnote,
} from './nodes/Footnote';
export const EDITOR_VERSION = '0.0.1';
