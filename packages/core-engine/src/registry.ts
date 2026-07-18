/**
 * Workflow registry 实现。
 *
 * Registry 只接受显式 static execution adapter 的 declarative workflows。
 */

import { createWorkflowError } from './errors.js';
import { assertNoSecrets, createImmutableSnapshot } from './invariants.js';
import type { ExecutionStep, Workflow, WorkflowRegistry } from './types/workflow.js';

function normalizeStep(step: ExecutionStep, workflowName: string, index: number): ExecutionStep {
  if (typeof step !== 'object' || step === null) {
    throw createWorkflowError(`Workflow "${workflowName}" has an invalid step.`, {
      workflowName,
      stepIndex: index,
    });
  }

  if (typeof step.name !== 'string' || step.name.trim().length === 0) {
    throw createWorkflowError(`Workflow "${workflowName}" has a step with an empty or invalid name.`, {
      workflowName,
      stepIndex: index,
    });
  }

  if (step.kind !== 'execution') {
    throw createWorkflowError(
      `Workflow "${workflowName}" step "${step.name}" must use kind "execution".`,
      { workflowName, stepName: step.name, stepIndex: index, kind: step.kind },
    );
  }

  if (typeof step.adapter !== 'string' || step.adapter.trim().length === 0) {
    throw createWorkflowError(
      `Workflow "${workflowName}" step "${step.name}" must declare a non-empty adapter.`,
      { workflowName, stepName: step.name, stepIndex: index },
    );
  }

  if (
    step.outputKey !== undefined &&
    (typeof step.outputKey !== 'string' || step.outputKey.trim().length === 0)
  ) {
    throw createWorkflowError(`Workflow "${workflowName}" step "${step.name}" has an invalid outputKey.`, {
      workflowName,
      stepName: step.name,
      stepIndex: index,
    });
  }

  if (
    step.input !== undefined &&
    (typeof step.input !== 'object' || step.input === null || Array.isArray(step.input))
  ) {
    throw createWorkflowError(`Workflow "${workflowName}" step "${step.name}" input must be a record.`, {
      workflowName,
      stepName: step.name,
      stepIndex: index,
    });
  }

  try {
    assertNoSecrets(step.input);
    return createImmutableSnapshot({
      name: step.name,
      kind: 'execution' as const,
      adapter: step.adapter,
      input: step.input,
      outputKey: step.outputKey,
    }) as ExecutionStep;
  } catch {
    throw createWorkflowError(`Workflow "${workflowName}" step "${step.name}" has invalid input.`, {
      workflowName,
      stepName: step.name,
      stepIndex: index,
    });
  }
}

function normalizeWorkflow(workflow: Workflow): Workflow {
  if (typeof workflow !== 'object' || workflow === null) {
    throw createWorkflowError('Workflow must be an object.');
  }

  if (typeof workflow.name !== 'string' || workflow.name.trim().length === 0) {
    throw createWorkflowError('Workflow name must be a non-empty string.');
  }

  if (!Array.isArray(workflow.steps)) {
    throw createWorkflowError(`Workflow "${workflow.name}" steps must be an array.`, {
      workflowName: workflow.name,
    });
  }

  if (workflow.version !== undefined && typeof workflow.version !== 'string') {
    throw createWorkflowError(`Workflow "${workflow.name}" version must be a string.`, {
      workflowName: workflow.name,
    });
  }

  const steps = workflow.steps.map((step, index) => normalizeStep(step, workflow.name, index));
  return createImmutableSnapshot({
    name: workflow.name,
    version: workflow.version,
    steps,
  }) as Workflow;
}

/** 创建 workflow registry。 */
export function createWorkflowRegistry(initialWorkflows: readonly Workflow[] = []): WorkflowRegistry {
  const workflows = new Map<string, Workflow>();

  const registry: WorkflowRegistry = {
    register(workflow: Workflow): Workflow {
      const snapshot = normalizeWorkflow(workflow);
      if (workflows.has(snapshot.name)) {
        throw createWorkflowError(`Workflow "${snapshot.name}" is already registered.`, {
          workflowName: snapshot.name,
        });
      }
      workflows.set(snapshot.name, snapshot);
      return snapshot;
    },

    get(name: string): Workflow | undefined {
      return workflows.get(name);
    },

    list(): readonly Workflow[] {
      return Object.freeze(Array.from(workflows.values()));
    },
  };

  for (const workflow of initialWorkflows) {
    registry.register(workflow);
  }

  return registry;
}
