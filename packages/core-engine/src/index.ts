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
  ProviderDispatchRequest,
  ProviderDispatcher,
  WorkflowRegistry,
  WorkflowExecutionResult,
  RuntimeOptions,
  Runtime,
  JobEventListener,
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

// Runtime orchestration
export {
  createJobEventBus,
} from "./events.js";

export {
  createJobStore,
} from "./store.js";

export {
  createWorkflowRegistry,
} from "./registry.js";

export {
  dispatchProvider,
} from "./dispatch.js";

export {
  runWorkflow,
} from "./runner.js";

export {
  createRuntime,
} from "./runtime.js";
