/**
 * Execute a declarative workflow sequentially.
 *
 * INTENT: Run workflow steps in order while keeping engine logic host-agnostic
 * INPUT: job request, workflow registry, provider dispatcher, optional step callback
 * OUTPUT: WorkflowExecutionResult
 * SIDE EFFECT: Calls provider dispatcher and invokes onStepStart callback
 * FAILURE: Throws workflow_definition_error or downstream provider errors
 */

import { workflowDefinitionError } from "./errors.js";
import { deepFreeze } from "./invariants.js";
import { dispatchProvider } from "./dispatch.js";
import type { JobRequest } from "./types/job.js";
import type { ProviderResult } from "./types/provider.js";
import type { ProviderDispatcher, WorkflowExecutionResult, WorkflowRegistry } from "./types/runtime.js";
import type { StepSpec, WorkflowSpec } from "./types/workflow.js";

interface WorkflowState {
  readonly jobInput: unknown;
  readonly stepOutputs: Record<string, unknown>;
}

export async function runWorkflow(args: {
  readonly request: JobRequest;
  readonly providerDispatcher: ProviderDispatcher;
  readonly workflowRegistry?: WorkflowRegistry;
  readonly onStepStart?: (stepId: string, workflowId: string) => void;
}): Promise<WorkflowExecutionResult> {
  const workflow = resolveWorkflow(args.request, args.workflowRegistry);
  validateWorkflow(workflow);

  const state: WorkflowState = {
    jobInput: args.request.input,
    stepOutputs: {},
  };

  let lastStepId: string | null = null;
  let lastResult: ProviderResult | null = null;

  for (const step of workflow.steps) {
    args.onStepStart?.(step.id, workflow.id);
    lastStepId = step.id;
    lastResult = await executeStep(step, state, args.providerDispatcher, args.request.providerId);
    state.stepOutputs[step.outputKey] = deepFreeze(lastResult.output);
  }

  if (!lastResult) {
    throw workflowDefinitionError("empty_workflow", `Workflow "${workflow.id}" must contain at least one step.`);
  }

  return deepFreeze({
    output: state.stepOutputs[workflow.steps[workflow.steps.length - 1].outputKey],
    assets: [...lastResult.assets],
    diagnostics: {
      workflowId: workflow.id,
      stepCount: workflow.steps.length,
    },
    lastStepId,
  });
}

function resolveWorkflow(request: JobRequest, workflowRegistry?: WorkflowRegistry): WorkflowSpec {
  if (request.workflowSpec) {
    return request.workflowSpec;
  }

  if (request.workflowId) {
    const workflow = workflowRegistry?.get(request.workflowId);
    if (!workflow) {
      throw workflowDefinitionError("unknown_workflow", `Workflow "${request.workflowId}" is not registered.`);
    }
    return workflow;
  }

  return createDefaultWorkflow(request.providerId);
}

function validateWorkflow(workflow: WorkflowSpec): void {
  if (workflow.steps.length === 0) {
    throw workflowDefinitionError("empty_workflow", `Workflow "${workflow.id}" must contain at least one step.`);
  }

  const stepIds = new Set<string>();
  const outputKeys = new Set<string>();

  for (const step of workflow.steps) {
    if (stepIds.has(step.id)) {
      throw workflowDefinitionError("duplicate_step_id", `Workflow "${workflow.id}" contains duplicate step id "${step.id}".`);
    }
    if (outputKeys.has(step.outputKey)) {
      throw workflowDefinitionError(
        "duplicate_output_key",
        `Workflow "${workflow.id}" contains duplicate output key "${step.outputKey}".`,
      );
    }

    stepIds.add(step.id);
    outputKeys.add(step.outputKey);
  }
}

async function executeStep(
  step: StepSpec,
  state: WorkflowState,
  providerDispatcher: ProviderDispatcher,
  defaultProviderId: string,
): Promise<ProviderResult> {
  if (step.kind !== "provider") {
    throw workflowDefinitionError(
      "unsupported_step_kind",
      `Step "${step.id}" uses unsupported kind "${step.kind}".`,
      { stepId: step.id, kind: step.kind },
    );
  }

  const providerId = resolveProviderId(step, defaultProviderId);
  const input = resolveStepInput(step, state);

  return dispatchProvider({
    providerDispatcher,
    providerId,
    input,
  });
}

function resolveProviderId(step: StepSpec, defaultProviderId: string): string {
  const configuredProviderId = step.config.providerId;

  if (configuredProviderId === undefined) {
    return defaultProviderId;
  }

  if (typeof configuredProviderId !== "string" || configuredProviderId.length === 0) {
    throw workflowDefinitionError(
      "invalid_provider_step_config",
      `Step "${step.id}" must declare a non-empty string providerId when provided.`,
      { stepId: step.id },
    );
  }

  return configuredProviderId;
}

function resolveStepInput(step: StepSpec, state: WorkflowState): unknown {
  if (step.inputBinding === null || step.inputBinding === "$job.input") {
    return deepFreeze(state.jobInput);
  }

  if (Object.prototype.hasOwnProperty.call(state.stepOutputs, step.inputBinding)) {
    return state.stepOutputs[step.inputBinding];
  }

  throw workflowDefinitionError(
    "unresolved_input_binding",
    `Step "${step.id}" references missing input binding "${step.inputBinding}".`,
    { stepId: step.id, inputBinding: step.inputBinding },
  );
}

function createDefaultWorkflow(providerId: string): WorkflowSpec {
  return deepFreeze({
    id: `workflow.default.${providerId}`,
    name: "Default Provider Workflow",
    steps: [
      {
        id: "invoke-provider",
        kind: "provider",
        inputBinding: "$job.input",
        outputKey: "result",
        cleanupPolicy: "none",
        config: {
          providerId,
        },
      },
    ],
  });
}
