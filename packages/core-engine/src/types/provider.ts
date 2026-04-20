/**
 * Provider contract types.
 *
 * INTENT: Define the extensible provider registration, validation, and invocation contract.
 * INPUT: None (pure type definitions)
 * OUTPUT: ProviderDefinition, ProviderResult types
 * SIDE EFFECT: None
 * FAILURE: N/A — compile-time only
 */

import type { ZodType } from "zod";
import type { AssetDescriptor } from "./assets.js";

/** Diagnostics attached to provider results for observability. */
export interface ProviderDiagnostics {
  /** Provider-specific timing, token usage, or trace data. */
  readonly [key: string]: unknown;
}

/**
 * Stable result envelope returned by every provider invocation.
 *
 * Provider-specific remote response shapes MUST be converted into this
 * envelope before crossing the provider boundary.
 */
export interface ProviderResult {
  /** Declared output payload from the provider. */
  readonly output: unknown;
  /** Output asset descriptors when the provider produces binary assets. */
  readonly assets: readonly AssetDescriptor[];
  /** Optional diagnostics (timing, usage, trace data). */
  readonly diagnostics?: ProviderDiagnostics;
}

/**
 * Registered provider contract.
 *
 * Each provider owns its parameter semantics. The engine validates through
 * the schema but does NOT reinterpret provider-specific parameter meaning.
 */
export interface ProviderDefinition {
  /** Unique stable identifier for this provider. */
  readonly id: string;
  /** Human-readable display name. */
  readonly name: string;
  /** Declared capability tags for discovery. */
  readonly capabilities: readonly string[];
  /** Runtime validation schema for provider input (Zod). */
  readonly inputSchema: ZodType;
  /**
   * Optional pre-invocation input transform.
   * Converts validated workflow payload into provider call payload.
   * MUST NOT mutate engine state or rewrite workflow definitions.
   */
  readonly transformInput?: (validatedInput: unknown) => unknown;
  /**
   * Invoke the provider with validated (and optionally transformed) input.
   *
   * INTENT: Execute provider-specific logic and return a stable ProviderResult.
   * FAILURE: Throws structured provider_error on timeout, remote failure, etc.
   */
  readonly invoke: (input: unknown) => Promise<ProviderResult>;
  /**
   * Optional post-invocation output transform.
   * Converts raw provider result into the shared ProviderResult envelope.
   * MUST NOT mutate engine state.
   */
  readonly transformOutput?: (rawResult: ProviderResult) => ProviderResult;
}
