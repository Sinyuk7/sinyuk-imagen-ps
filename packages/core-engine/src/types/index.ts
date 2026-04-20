/**
 * Shared runtime type barrel export.
 *
 * INTENT: Single import point for all shared contract types.
 */
export type {
  ErrorCategory,
  JobError,
} from "./errors.js";

export type {
  BinaryPayload,
  AssetMetadata,
  AssetDescriptor,
  AssetIOAdapter,
} from "./assets.js";

export type {
  ProviderDiagnostics,
  ProviderResult,
  ProviderDefinition,
} from "./provider.js";

export type {
  StepKind,
  CleanupPolicy,
  StepSpec,
  WorkflowSpec,
} from "./workflow.js";

export type {
  JobStatus,
  JobEventType,
  JobRequest,
  JobTerminalResult,
  JobRecord,
  JobEventPayload,
} from "./job.js";
