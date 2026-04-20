/**
 * Runtime error factory for the shared failure taxonomy.
 *
 * INTENT: Provide a consistent way to create structured JobError values.
 * INPUT: ErrorCategory, code, message, optional details/evidence
 * OUTPUT: Frozen JobError object
 * SIDE EFFECT: None
 * FAILURE: N/A — pure construction
 */

import type { ErrorCategory, JobError } from "./types/errors.js";

/**
 * Create a frozen, structured JobError.
 *
 * All runtime failures MUST use this factory so errors are always
 * machine-readable and carry their category.
 */
export function createJobError(
  category: ErrorCategory,
  code: string,
  message: string,
  details?: Record<string, unknown>,
  evidence?: Record<string, unknown>,
): JobError {
  return Object.freeze({
    code,
    category,
    message,
    ...(details !== undefined && { details }),
    ...(evidence !== undefined && { evidence }),
  });
}

// -- Pre-built error constructors for common failure paths --

export function validationError(code: string, message: string, details?: Record<string, unknown>): JobError {
  return createJobError("validation_error", code, message, details);
}

export function configurationError(code: string, message: string, details?: Record<string, unknown>): JobError {
  return createJobError("configuration_error", code, message, details);
}

export function workflowDefinitionError(code: string, message: string, details?: Record<string, unknown>): JobError {
  return createJobError("workflow_definition_error", code, message, details);
}

export function providerError(code: string, message: string, details?: Record<string, unknown>): JobError {
  return createJobError("provider_error", code, message, details);
}

export function assetIOError(code: string, message: string, details?: Record<string, unknown>): JobError {
  return createJobError("asset_io_error", code, message, details);
}

export function hostCapabilityError(code: string, message: string, details?: Record<string, unknown>): JobError {
  return createJobError("host_capability_error", code, message, details);
}
