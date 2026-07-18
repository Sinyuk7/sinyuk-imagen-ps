import {
  IMAGEN_WORKFLOW_BINDING_CLASS_ID,
  IMAGEN_WORKFLOW_TYPE_CLASS_ID,
  parseComfyUiWorkflowContract,
  validateCanonicalComfyUiWorkflowContract,
  type ComfyUiWorkflowContract,
} from './contract/index.js';
import { deepFreeze, isPlainRecord, utf8ByteLength } from './internal/value.js';

const MAX_GRAPH_BYTES = 2_000_000;
const MAX_GRAPH_NODES = 2_000;
const MAX_GRAPH_DEPTH = 32;
const MAX_NODE_ID_CHARS = 128;
const MAX_CLASS_TYPE_CHARS = 256;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** ComfyUI API Format 中的 bounded node。 */
export interface ComfyUiApiNode {
  readonly class_type: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

/** Admission 后的 immutable ComfyUI API Format graph。 */
export type BoundedApiWorkflow = Readonly<Record<string, ComfyUiApiNode>>;

/** API Graph import 的 bounded error code。 */
export type ComfyUiApiGraphErrorCode =
  | 'malformed'
  | 'oversized'
  | 'frontend-format'
  | 'contract-node-missing'
  | 'contract-node-duplicate'
  | 'contract-target-invalid';

/** API Graph import 与 target validation 的安全错误。 */
export class ComfyUiApiGraphValidationError extends Error {
  readonly code: ComfyUiApiGraphErrorCode;

  constructor(code: ComfyUiApiGraphErrorCode) {
    super('ComfyUI API graph is invalid.');
    this.name = 'ComfyUiApiGraphValidationError';
    this.code = code;
  }
}

function fail(code: ComfyUiApiGraphErrorCode): never {
  throw new ComfyUiApiGraphValidationError(code);
}

function validateJsonValue(value: unknown, depth: number, seen: Set<object>): void {
  if (depth > MAX_GRAPH_DEPTH) fail('oversized');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('malformed');
    return;
  }
  if (typeof value !== 'object') fail('malformed');
  if (seen.has(value)) fail('malformed');
  seen.add(value);
  if (Array.isArray(value)) {
    for (const child of value) validateJsonValue(child, depth + 1, seen);
  } else {
    if (!isPlainRecord(value)) fail('malformed');
    for (const [key, child] of Object.entries(value)) {
      if (UNSAFE_KEYS.has(key)) fail('malformed');
      validateJsonValue(child, depth + 1, seen);
    }
  }
  seen.delete(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Plain API Format graph 执行 bounds、prototype 与 finite-value admission。 */
export function admitComfyUiApiGraph(value: unknown): BoundedApiWorkflow {
  if (!isPlainRecord(value)) fail('malformed');
  if ('nodes' in value && Array.isArray(value.nodes)) fail('frontend-format');
  validateJsonValue(value, 0, new Set());
  const entries = Object.entries(value);
  if (entries.length === 0) fail('malformed');
  if (entries.length > MAX_GRAPH_NODES) fail('oversized');
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    fail('malformed');
  }
  if (utf8ByteLength(serialized) > MAX_GRAPH_BYTES) fail('oversized');
  for (const [nodeId, node] of entries) {
    if (
      nodeId.length === 0
      || [...nodeId].length > MAX_NODE_ID_CHARS
      || CONTROL_CHARS.test(nodeId)
      || !isPlainRecord(node)
      || typeof node.class_type !== 'string'
      || node.class_type.length === 0
      || [...node.class_type].length > MAX_CLASS_TYPE_CHARS
      || CONTROL_CHARS.test(node.class_type)
      || !isPlainRecord(node.inputs)
    ) fail('malformed');
  }
  return deepFreeze(cloneJson(value) as BoundedApiWorkflow);
}

function contractNode(graph: BoundedApiWorkflow, classId: string): ComfyUiApiNode {
  const matches = Object.values(graph).filter((node) => node.class_type === classId);
  if (matches.length === 0) fail('contract-node-missing');
  if (matches.length !== 1) fail('contract-node-duplicate');
  return matches[0];
}

/** API Graph 中提取两个 stable class IDs 并调用 authoritative parser。 */
export function parseComfyUiWorkflowContractFromApiGraph(graph: BoundedApiWorkflow | unknown): ComfyUiWorkflowContract {
  const admitted = admitComfyUiApiGraph(graph);
  const bindingNode = contractNode(admitted, IMAGEN_WORKFLOW_BINDING_CLASS_ID);
  const typeNode = contractNode(admitted, IMAGEN_WORKFLOW_TYPE_CLASS_ID);
  if (!Object.prototype.hasOwnProperty.call(bindingNode.inputs, 'contract')) fail('contract-node-missing');
  if (!Object.prototype.hasOwnProperty.call(typeNode.inputs, 'contract')) fail('contract-node-missing');
  return parseComfyUiWorkflowContract(bindingNode.inputs.contract, typeNode.inputs.contract);
}

function isLink(value: unknown): boolean {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === 'string'
    && Number.isInteger(value[1]);
}

/** 验证 contract 声明的 API literal targets 与 ordered output nodes。 */
export function validateComfyUiApiGraphTargets(
  graph: BoundedApiWorkflow | unknown,
  contract: ComfyUiWorkflowContract | unknown,
): void {
  const admitted = admitComfyUiApiGraph(graph);
  const canonical = validateCanonicalComfyUiWorkflowContract(contract);
  for (const entry of canonical.entries) {
    const node = admitted[entry.locator.nodeId];
    if (node === undefined) fail('contract-target-invalid');
    if (entry.role === 'output-image') continue;
    if (!Object.prototype.hasOwnProperty.call(node.inputs, entry.locator.fieldName)) {
      fail('contract-target-invalid');
    }
    const current = node.inputs[entry.locator.fieldName];
    if (isLink(current) || typeof current !== 'string') fail('contract-target-invalid');
  }
}
