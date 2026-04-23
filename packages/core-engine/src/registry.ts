/**
 * Create the workflow registry.
 *
 * INTENT: Provide declarative workflow lookup for runtime execution
 * INPUT: Optional initial workflow list
 * OUTPUT: Mutable workflow registry
 * SIDE EFFECT: Mutates in-memory registry state only
 * FAILURE: Throws explicit error on duplicate workflow ids
 */

import type { WorkflowSpec } from "./types/workflow.js";
import type { WorkflowRegistry } from "./types/runtime.js";

export interface MutableWorkflowRegistry extends WorkflowRegistry {
  register(workflow: WorkflowSpec): void;
}

export function createWorkflowRegistry(initialWorkflows: readonly WorkflowSpec[] = []): MutableWorkflowRegistry {
  const workflows = new Map<string, WorkflowSpec>();

  for (const workflow of initialWorkflows) {
    registerWorkflow(workflows, workflow);
  }

  return {
    register(workflow) {
      registerWorkflow(workflows, workflow);
    },
    get(workflowId) {
      return workflows.get(workflowId);
    },
    list() {
      return Array.from(workflows.values());
    },
  };
}

function registerWorkflow(workflows: Map<string, WorkflowSpec>, workflow: WorkflowSpec): void {
  if (workflows.has(workflow.id)) {
    throw new Error(`Workflow "${workflow.id}" is already registered.`);
  }

  workflows.set(workflow.id, workflow);
}
