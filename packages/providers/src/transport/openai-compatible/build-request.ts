/**
 * 将 `CanonicalImageJobRequest` 转换为 OpenAI-compatible HTTP request body。
 *
 * 字段映射以 `docs/openapi/` 中 `Create image` / `Create image edit` 两份文档为准：
 *
 * - `request.output.count` → body `n`
 * - `request.output.width / height` → body `size`（通过 `inferSize` 匹配已知尺寸）
 * - `request.output.background` → body `background`
 * - `request.output.quality` → body `quality`
 * - `request.output.outputFormat` → body `output_format`
 * - `request.output.outputCompression` → body `output_compression`
 * - `request.output.moderation` → body `moderation`
 * - `request.output.inputFidelity` → body `input_fidelity`（仅 edit）
 *
 * `providerOptions` 仍是受控透传通道，但已 surface 字段被列入 handled keys
 * 黑名单，调用方 MUST 通过 `request.output` 表达这些意图，以保持"文档一等公民
 * 字段只有唯一来源"。
 */

import type { Asset } from '@imagen-ps/core-engine';
import type { CanonicalImageJobRequest, ProviderOutputOptions } from '../../contract/request.js';

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

  /** 背景模式。 */
  background?: 'auto' | 'transparent' | 'opaque';

  /** 生成质量。 */
  quality?: 'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd';

  /** 输出格式。 */
  output_format?: 'png' | 'jpeg' | 'webp';

  /** 输出压缩率（0-100）。 */
  output_compression?: number;

  /** 内容审查级别。 */
  moderation?: 'auto' | 'low';

  /** 用户标识（可选）。 */
  user?: string;

  /** 其他透传字段。 */
  [key: string]: unknown;
}

/** OpenAI-compatible images/edits 的输入图片引用。 */
export interface OpenAIImageReference {
  /** 图片 URL 或 base64 data URL。 */
  image_url?: string;

  /** File API 返回的 opaque identifier。 */
  file_id?: string;
}

/** OpenAI-compatible images/edits 的 mask 引用。 */
export interface OpenAIImageMaskReference {
  /** mask 图片 URL 或 base64 data URL。 */
  image_url?: string;

  /** File API 返回的 opaque identifier。 */
  file_id?: string;
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

  /** 背景模式。 */
  background?: 'auto' | 'transparent' | 'opaque';

  /** 生成质量。 */
  quality?: 'auto' | 'low' | 'medium' | 'high' | 'standard' | 'hd';

  /** 输出格式。 */
  output_format?: 'png' | 'jpeg' | 'webp';

  /** 输出压缩率（0-100）。 */
  output_compression?: number;

  /** 内容审查级别。 */
  moderation?: 'auto' | 'low';

  /** 对原始输入的保真度。 */
  input_fidelity?: 'high' | 'low';

  /** 其他透传字段。 */
  [key: string]: unknown;
}

/** build-request 层抛出的结构化校验错误。 */
class BuildRequestError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BuildRequestError';
    if (details !== undefined) {
      this.details = details;
    }
  }
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

/** 已被 `request.output` 或 transport 层显式处理、禁止通过 providerOptions 覆盖的 body 字段。 */
const SURFACED_HANDLED_KEYS: readonly string[] = [
  'model',
  'response_format',
  'n',
  'size',
  'quality',
  'background',
  'output_format',
  'output_compression',
  'moderation',
  'input_fidelity',
];

/**
 * 将 Asset 映射为 images/edits API 的引用对象。
 *
 * 优先级：`fileId` > `url` > `data`；三者均空时抛出结构化校验错误。
 */
function assetToImageRef(asset: Asset): OpenAIImageReference {
  if (typeof asset.fileId === 'string' && asset.fileId.length > 0) {
    return { file_id: asset.fileId };
  }

  if (typeof asset.url === 'string' && asset.url.length > 0) {
    return { image_url: asset.url };
  }

  if (typeof asset.data === 'string' && asset.data.length > 0) {
    const mimeType = asset.mimeType ?? 'image/png';
    const image_url = asset.data.startsWith('data:') ? asset.data : `data:${mimeType};base64,${asset.data}`;
    return { image_url };
  }

  throw new BuildRequestError('OpenAI-compatible edit input asset requires fileId, url, or base64 data.');
}

/**
 * 将 Asset 映射为 mask 引用对象，并校验 `image_url` 与 `file_id` exactly-one。
 */
function assetToMaskRef(asset: Asset): OpenAIImageMaskReference {
  const ref = assetToImageRef(asset);
  const hasFileId = typeof ref.file_id === 'string' && ref.file_id.length > 0;
  const hasImageUrl = typeof ref.image_url === 'string' && ref.image_url.length > 0;
  if (hasFileId === hasImageUrl) {
    throw new BuildRequestError('OpenAI-compatible edit mask MUST provide exactly one of `file_id` or `image_url`.', {
      fileId: ref.file_id,
      imageUrl: ref.image_url,
    });
  }
  return ref;
}

/** 将 `request.output` 的 surface 字段映射到 HTTP body。 */
function applyOutputToBody(
  body: Record<string, unknown>,
  output: ProviderOutputOptions | undefined,
  options: { readonly includeInputFidelity: boolean },
): void {
  if (output === undefined) {
    return;
  }

  if (output.count !== undefined) {
    body.n = output.count;
  }

  const size = inferSize(output.width, output.height);
  if (size !== undefined) {
    body.size = size;
  }

  if (output.background !== undefined) {
    body.background = output.background;
  }

  if (output.quality !== undefined) {
    body.quality = output.quality;
  }

  if (output.outputFormat !== undefined) {
    body.output_format = output.outputFormat;
  }

  if (output.outputCompression !== undefined) {
    body.output_compression = output.outputCompression;
  }

  if (output.moderation !== undefined) {
    body.moderation = output.moderation;
  }

  if (options.includeInputFidelity && output.inputFidelity !== undefined) {
    body.input_fidelity = output.inputFidelity;
  }
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

  const handledKeys = new Set<string>([...SURFACED_HANDLED_KEYS, ...extraHandledKeys]);
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

  applyOutputToBody(body, request.output, { includeInputFidelity: false });

  const isGptImageModel = body.model.startsWith('gpt-image') || body.model === 'chatgpt-image-latest';
  const responseFormatOverride =
    request.providerOptions?.image_response_format ?? request.providerOptions?.response_format;
  const disablesResponseFormat = responseFormatOverride === null || responseFormatOverride === false;
  if (!isGptImageModel && !disablesResponseFormat) {
    // 默认使用 url 格式，可由 providerOptions.image_response_format 覆盖。
    // GPT image models 不支持 response_format。
    body.response_format =
      typeof responseFormatOverride === 'string' ? (responseFormatOverride as 'url' | 'b64_json') : 'url';
  }

  applyProviderOptions(
    body,
    request.providerOptions,
    isGptImageModel || disablesResponseFormat ? ['image_response_format'] : ['image_response_format'],
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
  if (request.inputAssets === undefined || request.inputAssets.length === 0) {
    throw new BuildRequestError('OpenAI-compatible edit request requires at least one input asset.');
  }

  const images = request.inputAssets.map((asset) => assetToImageRef(asset));

  const body: OpenAIImageEditBody = {
    model: resolveModel(request, defaultModel),
    prompt: request.prompt,
    images,
  };

  if (request.maskAsset !== undefined) {
    body.mask = assetToMaskRef(request.maskAsset);
  }

  applyOutputToBody(body, request.output, { includeInputFidelity: true });

  applyProviderOptions(body, request.providerOptions, ['image_response_format']);

  return body;
}
