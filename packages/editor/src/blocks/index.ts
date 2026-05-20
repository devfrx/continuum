/**
 * Block platform — public surface.
 *
 * Importers should reach for these barrel exports rather than the
 * individual modules so internal reshuffles stay invisible.
 */
export type {
  BlockCapability,
  BlockCategory,
  BlockDefinition,
  BlockExtension,
  BlockSlashDescriptor,
  BlockStatus,
  SlashCommandSection,
} from './types';
export { SLASH_COMMAND_SECTIONS } from './types';
export { BlockRegistry, createBlockRegistry } from './registry';
export {
  BUILTIN_BLOCK_SLASH,
  createBuiltinBlocks,
  type BuiltinBlockViews,
} from './builtinBlocks';
export {
  deleteBlock,
  duplicateBlock,
  getBlockAtCoords,
  getBlockAtElement,
  getBlockAtPos,
  getBlockElement,
  insertParagraphBeforeBlock,
  insertParagraphAfterBlock,
  listTopLevelBlocks,
  moveBlockBy,
  moveBlockTo,
  selectBlock,
  turnBlockInto,
  type EditorBlockSnapshot,
} from './blockActions';
export {
  getDropTargetAtCoords,
  getHoverBlockAtCoords,
  getToolbarPlacement,
  type BlockDropTarget,
  type BlockToolbarPlacement,
} from './blockDrop';
export {
  getTurnIntoSourceTypeAtSelection,
  getTurnIntoTargetsForBlock,
  getTurnIntoTargetsForSource,
  isTurnIntoTargetActiveForBlock,
  runTurnIntoTarget,
  runTurnIntoTargetForBlock,
  type TurnIntoGroup,
  type TurnIntoSourceType,
  type TurnIntoTarget,
  type TurnIntoTargetId,
} from './blockTransforms';
