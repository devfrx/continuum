// ===== Query — barrel =====
//
// Re-exports the entire query layer so consumers can `import { … } from
// '@continuum/shared'` without knowing the internal file split.

export * from './fields.js';
export * from './filters.js';
export * from './property-capabilities.js';
export * from './graph.js';
