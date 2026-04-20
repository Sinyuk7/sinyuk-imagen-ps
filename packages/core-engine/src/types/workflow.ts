/**
 * Workflow and step spec types.
 *
 * INTENT: Declarative workflow data contracts — serializable, no embedded logic.
 * INPUT: None (pure type definitions)
 * OUTPUT: WorkflowSpec, StepSpec, StepKind types
 * SIDE EFFECT: None
 * FAILURE: N/A — compile-time only
 */

/** Supported step execution kinds. */
export type StepKind = "provider" | "transform" | "io";

/** Cleanup policy for a step's temporary resources. */
export type CleanupPolicy = "on_complete" | "on_failure" | "always" | "none";

/**
 * Declarative step definition within a workflow.
 *
 * Each step declares its identity, kind, input/output bindings,
 * and optional cleanup policy. The runtime resolves execution behavior
 * from registered step executors, not from embedded callable functions.
 */
export interface StepSpec {
  /** Stable step identifier, unique within the workflow. */
  readonly id: string;
  /** Execution kind — determines which executor handles this step. */
  readonly kind: StepKind;
  /** Input binding declaration (e.g. reference to prior step output key). */
  readonly inputBinding: string | null;
  /** Output key — downstream steps reference this to receive outputs. */
  readonly outputKey: string;
  /** Cleanup policy for temporary resources. Defaults to "none". */
  readonly cleanupPolicy?: CleanupPolicy;
  /** Step-specific configuration (provider id, transform name, adapter ref, etc.). */
  readonly config: Record<string, unknown>;
}

/**
 * Serializable declarative workflow definition.
 *
 * Workflows are pure data — no embedded business logic, no direct side effects.
 * The runtime resolves declared step handlers from its registered executors.
 */
export interface WorkflowSpec {
  /** Stable workflow identifier. */
  readonly id: string;
  /** Human-readable workflow name. */
  readonly name: string;
  /** Ordered step declarations — executed sequentially. */
  readonly steps: readonly StepSpec[];
  /** Optional workflow-level metadata. */
  readonly metadata?: Record<string, unknown>;
}
