/**
 * @imagen-ps/core-engine
 *
 * Host-agnostic runtime for workflow orchestration and job lifecycle.
 */

// Re-export all shared types.
export * from './types/index.js';

// Re-export error taxonomy.
export * from './errors.js';

// Re-export invariant guards.
export * from './invariants.js';

// TODO: remove in a future change once real modules are exported.
/** Temporary bootstrap version marker. */
export const __PLACEHOLDER__CORE_ENGINE_VERSION = '0.0.0';

/** Temporary bootstrap export to ensure the module compiles. */
export const __PLACEHOLDER__ = Object.freeze({});
