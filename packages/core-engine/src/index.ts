/**
 * @imagen-ps/core-engine
 *
 * INTENT: Host-agnostic execution runtime for job lifecycle, workflow dispatch, and event emission.
 * SIDE EFFECT: None — pure logic package.
 */

// Shared contract types
export type {
  // Errors
  ErrorCategory,
  JobError,
  // Assets
  BinaryPayload,
  AssetMetadata,
  AssetDescriptor,
  AssetIOAdapter,
  // Provider
  ProviderDiagnostics,
  ProviderResult,
  ProviderDefinition,
  // Workflow
  StepKind,
  CleanupPolicy,
  StepSpec,
  WorkflowSpec,
  // Job
  JobStatus,
  JobEventType,
  JobRequest,
  JobTerminalResult,
  JobRecord,
  JobEventPayload,
} from "./types/index.js";

// Error factories — structured failure creation
export {
  createJobError,
  validationError,
  configurationError,
  workflowDefinitionError,
  providerError,
  assetIOError,
  hostCapabilityError,
} from "./errors.js";

// Invariant guards — runtime boundary enforcement
export {
  assertSerializable,
  deepFreeze,
} from "./invariants.js";