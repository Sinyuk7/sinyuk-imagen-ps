import {
  validateCanonicalComfyUiWorkflowContract,
  type ComfyUiWorkflowContract,
  type ComfyUiWorkflowContractEntry,
} from './contract/index.js';
import { createComfyUiExecutionError } from './errors.js';
import {
  admitComfyUiApiGraph,
  parseComfyUiWorkflowContractFromApiGraph,
  validateComfyUiApiGraphTargets,
  type BoundedApiWorkflow,
  type ComfyUiApiNode,
} from './graph.js';
import { deepFreeze } from './internal/value.js';

/** Shared upload barrier 后的 literal/widget values。 */
export interface ComfyUiContractInputValues {
  readonly prompt: string;
  readonly imageValues: readonly string[];
  readonly maskValue?: string;
}

/** Frontend Bridge 允许的 exact widget mutation。 */
export interface ComfyUiWidgetMutation {
  readonly locator: {
    readonly nodeId: string;
    readonly fieldName: string;
  };
  readonly value: string;
}

function entriesFor(contract: ComfyUiWorkflowContract, role: ComfyUiWorkflowContractEntry['role']): readonly ComfyUiWorkflowContractEntry[] {
  return contract.entries.filter((entry) => entry.role === role).sort((left, right) => left.slot - right.slot);
}

function validateValues(contract: ComfyUiWorkflowContract, values: ComfyUiContractInputValues): void {
  if (values.prompt.trim().length === 0) throw createComfyUiExecutionError('prepare', 'invalid-contract');
  const imageEntries = entriesFor(contract, 'image');
  if (values.imageValues.length > imageEntries.length) {
    throw createComfyUiExecutionError('prepare', 'invalid-contract');
  }
  for (const entry of imageEntries) {
    const value = values.imageValues[entry.slot];
    if (entry.required && (typeof value !== 'string' || value.length === 0)) {
      throw createComfyUiExecutionError('prepare', 'invalid-contract');
    }
  }
  const maskEntry = entriesFor(contract, 'mask')[0];
  if (values.maskValue !== undefined && maskEntry === undefined) {
    throw createComfyUiExecutionError('prepare', 'invalid-contract');
  }
  if (maskEntry?.required && (values.maskValue === undefined || values.maskValue.length === 0)) {
    throw createComfyUiExecutionError('prepare', 'invalid-contract');
  }
}

function valueForEntry(entry: ComfyUiWorkflowContractEntry, values: ComfyUiContractInputValues): string | undefined {
  if (entry.role === 'prompt') return values.prompt;
  if (entry.role === 'image') return values.imageValues[entry.slot];
  if (entry.role === 'mask') return values.maskValue;
  return undefined;
}

/** Canonical contract 生成 Frontend exact widget mutations。 */
export function buildComfyUiFrontendMutations(
  contractInput: ComfyUiWorkflowContract | unknown,
  values: ComfyUiContractInputValues,
): readonly ComfyUiWidgetMutation[] {
  const contract = validateCanonicalComfyUiWorkflowContract(contractInput);
  validateValues(contract, values);
  const mutations: ComfyUiWidgetMutation[] = [];
  for (const entry of contract.entries) {
    const value = valueForEntry(entry, values);
    if (value === undefined) continue;
    mutations.push({
      locator: {
        nodeId: entry.locator.nodeId,
        fieldName: entry.locator.fieldName,
      },
      value,
    });
  }
  if (mutations.length > 16) throw createComfyUiExecutionError('prepare', 'invalid-contract');
  return deepFreeze(mutations);
}

/** Admitted graph clone 后只写 contract 声明的 literal inputs。 */
export function buildComfyUiApiPrompt(
  graphInput: BoundedApiWorkflow | unknown,
  contractInput: ComfyUiWorkflowContract | unknown,
  values: ComfyUiContractInputValues,
): BoundedApiWorkflow {
  const graph = admitComfyUiApiGraph(graphInput);
  const contract = validateCanonicalComfyUiWorkflowContract(contractInput);
  const graphContract = parseComfyUiWorkflowContractFromApiGraph(graph);
  if (JSON.stringify(graphContract) !== JSON.stringify(contract)) {
    throw createComfyUiExecutionError('prepare', 'invalid-contract');
  }
  try {
    validateComfyUiApiGraphTargets(graph, contract);
  } catch {
    throw createComfyUiExecutionError('prepare', 'invalid-workflow');
  }
  validateValues(contract, values);
  const clone = JSON.parse(JSON.stringify(graph)) as Record<string, ComfyUiApiNode>;
  for (const entry of contract.entries) {
    const value = valueForEntry(entry, values);
    if (value === undefined) continue;
    const node = clone[entry.locator.nodeId];
    if (node === undefined) throw createComfyUiExecutionError('prepare', 'invalid-workflow');
    clone[entry.locator.nodeId] = {
      ...node,
      inputs: {
        ...node.inputs,
        [entry.locator.fieldName]: value,
      },
    };
  }
  return admitComfyUiApiGraph(clone);
}
