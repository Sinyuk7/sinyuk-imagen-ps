import { deepFreeze, isPlainRecord, utf8ByteLength } from './internal/value.js';

const MAX_WORKFLOW_BYTES = 2_000_000;
const MAX_WORKFLOW_NODES = 2_000;
const MAX_WORKFLOW_DEPTH = 32;
const MAX_NODE_ID_CHARS = 128;
const MAX_CLASS_TYPE_CHARS = 256;
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

/** ComfyUI API Format 中通过边界校验的 node。 */
export interface ComfyUiApiNode {
  readonly class_type: string;
  readonly inputs: Readonly<Record<string, unknown>>;
  readonly [key: string]: unknown;
}

/** 通过边界校验的 ComfyUI API Format graph。 */
export type BoundedComfyUiApiWorkflow = Readonly<Record<string, ComfyUiApiNode>>;

/** API graph admission helper used by internal API driver. */
export function admitComfyUiApiGraph(value: unknown): BoundedComfyUiApiWorkflow {
  const workflowDocument = detectAndAdmitComfyUiWorkflowDocument(value);
  if (workflowDocument.kind !== 'api') throw new ComfyUiWorkflowDocumentError('malformed');
  return workflowDocument.graph;
}

/** 通过边界校验的 ComfyUI Frontend Save Format workflow record。 */
export interface BoundedComfyUiFrontendWorkflow {
  readonly nodes: readonly Readonly<Record<string, unknown>>[];
  readonly [key: string]: unknown;
}

/** 内部 structural detector 产生的 bounded workflow record。 */
export type BoundedComfyUiWorkflowDocument =
  | { readonly kind: 'api'; readonly graph: BoundedComfyUiApiWorkflow }
  | { readonly kind: 'frontend'; readonly workflow: BoundedComfyUiFrontendWorkflow };

/** Bounded workflow admission 的错误分类。 */
export type ComfyUiWorkflowDocumentErrorCode = 'malformed' | 'oversized' | 'ambiguous';

/** Bounded workflow admission 的安全错误。 */
export class ComfyUiWorkflowDocumentError extends Error {
  readonly code: ComfyUiWorkflowDocumentErrorCode;

  constructor(code: ComfyUiWorkflowDocumentErrorCode) {
    super('ComfyUI Workflow is invalid.');
    this.name = 'ComfyUiWorkflowDocumentError';
    this.code = code;
  }
}

function fail(code: ComfyUiWorkflowDocumentErrorCode): never {
  throw new ComfyUiWorkflowDocumentError(code);
}

function validateJsonValue(value: unknown, depth: number, seen: Set<object>): void {
  if (depth > MAX_WORKFLOW_DEPTH) fail('oversized');
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

function boundedNodeId(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && [...value].length <= MAX_NODE_ID_CHARS
    && !CONTROL_CHARS.test(value);
}

function boundedClassType(value: unknown): value is string {
  return typeof value === 'string'
    && value.length > 0
    && [...value].length <= MAX_CLASS_TYPE_CHARS
    && !CONTROL_CHARS.test(value);
}

function validateCommonBounds(value: unknown): void {
  validateJsonValue(value, 0, new Set());
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    fail('malformed');
  }
  if (utf8ByteLength(serialized) > MAX_WORKFLOW_BYTES) fail('oversized');
}

function looksLikeApi(value: Record<string, unknown>): boolean {
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([nodeId, node]) => (
    boundedNodeId(nodeId)
    && isPlainRecord(node)
    && boundedClassType(node.class_type)
    && isPlainRecord(node.inputs)
  ));
}

function looksLikeFrontend(value: Record<string, unknown>): boolean {
  if (!Array.isArray(value.nodes) || value.nodes.length === 0) return false;
  return value.nodes.every((node) => {
    if (!isPlainRecord(node)) return false;
    const id = typeof node.id === 'number' && Number.isSafeInteger(node.id)
      ? String(node.id)
      : node.id;
    const classType = node.type ?? node.comfyClass;
    return boundedNodeId(id) && boundedClassType(classType);
  });
}

function containsApiNode(value: Record<string, unknown>): boolean {
  return Object.entries(value).some(([nodeId, node]) => (
    nodeId !== 'nodes'
    && boundedNodeId(nodeId)
    && isPlainRecord(node)
    && boundedClassType(node.class_type)
    && isPlainRecord(node.inputs)
  ));
}

/**
 * 自动检测并校验 Frontend Save Format 或 API Format。
 *
 * mixed/ambiguous shape 会 fail closed，格式仅保留在 runtime workflow record 内部。
 */
export function detectAndAdmitComfyUiWorkflowDocument(value: unknown): BoundedComfyUiWorkflowDocument {
  if (!isPlainRecord(value)) fail('malformed');
  validateCommonBounds(value);
  const api = looksLikeApi(value);
  const frontend = looksLikeFrontend(value);
  if (frontend && containsApiNode(value)) fail('ambiguous');
  if (api === frontend) fail(api ? 'ambiguous' : 'malformed');

  if (api) {
    const entries = Object.entries(value);
    if (entries.length > MAX_WORKFLOW_NODES) fail('oversized');
    return deepFreeze({
      kind: 'api' as const,
      graph: cloneJson(value) as BoundedComfyUiApiWorkflow,
    });
  }

  const nodes = value.nodes as readonly unknown[];
  if (nodes.length > MAX_WORKFLOW_NODES) fail('oversized');
  return deepFreeze({
    kind: 'frontend' as const,
    workflow: cloneJson(value) as BoundedComfyUiFrontendWorkflow,
  });
}

/** 对已 admitted workflow record 再次复制，避免 driver 修改 runtime cache。 */
export function cloneComfyUiWorkflowDocument(
  workflowDocument: BoundedComfyUiWorkflowDocument,
): BoundedComfyUiWorkflowDocument {
  return workflowDocument.kind === 'api'
    ? detectAndAdmitComfyUiWorkflowDocument(cloneJson(workflowDocument.graph))
    : detectAndAdmitComfyUiWorkflowDocument(cloneJson(workflowDocument.workflow));
}

/** 生成稳定、bounded 的 workflow record fingerprint。 */
export function fingerprintComfyUiWorkflowDocument(workflowDocument: BoundedComfyUiWorkflowDocument): string {
  const source = JSON.stringify(workflowDocument.kind === 'api' ? workflowDocument.graph : workflowDocument.workflow);
  let left = 0x811c9dc5;
  let right = 0x9e3779b9;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    left = Math.imul(left ^ code, 0x01000193) >>> 0;
    right = Math.imul(right ^ code, 0x85ebca6b) >>> 0;
  }
  return `wf-${left.toString(16).padStart(8, '0')}${right.toString(16).padStart(8, '0')}`;
}

/** 判断 Frontend node 是否 muted 或 bypassed。 */
export function isComfyUiFrontendNodeActive(node: Readonly<Record<string, unknown>>): boolean {
  return node.mode !== 2
    && node.mode !== 4
    && node.muted !== true
    && node.bypassed !== true;
}

/** 返回 workflow record 内 active node 的 bounded class types。 */
export function listActiveComfyUiClassTypes(
  workflowDocument: BoundedComfyUiWorkflowDocument,
): readonly string[] {
  if (workflowDocument.kind === 'api') {
    return Object.values(workflowDocument.graph).map((node) => node.class_type);
  }
  return workflowDocument.workflow.nodes
    .filter(isComfyUiFrontendNodeActive)
    .map((node) => String(node.type ?? node.comfyClass));
}
