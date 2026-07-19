import type { ExecutionAdapter, ExecutionContext } from '@imagen-ps/core-engine';
import { prepareComfyUiUploads } from './assets.js';
import { executeComfyUiApiGraph, executeComfyUiFrontendQueue } from './drivers.js';
import { createComfyUiExecutionError, isComfyUiExecutionError } from './errors.js';
import type { ComfyUiAssetResolver, ComfyUiAssetSink, ComfyUiExecutionClock, ComfyUiExecutionRequest, ComfyUiFrontendBridgeResolver, ComfyUiHttpTransport, ComfyUiPromptHintSourceFactory } from './execution-types.js';
import { validateComfyUiExecutionRequest, validateComfyUiExecutionResult } from './execution-types.js';
import { admitComfyUiApiGraph } from './graph.js';
import { hasExactKeys, isPlainRecord } from './internal/value.js';

export const COMFYUI_EXECUTION_ADAPTER_ID = 'comfyui';
export interface CreateComfyUiExecutionAdapterOptions { readonly assetResolver: ComfyUiAssetResolver; readonly assetSink: ComfyUiAssetSink; readonly httpTransport: ComfyUiHttpTransport; readonly frontendBridgeResolver?: ComfyUiFrontendBridgeResolver; readonly promptHintSourceFactory?: ComfyUiPromptHintSourceFactory; readonly clock?: ComfyUiExecutionClock; readonly createRuntimeId?: (prefix: string) => string }
function mapBoundary(error: unknown): never { if (isComfyUiExecutionError(error)) throw error; if (error instanceof Error && error.message === 'invalid-connection') throw createComfyUiExecutionError('prepare', 'invalid-connection'); throw createComfyUiExecutionError('prepare', 'invalid-workflow'); }
function knownNoOutput(source: Extract<ComfyUiExecutionRequest['source'], { readonly kind: 'api-graph' }>): boolean {
  if (source.objectInfo === undefined) return false;
  let known = true;
  let output = false;
  for (const node of Object.values(source.graph)) {
    const metadata = source.objectInfo[node.class_type];
    if (metadata === undefined) { known = false; continue; }
    if (metadata.output_node === true || metadata.outputNode === true || /(?:save|preview|output)/iu.test(node.class_type)) output = true;
  }
  return known && !output;
}
/** Create transport-neutral adapter with no contract authority. */
export function createComfyUiExecutionAdapter(options: CreateComfyUiExecutionAdapterOptions): ExecutionAdapter {
  return { adapter: COMFYUI_EXECUTION_ADAPTER_ID, async dispatch(params: Record<string, unknown>, context?: ExecutionContext): Promise<unknown> {
    let request: ComfyUiExecutionRequest;
    try {
      if (!isPlainRecord(params) || !hasExactKeys(params, ['request'])) throw new Error('invalid-request');
      request = validateComfyUiExecutionRequest(params.request);
      if (request.source.kind === 'api-graph') request = { ...request, source: { ...request.source, graph: admitComfyUiApiGraph(request.source.graph) } };
      if (request.source.kind === 'api-graph' && knownNoOutput(request.source)) throw createComfyUiExecutionError('prepare', 'prompt-no-outputs');
    } catch (error) { return mapBoundary(error); }
    const uploads = await prepareComfyUiUploads({ connection: request.connection, images: request.images }, { resolver: options.assetResolver, transport: options.httpTransport }, context?.signal);
    const shared = { transport: options.httpTransport, sink: options.assetSink, clock: options.clock, createRuntimeId: options.createRuntimeId };
    const result = request.source.kind === 'api-graph'
      ? await executeComfyUiApiGraph(request as Extract<ComfyUiExecutionRequest, { source: { kind: 'api-graph' } }>, uploads, { ...shared, hintSourceFactory: options.promptHintSourceFactory }, context?.signal)
      : options.frontendBridgeResolver === undefined
        ? (() => { throw createComfyUiExecutionError('prepare', 'bridge-incompatible'); })()
        : await executeComfyUiFrontendQueue(request as Extract<ComfyUiExecutionRequest, { source: { kind: 'frontend-workflow' } }>, uploads, { ...shared, bridgeResolver: options.frontendBridgeResolver }, context?.signal);
    return validateComfyUiExecutionResult(result);
  } };
}
