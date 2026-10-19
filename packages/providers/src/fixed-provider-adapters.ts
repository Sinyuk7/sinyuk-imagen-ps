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

/** 将通用提示词组装为固定 Provider 的单段请求文本。 */
export function promptForWire(request: Pick<FixedGenerationRequest, 'prompt' | 'systemPrompt' | 'userPrompt'>): string {
  const userPrompt = request.userPrompt ?? request.prompt;
  return request.systemPrompt?.trim() ? `${request.systemPrompt.trim()}\n\n${userPrompt}` : userPrompt;
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
      model: request.modelId, prompt: promptForWire(request), images: imageValues(request.images), replyType: 'async',
      ...parameters,
      ...(request.maskImage && model.input?.mask !== false ? { mask: imageValues([request.maskImage.asset])[0] } : {}),
    },
  };
}

/** 构造 RunningHub 的固定请求；endpoint 与模型保持在 adapter/catalog 内。 */
/** 检查 RunningHub 请求的模型能力和参数，不读取输入图片内容。 */
export function validateRunningHubRequest(request: FixedGenerationRequest): void {
  const { model } = checkProviderParameters(request);
  if (request.maskImage && (model.input?.mask !== true || request.operation !== 'image_edit')) {
    throw new Error(`RunningHub model "${request.modelId}" does not support mask input.`);
  }
}

export function prepareRunningHubRequest(request: FixedGenerationRequest): FixedPreparedRequest {
  const { model, parameters: checked } = checkProviderParameters(request);
  if (request.maskImage && (model.input?.mask !== true || request.operation !== 'image_edit')) {
    throw new Error(`RunningHub model "${request.modelId}" does not support mask input.`);
  }
  const parameters = { ...checked };
  if (typeof parameters.aspectRatio === 'string') {
    const rule = model.parameters.aspectRatio;
    if (rule) parameters.aspectRatio = canonicalRunningHubRatio(parameters.aspectRatio, rule.options.map((option) => option.value));
  }
  const route = model.routes?.[request.operation];
  const endpoint = route?.endpoint ?? route?.path ?? model.endpoint;
  if (!endpoint) throw new Error(`RunningHub model "${request.modelId}" has no route for operation "${request.operation}".`);
  const inputImages = request.operation === 'image_edit' ? { imageUrls: imageValues(request.images) } : {};
  const mask = request.operation === 'image_edit' && request.maskImage
    ? { maskUrl: imageValues([request.maskImage.asset])[0] }
    : {};
  const wireParameters = Object.fromEntries(Object.entries(parameters).filter(([name, value]) => !(name === 'aspectRatio' && value === 'auto')));
  return {
    providerId: 'runninghub', urlPath: endpoint,
    body: { prompt: promptForWire(request), ...inputImages, ...(model.fixed ?? {}), ...wireParameters, ...mask },
  };
}
