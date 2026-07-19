import type { BoundedComfyUiApiWorkflow } from './graph.js';
import { admitComfyUiApiGraph } from './graph.js';
import type { WorkflowForm, WorkflowInputRef, WorkflowPrimitiveValue, ComfyUiWorkflowValueMutation } from './form.js';
import { validateComfyUiWorkflowValueMutations } from './form.js';
import { createComfyUiExecutionError } from './errors.js';
import { deepFreeze } from './internal/value.js';

/** Backward-neutral alias for form mutation input. */
export type ComfyUiWidgetMutation = ComfyUiWorkflowValueMutation;

/** Optional values applied after graph clone and before native submission. */
export interface ComfyUiWorkflowOverrides {
  readonly prompt?: string;
  readonly imageValues?: readonly string[];
  readonly imageInputRef?: WorkflowInputRef;
  readonly mutations?: readonly ComfyUiWidgetMutation[];
}

function setRef(target: Record<string, unknown>, ref: WorkflowInputRef, value: WorkflowPrimitiveValue): void {
  if (ref.inputName !== undefined) {
    const inputs = target.inputs;
    if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs) || !Object.prototype.hasOwnProperty.call(inputs, ref.inputName)) throw createComfyUiExecutionError('prepare', 'invalid-workflow');
    (inputs as Record<string, unknown>)[ref.inputName] = value;
    return;
  }
  throw createComfyUiExecutionError('prepare', 'invalid-workflow');
}

/** Clone complete API graph and apply only validated primitive overrides. */
export function applyComfyUiApiWorkflowMutations(
  graph: BoundedComfyUiApiWorkflow | unknown,
  form: WorkflowForm,
  mutations?: readonly ComfyUiWidgetMutation[],
): BoundedComfyUiApiWorkflow {
  const admitted = admitComfyUiApiGraph(graph);
  const checked = validateComfyUiWorkflowValueMutations(form, mutations);
  const clone = JSON.parse(JSON.stringify(admitted)) as Record<string, Record<string, unknown>>;
  for (const mutation of checked) {
    const node = clone[mutation.ref.nodeId];
    if (!node) throw createComfyUiExecutionError('prepare', 'invalid-workflow');
    setRef(node, mutation.ref, mutation.value);
  }
  return deepFreeze(clone) as BoundedComfyUiApiWorkflow;
}

/** Build API prompt payload with complete graph and optional composer prompt. */
export function buildComfyUiApiPrompt(
  graph: BoundedComfyUiApiWorkflow,
  form: WorkflowForm | undefined,
  overrides: ComfyUiWorkflowOverrides,
): BoundedComfyUiApiWorkflow {
  const checked = form === undefined ? graph : applyComfyUiApiWorkflowMutations(graph, form, overrides.mutations);
  const clone = JSON.parse(JSON.stringify(checked)) as Record<string, Record<string, unknown>>;
  if (overrides.prompt !== undefined && overrides.prompt.trim().length > 0 && form !== undefined) {
    const text = form.nodes.flatMap((node) => node.widgets).find((widget) => widget.writable && (widget.kind === 'string' || widget.kind === 'multiline-string'));
    if (text?.ref.inputName !== undefined && clone[text.ref.nodeId]) setRef(clone[text.ref.nodeId], text.ref, overrides.prompt);
  }
  if (overrides.imageValues !== undefined && form !== undefined && overrides.imageValues.length > 0) {
    const image = overrides.imageInputRef
      ? form.nodes.flatMap((node) => node.widgets).find((widget) => widget.writable && widget.kind === 'upload-image' && widget.ref.nodeId === overrides.imageInputRef?.nodeId && widget.ref.inputName === overrides.imageInputRef?.inputName && widget.ref.widgetIndex === overrides.imageInputRef?.widgetIndex)
      : form.nodes.flatMap((node) => node.widgets).find((widget) => widget.writable && widget.kind === 'upload-image');
    if (image?.ref.inputName !== undefined && clone[image.ref.nodeId]) setRef(clone[image.ref.nodeId], image.ref, overrides.imageValues[0]);
  }
  return deepFreeze(clone) as BoundedComfyUiApiWorkflow;
}

/** Frontend Bridge values use same bounded refs; no contract role is accepted. */
export function buildComfyUiFrontendMutations(
  mutations: readonly ComfyUiWidgetMutation[] | undefined,
): readonly ComfyUiWidgetMutation[] {
  if (mutations === undefined) return deepFreeze([]);
  if (mutations.length > 16) throw createComfyUiExecutionError('prepare', 'invalid-workflow');
  return deepFreeze(mutations.map((mutation) => deepFreeze({ ref: deepFreeze({ ...mutation.ref }), value: mutation.value })));
}
