/**
 * Runtime orchestration types.
 *
 * INTENT: Define the minimal runtime dependencies and public engine API.
 * INPUT: None (pure type definitions)
 * OUTPUT: ProviderDispatcher, WorkflowRegistry, Runtime types
 * SIDE EFFECT: None
 * FAILURE: N/A — compile-time only
 */

import type { JobEventPayload, JobEventType, JobRecord, JobRequest, JobTerminalResult } from "./job.js";
import type { ProviderResult } from "./provider.js";
import type { WorkflowSpec } from "./workflow.js";

/** Runtime-facing provider dispatch request. */
export interface ProviderDispatchRequest {
  readonly providerId: string;
  readonly input: unknown;
}

/** Minimal provider bridge that the engine depends on. */
export interface ProviderDispatcher {
  invoke(request: ProviderDispatchRequest): Promise<ProviderResult>;
}

/** Declarative workflow registry used by the runtime. */
export interface WorkflowRegistry {
  get(workflowId: string): WorkflowSpec | undefined;
  list(): readonly WorkflowSpec[];
}

/** Runtime event listener signature. */
export type JobEventListener = (event: {
  readonly type: JobEventType;
  readonly payload: JobEventPayload;
  readonly record: JobRecord;
}) => void;

/** Workflow execution result returned by the runner. */
export interface WorkflowExecutionResult extends JobTerminalResult {
  readonly lastStepId: string | null;
}

/** Runtime construction options. */
export interface RuntimeOptions {
  readonly providerDispatcher: ProviderDispatcher;
  readonly workflowRegistry?: WorkflowRegistry;
  readonly now?: () => string;
  readonly createJobId?: () => string;
}

/** Public runtime API exposed to higher layers. */
export interface Runtime {
  submitJob(request: JobRequest): Promise<JobRecord>;
  getJob(jobId: string): JobRecord | undefined;
  retryJob(jobId: string): Promise<JobRecord>;
  subscribe(listener: JobEventListener): () => void;
}
