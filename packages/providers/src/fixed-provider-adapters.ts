import type { Asset } from '@imagen-ps/core-engine';
import { type FixedProviderId } from './catalog.js';
import type { FixedGenerationRequest } from './contract/fixed-generation.js';
import { checkProviderParameters, canonicalRunningHubRatio } from './provider-parameter-checkers.js';

/** provider adapter 生成的待发送请求。 */
export interface FixedPreparedRequest {
  readonly providerId: FixedProviderId;
  readonly urlPath: string;
  readonly body: Readonly<Record<string, unknown>>;
}

/** 固定 provider transport 的统一构造入口；上层只需要选择 providerId。 */
export function prepareFixedProviderRequest(request: FixedGenerationRequest): FixedPreparedRequest {
  if (request.providerId === 'grsai') return prepareGrsaiRequest(request);
  return prepareRunningHubRequest(request);
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
  const { model, parameters } = checkProviderParameters(request);
  return {
    providerId: 'grsai', urlPath: '/v1/api/generate',
    body: {
      model: request.modelId, prompt: request.prompt, images: imageValues(request.images), replyType: 'async',
      ...parameters,
      ...(request.maskImage && model.input?.mask !== false ? { mask: imageValues([request.maskImage.asset])[0] } : {}),
    },
  };
}

/** 构造 RunningHub 的固定请求；endpoint 与模型保持在 adapter/catalog 内。 */
export function prepareRunningHubRequest(request: FixedGenerationRequest): FixedPreparedRequest {
  const { model, parameters: checked } = checkProviderParameters(request);
  const parameters = { ...checked };
  if (typeof parameters.aspectRatio === 'string') {
    const rule = model.parameters.aspectRatio;
    if (rule) parameters.aspectRatio = canonicalRunningHubRatio(parameters.aspectRatio, rule.options.map((option) => option.value));
  }
  if (!model.endpoint) throw new Error(`RunningHub model "${request.modelId}" has no endpoint.`);
  return {
    providerId: 'runninghub', urlPath: model.endpoint,
    body: { prompt: request.prompt, imageUrls: imageValues(request.images), ...(model.fixed ?? {}), ...parameters, ...(request.maskImage ? { maskUrl: imageValues([request.maskImage.asset])[0] } : {}) },
  };
}
