import type { Asset } from '@imagen-ps/core-engine';
import { getProviderCatalog, type FixedProviderId } from './catalog.js';
import type { FixedGenerationRequest } from './contract/fixed-generation.js';

/** provider adapter 生成的待发送请求。 */
export interface FixedPreparedRequest {
  readonly providerId: FixedProviderId;
  readonly urlPath: string;
  readonly body: Readonly<Record<string, unknown>>;
}

function modelFor(request: FixedGenerationRequest) {
  const catalog = getProviderCatalog(request.providerId);
  const model = catalog.models.find((candidate) => candidate.id === request.modelId);
  if (!model) throw new Error(`Unknown ${request.providerId} model "${request.modelId}".`);
  if (!model.operations.includes(request.operation)) throw new Error(`Model "${request.modelId}" does not support ${request.operation}.`);
  for (const [name, parameter] of Object.entries(model.parameters)) {
    const value = request.parameters[name] ?? parameter.default;
    if (!parameter.options.some((option) => option.value === value)) throw new Error(`Invalid ${name} for model "${request.modelId}".`);
  }
  return { catalog, model };
}

function imageValues(images: readonly Asset[] | undefined): readonly string[] {
  return (images ?? []).map((image) => {
    if (typeof image.url === 'string' && image.url.length > 0) return image.url;
    if (typeof image.data === 'string' && image.data.length > 0) return image.data.startsWith('data:') ? image.data : `data:${image.mimeType ?? 'image/png'};base64,${image.data}`;
    throw new Error('Provider input image must have a URL or encoded data.');
  });
}

/** 构造 GRSAI 的固定 async 请求；replyType 不进入公共请求。 */
export function prepareGrsaiRequest(request: FixedGenerationRequest): FixedPreparedRequest {
  const { model } = modelFor(request);
  return {
    providerId: 'grsai', urlPath: '/v1/api/generate',
    body: {
      model: request.modelId, prompt: request.prompt, images: imageValues(request.images), replyType: 'async',
      ...request.parameters,
      ...(request.maskImage ? { mask: imageValues([request.maskImage.asset])[0] } : {}),
      ...(model.input?.mask === false && request.maskImage ? {} : {}),
    },
  };
}

/** 构造 RunningHub 的固定请求；endpoint 与模型保持在 adapter/catalog 内。 */
export function prepareRunningHubRequest(request: FixedGenerationRequest): FixedPreparedRequest {
  const { model } = modelFor(request);
  if (!model.endpoint) throw new Error(`RunningHub model "${request.modelId}" has no endpoint.`);
  return {
    providerId: 'runninghub', urlPath: model.endpoint,
    body: { prompt: request.prompt, imageUrls: imageValues(request.images), ...(model.fixed ?? {}), ...request.parameters, ...(request.maskImage ? { maskUrl: imageValues([request.maskImage.asset])[0] } : {}) },
  };
}
