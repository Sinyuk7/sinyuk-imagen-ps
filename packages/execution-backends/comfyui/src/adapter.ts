import type { ExecutionAdapter, ExecutionContext } from '@imagen-ps/core-engine';
import { prepareComfyUiUploads } from './assets.js';
import { ComfyUiContractValidationError } from './contract/index.js';
import {
  executeComfyUiApiGraph,
  executeComfyUiFrontendQueue,
} from './drivers.js';
import {
  createComfyUiExecutionError,
  isComfyUiExecutionError,
} from './errors.js';
import type {
  ComfyUiApiGraphDriverDependencies,
  ComfyUiFrontendQueueDriverDependencies,
} from './drivers.js';
import type {
  ComfyUiAssetResolver,
  ComfyUiAssetSink,
  ComfyUiExecutionClock,
  ComfyUiExecutionRequest,
  ComfyUiFrontendBridgeResolver,
  ComfyUiHttpTransport,
  ComfyUiMaskEncoder,
  ComfyUiPromptHintSourceFactory,
} from './execution-types.js';
import {
  validateComfyUiExecutionRequest,
  validateComfyUiExecutionResult,
} from './execution-types.js';
import { ComfyUiApiGraphValidationError, parseComfyUiWorkflowContractFromApiGraph, validateComfyUiApiGraphTargets } from './graph.js';
import { hasExactKeys, isPlainRecord } from './internal/value.js';

/** Stable ComfyUI Core execution adapter id。 */
export const COMFYUI_EXECUTION_ADAPTER_ID = 'comfyui';

/** Stable ComfyUI `ExecutionAdapter` 的 composition dependencies。 */
export interface CreateComfyUiExecutionAdapterOptions {
  readonly assetResolver: ComfyUiAssetResolver;
  readonly assetSink: ComfyUiAssetSink;
  readonly httpTransport: ComfyUiHttpTransport;
  readonly maskEncoder?: ComfyUiMaskEncoder;
  readonly frontendBridgeResolver?: ComfyUiFrontendBridgeResolver;
  readonly promptHintSourceFactory?: ComfyUiPromptHintSourceFactory;
  readonly clock?: ComfyUiExecutionClock;
  readonly createRuntimeId?: (prefix: string) => string;
}

function validateContractInputs(request: ComfyUiExecutionRequest): void {
  const images = request.contract.entries.filter((entry) => entry.role === 'image');
  if (request.images.length > images.length) throw createComfyUiExecutionError('prepare', 'invalid-contract');
  for (const entry of images) {
    if (entry.required && request.images[entry.slot] === undefined) {
      throw createComfyUiExecutionError('prepare', 'invalid-contract');
    }
  }
  const mask = request.contract.entries.find((entry) => entry.role === 'mask');
  if (request.mask !== undefined && mask === undefined) throw createComfyUiExecutionError('prepare', 'invalid-contract');
  if (mask?.required && request.mask === undefined) throw createComfyUiExecutionError('prepare', 'invalid-contract');
}

function validateSource(request: ComfyUiExecutionRequest): void {
  if (request.source.kind !== 'api-graph') return;
  const graphContract = parseComfyUiWorkflowContractFromApiGraph(request.source.graph);
  if (JSON.stringify(graphContract) !== JSON.stringify(request.contract)) {
    throw createComfyUiExecutionError('prepare', 'invalid-contract');
  }
  validateComfyUiApiGraphTargets(request.source.graph, request.contract);
}

function mapBoundaryError(error: unknown): never {
  if (isComfyUiExecutionError(error)) throw error;
  if (error instanceof ComfyUiContractValidationError) {
    throw createComfyUiExecutionError('prepare', 'invalid-contract');
  }
  if (error instanceof ComfyUiApiGraphValidationError) {
    throw createComfyUiExecutionError('prepare', 'invalid-workflow');
  }
  if (error instanceof Error && error.message === 'invalid-connection') {
    throw createComfyUiExecutionError('prepare', 'invalid-connection');
  }
  throw createComfyUiExecutionError('prepare', 'invalid-workflow');
}

/** 创建 exact `{request}` envelope 的 transport-neutral ComfyUI adapter。 */
export function createComfyUiExecutionAdapter(
  options: CreateComfyUiExecutionAdapterOptions,
): ExecutionAdapter {
  return {
    adapter: COMFYUI_EXECUTION_ADAPTER_ID,
    async dispatch(params: Record<string, unknown>, context?: ExecutionContext): Promise<unknown> {
      if (!isPlainRecord(params) || !hasExactKeys(params, ['request'])) {
        throw createComfyUiExecutionError('prepare', 'invalid-workflow');
      }
      let request: ComfyUiExecutionRequest;
      try {
        request = validateComfyUiExecutionRequest(params.request);
        validateContractInputs(request);
        validateSource(request);
      } catch (error) {
        return mapBoundaryError(error);
      }

      const uploads = await prepareComfyUiUploads({
        connection: request.connection,
        contract: request.contract,
        images: request.images,
        mask: request.mask,
      }, {
        resolver: options.assetResolver,
        transport: options.httpTransport,
        maskEncoder: options.maskEncoder,
      }, context?.signal);

      const sharedDependencies: ComfyUiApiGraphDriverDependencies = {
        transport: options.httpTransport,
        sink: options.assetSink,
        clock: options.clock,
        createRuntimeId: options.createRuntimeId,
        hintSourceFactory: options.promptHintSourceFactory,
      };

      if (request.source.kind === 'api-graph') {
        const result = await executeComfyUiApiGraph(
          request as ComfyUiExecutionRequest & {
            readonly source: Extract<ComfyUiExecutionRequest['source'], { readonly kind: 'api-graph' }>;
          },
          uploads,
          sharedDependencies,
          context?.signal,
        );
        return validateComfyUiExecutionResult(result);
      }

      if (options.frontendBridgeResolver === undefined) {
        throw createComfyUiExecutionError('prepare', 'bridge-incompatible');
      }
      const frontendDependencies: ComfyUiFrontendQueueDriverDependencies = {
        ...sharedDependencies,
        bridgeResolver: options.frontendBridgeResolver,
      };
      const result = await executeComfyUiFrontendQueue(
        request as ComfyUiExecutionRequest & {
          readonly source: Extract<ComfyUiExecutionRequest['source'], { readonly kind: 'frontend-workflow' }>;
        },
        uploads,
        frontendDependencies,
        context?.signal,
      );
      return validateComfyUiExecutionResult(result);
    },
  };
}
