import {
  assertComfyUiBridgeIdentity,
  createComfyUiBridgeHandshakeRequest,
  createComfyUiFrontendSubmitRequest,
  validateComfyUiBridgeHandshake,
  validateComfyUiFrontendReceipt,
} from './bridge.js';
import type { ComfyUiPreparedUploads } from './assets.js';
import {
  createComfyUiExecutionError,
  normalizeComfyUiExecutionError,
} from './errors.js';
import type {
  ComfyUiAssetSink,
  ComfyUiExecutionClock,
  ComfyUiExecutionRequest,
  ComfyUiExecutionResult,
  ComfyUiFrontendBridgeResolver,
  ComfyUiHttpTransport,
  ComfyUiPromptHintSource,
  ComfyUiPromptHintSourceFactory,
} from './execution-types.js';
import { validateComfyUiExecutionResult } from './execution-types.js';
import { decodeJsonBytes, encodeJsonBytes, hasExactKeys, isPlainRecord, safeRuntimeId } from './internal/value.js';
import { buildComfyUiApiPrompt, buildComfyUiFrontendMutations } from './mutation.js';
import {
  defaultComfyUiExecutionClock,
  downloadAndStoreComfyUiOutputs,
  observeKnownComfyUiPrompt,
} from './observation.js';

const MAX_PROMPT_ACK_BYTES = 16 * 1024;
const MAX_PROMPT_REQUEST_BYTES = 2_100_000;

interface ApiReceipt {
  readonly promptId: string;
  readonly acknowledgedAt: number;
}

interface SharedDriverDependencies {
  readonly transport: ComfyUiHttpTransport;
  readonly sink: ComfyUiAssetSink;
  readonly clock?: ComfyUiExecutionClock;
  readonly createRuntimeId?: (prefix: string) => string;
}

/** API Graph driver 的 host-injected dependencies。 */
export interface ComfyUiApiGraphDriverDependencies extends SharedDriverDependencies {
  readonly hintSourceFactory?: ComfyUiPromptHintSourceFactory;
}

/** Frontend Queue driver 的 host-injected dependencies。 */
export interface ComfyUiFrontendQueueDriverDependencies extends SharedDriverDependencies {
  readonly bridgeResolver: ComfyUiFrontendBridgeResolver;
}

function runtimeId(dependencies: SharedDriverDependencies, prefix: string): string {
  const value = dependencies.createRuntimeId?.(prefix) ?? safeRuntimeId(prefix);
  if (value.length === 0 || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw createComfyUiExecutionError('prepare', 'invalid-workflow');
  }
  return value;
}

function validateApiReceipt(
  body: Uint8Array,
  clientId: string,
  acknowledgedAt: number,
): ApiReceipt {
  let value: unknown;
  try {
    value = decodeJsonBytes(body);
  } catch {
    throw createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true });
  }
  if (!isPlainRecord(value) || !hasExactKeys(value, ['prompt_id'], ['number', 'node_errors', 'client_id'])) {
    throw createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true });
  }
  if (
    typeof value.prompt_id !== 'string'
    || value.prompt_id.length === 0
    || value.prompt_id.length > 128
    || /[\u0000-\u001f\u007f]/.test(value.prompt_id)
    || (value.client_id !== undefined && value.client_id !== clientId)
  ) throw createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true });
  return { promptId: value.prompt_id, acknowledgedAt };
}

async function completePrompt(
  request: ComfyUiExecutionRequest,
  promptId: string,
  dependencies: SharedDriverDependencies,
  options: {
    readonly hintSource?: ComfyUiPromptHintSource;
    readonly initialHintUnavailable?: boolean;
  },
  signal: AbortSignal | undefined,
): Promise<ComfyUiExecutionResult> {
  let observed;
  try {
    observed = await observeKnownComfyUiPrompt({
      connection: request.connection,
      promptId,
      contract: request.contract,
    }, {
      transport: dependencies.transport,
      hintSource: options.hintSource,
      clock: dependencies.clock,
    }, signal);
  } catch (error) {
    throw normalizeComfyUiExecutionError(error, {
      stage: 'observe',
      code: 'execution-state-unknown',
      remoteMayContinue: true,
    });
  }
  const outputs = await downloadAndStoreComfyUiOutputs({
    connection: request.connection,
    descriptors: observed.descriptors,
  }, {
    transport: dependencies.transport,
    sink: dependencies.sink,
  }, signal);
  const warnings = options.initialHintUnavailable
    && !observed.warnings.some((warning) => warning.code === 'realtime-hint-unavailable')
    ? [{ code: 'realtime-hint-unavailable' as const, messageKey: 'comfyui.warning.realtime-hint-unavailable' }, ...observed.warnings]
    : observed.warnings;
  return validateComfyUiExecutionResult({ outputs, warnings });
}

/** API Graph clone/mutation、ephemeral client、one POST 与 known-prompt result chain。 */
export async function executeComfyUiApiGraph(
  request: ComfyUiExecutionRequest & { readonly source: Extract<ComfyUiExecutionRequest['source'], { readonly kind: 'api-graph' }> },
  uploads: ComfyUiPreparedUploads,
  dependencies: ComfyUiApiGraphDriverDependencies,
  signal?: AbortSignal,
): Promise<ComfyUiExecutionResult> {
  const prompt = buildComfyUiApiPrompt(request.source.graph, request.contract, {
    prompt: request.prompt,
    imageValues: uploads.imageValues,
    maskValue: uploads.maskValue,
  });
  const clock = dependencies.clock ?? defaultComfyUiExecutionClock;
  const clientId = runtimeId(dependencies, 'comfy-client');
  let hintSource: ComfyUiPromptHintSource | undefined;
  let hintUnavailable = false;
  if (dependencies.hintSourceFactory !== undefined) {
    try {
      hintSource = await dependencies.hintSourceFactory.open({
        origin: request.connection.origin,
        clientId,
      }, signal);
    } catch {
      hintUnavailable = true;
    }
  } else {
    hintUnavailable = true;
  }

  try {
    const body = encodeJsonBytes({ prompt, client_id: clientId });
    if (body.byteLength > MAX_PROMPT_REQUEST_BYTES) {
      throw createComfyUiExecutionError('prepare', 'invalid-workflow');
    }
    let response;
    try {
      response = await dependencies.transport.request({
        origin: request.connection.origin,
        method: 'POST',
        path: '/prompt',
        headers: { 'content-type': 'application/json' },
        body,
        timeoutMs: request.connection.requestTimeoutMs,
        maxResponseBytes: MAX_PROMPT_ACK_BYTES,
      }, signal);
    } catch (error) {
      throw normalizeComfyUiExecutionError(error, {
        stage: 'submit',
        code: 'submission-unknown',
        remoteMayContinue: true,
      });
    }
    if (response.body.byteLength > MAX_PROMPT_ACK_BYTES) {
      throw createComfyUiExecutionError('submit', 'submission-unknown', { remoteMayContinue: true });
    }
    if (response.status < 200 || response.status >= 300) {
      throw createComfyUiExecutionError('submit', 'submission-rejected');
    }
    const receipt = validateApiReceipt(response.body, clientId, clock.now());
    return await completePrompt(request, receipt.promptId, dependencies, {
      hintSource,
      initialHintUnavailable: hintUnavailable,
    }, signal);
  } finally {
    hintSource?.dispose();
  }
}

/** Frontend fixed handshake、runtime operationId、native Queue receipt 与 shared result chain。 */
export async function executeComfyUiFrontendQueue(
  request: ComfyUiExecutionRequest & { readonly source: Extract<ComfyUiExecutionRequest['source'], { readonly kind: 'frontend-workflow' }> },
  uploads: ComfyUiPreparedUploads,
  dependencies: ComfyUiFrontendQueueDriverDependencies,
  signal?: AbortSignal,
): Promise<ComfyUiExecutionResult> {
  const bridge = await dependencies.bridgeResolver.resolve(request.connection.connectionId);
  if (bridge === undefined) {
    throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
  }
  const identity = { ...bridge.identity };
  const handshakeRequest = createComfyUiBridgeHandshakeRequest(
    identity,
    runtimeId(dependencies, 'bridge-request'),
  );
  let handshakeResponse: unknown;
  try {
    handshakeResponse = await bridge.exchange(handshakeRequest, signal);
  } catch (error) {
    throw normalizeComfyUiExecutionError(error, { stage: 'prepare', code: 'bridge-incompatible' });
  }
  validateComfyUiBridgeHandshake(handshakeResponse, handshakeRequest.requestId, identity);
  assertComfyUiBridgeIdentity(bridge.identity, identity);

  const mutations = buildComfyUiFrontendMutations(request.contract, {
    prompt: request.prompt,
    imageValues: uploads.imageValues,
    maskValue: uploads.maskValue,
  });
  const timeoutMs = Math.min(request.connection.requestTimeoutMs, 30_000);
  const submission = createComfyUiFrontendSubmitRequest({
    identity,
    remotePath: request.source.remotePath,
    mutations,
    configureTimeoutMs: timeoutMs,
    receiptTimeoutMs: timeoutMs,
    requestId: runtimeId(dependencies, 'bridge-request'),
    operationId: runtimeId(dependencies, 'comfy-operation'),
  });
  let response: unknown;
  try {
    response = await bridge.exchange(submission.request, signal);
  } catch (error) {
    throw normalizeComfyUiExecutionError(error, {
      stage: 'submit',
      code: 'submission-unknown',
      remoteMayContinue: true,
    });
  }
  assertComfyUiBridgeIdentity(bridge.identity, identity, true);
  const receipt = validateComfyUiFrontendReceipt(
    response,
    submission.request.requestId,
    submission.operationId,
  );
  return completePrompt(request, receipt.promptId, dependencies, {}, signal);
}
