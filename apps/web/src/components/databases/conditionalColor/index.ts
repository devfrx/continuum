/**
 * databases/conditionalColor/index.ts — public surface for the engine.
 *
 * One import line for panels, renderers and tests so the internal
 * file split (palette, types, evaluate, composable) stays an
 * implementation detail.
 */
export * from './palette';
export * from './types';
export * from './evaluate';
export * from './useConditionalColors';
