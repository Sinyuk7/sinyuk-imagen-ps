/**
 * 将 `CanonicalImageJobRequest` 转换为 OpenAI-compatible HTTP request body。
 */

import type { Asset } from '@imagen-ps/core-engine';
import type { CanonicalImageJobRequest } from '../../contract/request.js';

/**
 * OpenAI-compatible images/generations 的请求 body。
 */
export interface OpenAIImageGenerationBody {
  /** 使用的 model target。 */
  model: string;

  /** 用户 prompt。 */
  prompt: string;

  /** 生成张数。 */
  n?: number;

  /** 图像尺寸。 */
  size?: string;

  /** 响应格式：url 或 b64_json。 */
  response_format?: 'url' | 'b64_json';

  /** 用户标识（可选）。 */
  user?: string;

  /** 其他透传字段。 */
  [key: string]: unknown;
}

/** OpenAI-compatible images/edits 的输入图片引用。 */
export interface OpenAIImageReference {
  /** 输入图片 URL 或 base64 data URL。 */
  image_url: string;
}

/** OpenAI-compatible images/edits 的 mask 引用。 */
export interface OpenAIImageMaskReference {
  /** mask 图片 URL 或 base64 data URL。 */
  image_url: string;
}

/**
 * OpenAI-compatible images/edits 的请求 body。
 */
export interface OpenAIImageEditBody {
  /** 使用的 model target。 */
  model: string;

  /** 用户 prompt。 */
  prompt: string;

  /** 输入图片引用列表。 */
  images: OpenAIImageReference[];

  /** 可选 mask 图片引用。 */
  mask?: OpenAIImageMaskReference;

  /** 生成张数。 */
  n?: number;

  /** 图像尺寸。 */
  size?: string;

  /** 其他透传字段。 */
  [key: string]: unknown;
}

/**
 * 从 width 与 height 推断 OpenAI-compatible size 字符串。
 *
 * 支持常见尺寸；若无法匹配则返回 undefined，让上游决定默认值。
 */
function inferSize(width: number | undefined, height: number | undefined): string | undefined {
  if (width === undefined || height === undefined) {
    return undefined;
  }

  const sizeMap: Record<string, string> = {
    '256x256': '256x256',
    '512x512': '512x512',
    '1024x1024': '1024x1024',
    '1792x1024': '1792x1024',
    '1024x1792': '1024x1792',
    '1536x1024': '1536x1024',
    '1024x1536': '1024x1536',
  };

  const key = `${width}x${height}`;
  return sizeMap[key];
}

/** 从 request 与 config 解析有效 model。 */
function resolveModel(request: CanonicalImageJobRequest, defaultModel?: string): string {
  return typeof request.providerOptions?.model === 'string'
    ? (request.providerOptions.model as string)
    : (defaultModel ?? 'dall-e-3');
}

/**
 * 将 Asset 映射为 images/edits API 的 image_url 引用。
 */
function assetToImageUrl(asset: Asset): string {
  if (typeof asset.url === 'string' && asset.url.length > 0) {
    return asset.url;
  }

  if (typeof asset.data === 'string' && asset.data.length > 0) {
    const mimeType = asset.mimeType ?? 'image/png';
    if (asset.data.startsWith('data:')) {
      return asset.data;
    }
    return `data:${mimeType};base64,${asset.data}`;
  }

  throw new Error('OpenAI-compatible edit input asset requires url or base64 data.');
}

/** 将 providerOptions 透传到 body，排除已显式处理字段。 */
function applyProviderOptions(
  body: Record<string, unknown>,
  providerOptions: Readonly<Record<string, unknown>> | undefined,
  extraHandledKeys: readonly string[] = [],
): void {
  if (!providerOptions) {
    return;
  }

  const handledKeys = new Set(['model', 'response_format', ...extraHandledKeys]);
  for (const [key, value] of Object.entries(providerOptions)) {
    if (!handledKeys.has(key) && value !== undefined) {
      body[key] = value;
    }
  }
}

/**
 * 构造 OpenAI-compatible images/generations HTTP request body。
 *
 * @param request 已校验的 canonical request
 * @param defaultModel provider config 中的默认 model
 */
export function buildRequestBody(request: CanonicalImageJobRequest, defaultModel?: string): OpenAIImageGenerationBody {
  const body: OpenAIImageGenerationBody = {
    model: resolveModel(request, defaultModel),
    prompt: request.prompt,
  };

  if (request.output?.count !== undefined) {
    body.n = request.output.count;
  }

  const size = inferSize(request.output?.width, request.output?.height);
  if (size !== undefined) {
    body.size = size;
  }

  const isGptImageModel = body.model.startsWith('gpt-image') || body.model === 'chatgpt-image-latest';
  const disablesResponseFormat =
    request.providerOptions?.response_format === null || request.providerOptions?.response_format === false;
  if (!isGptImageModel && !disablesResponseFormat) {
    // 默认使用 url 格式，可由 providerOptions 覆盖。GPT image models 不支持 response_format。
    body.response_format =
      typeof request.providerOptions?.response_format === 'string'
        ? (request.providerOptions.response_format as 'url' | 'b64_json')
        : 'url';
  }

  applyProviderOptions(
    body,
    request.providerOptions,
    isGptImageModel || disablesResponseFormat ? ['response_format'] : [],
  );

  return body;
}

/**
 * 构造 OpenAI-compatible images/edits HTTP request body。
 *
 * @param request 已校验的 canonical request
 * @param defaultModel provider config 中的默认 model
 */
export function buildEditRequestBody(request: CanonicalImageJobRequest, defaultModel?: string): OpenAIImageEditBody {
  const images = (request.inputAssets ?? []).map((asset) => ({
    image_url: assetToImageUrl(asset),
  }));

  if (images.length === 0) {
    throw new Error('OpenAI-compatible edit request requires at least one input asset.');
  }

  const body: OpenAIImageEditBody = {
    model: resolveModel(request, defaultModel),
    prompt: request.prompt,
    images,
  };

  if (request.maskAsset !== undefined) {
    body.mask = { image_url: assetToImageUrl(request.maskAsset) };
  }

  if (request.output?.count !== undefined) {
    body.n = request.output.count;
  }

  const size = inferSize(request.output?.width, request.output?.height);
  if (size !== undefined) {
    body.size = size;
  }

  applyProviderOptions(body, request.providerOptions);

  return body;
}
