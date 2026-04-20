/**
 * Shared failure taxonomy for the runtime.
 *
 * INTENT: Machine-readable failure categories that hosts and providers use to classify errors.
 * INPUT: None (pure type definitions)
 * OUTPUT: ErrorCategory, JobError types
 * SIDE EFFECT: None
 * FAILURE: N/A — compile-time only
 */

/** Machine-readable failure categories shared across all layers. */
export type ErrorCategory =
  | "configuration_error"
  | "validation_error"
  | "workflow_definition_error"
  | "provider_error"
  | "asset_io_error"
  | "host_capability_error"
  | "cancellation_error"; // reserved for future lifecycle expansion

/**
 * Structured failure envelope carried by failed jobs and adapter errors.
 *
 * Every terminal failure in the system resolves to this shape so hosts
 * can inspect failures without parsing unstructured strings.
 */
export interface JobError {
  /** Machine-readable error code (e.g. "UNKNOWN_PROVIDER"). */
  readonly code: string;
  /** Failure category from the shared taxonomy. */
  readonly category: ErrorCategory;
  /** Human-readable description. */
  readonly message: string;
  /** Optional structured details for diagnostics. */
  readonly details?: Record<string, unknown>;
  /** Optional evidence trace (e.g. stack, request snapshot). */
  readonly evidence?: Record<string, unknown>;
}
