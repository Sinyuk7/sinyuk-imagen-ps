/**
 * 将 `CanonicalImageJobRequest` 转换为 image endpoint HTTP request body。
 *
 * 字段映射参考 OpenAI Images API（create-image / create-image-edit）快照：
 *
 * - `request.output.count` → body `n`
 * - `request.output.sizePreset / aspectRatio` → body `size`
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
import type { ImageEditCodec } from '../../contract/provider.js';
import { resolveImageModelOutput, type ImageCatalogProviderId } from '../../contract/image-model-capability.js';

/**
 * Image endpoint images/generations 的请求 body。
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
  quality?: 'auto' | 'low' | 'medium' | 'high';

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

/** Image endpoint images/edits 的输入图片引用。 */
export interface OpenAIImageReference {
  /** 图片 URL 或 base64 data URL。 */
  image_url?: string;

  /** File API 返回的 opaque identifier。 */
  file_id?: string;
}

/** Image endpoint images/edits 的 mask 引用。 */
export interface OpenAIImageMaskReference {
  /** mask 图片 URL 或 base64 data URL。 */
  image_url?: string;

  /** File API 返回的 opaque identifier。 */
  file_id?: string;
}

/**
 * Image endpoint images/edits 的请求 body。
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
  quality?: 'auto' | 'low' | 'medium' | 'high';

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
 * 从 width 与 height 推断 image endpoint size 字符串。
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

function sizeFromPreset(preset: NonNullable<ProviderOutputOptions['sizePreset']>): 512 | 1024 | 1536 {
  switch (preset) {
    case '512':
      return 512;
    case '1k':
      return 1024;
    case '2k':
    case '4k':
      return 1536;
  }
}

function concreteSizeFromOutput(
  output: ProviderOutputOptions,
  options: { readonly operation: CanonicalImageJobRequest['operation'] },
): string | undefined {
  if (output.sizePreset === undefined) {
    return inferSize(output.width, output.height);
  }

  if (options.operation === 'image_edit' && (output.aspectRatio === 'auto' || output.aspectRatio === 'source')) {
    return undefined;
  }

  const side = sizeFromPreset(output.sizePreset);
  switch (output.aspectRatio) {
    case '16:9':
      return `${side}x${Math.round(side * 9 / 16)}`;
    case '9:16':
      return `${Math.round(side * 9 / 16)}x${side}`;
    case '1:1':
    case 'source':
    case 'auto':
    case undefined:
    default:
      return `${side}x${side}`;
  }
}

/** 从 request 与 config 解析有效 model。 */
function resolveModel(request: CanonicalImageJobRequest, defaultModel?: string): string {
  return typeof request.providerOptions?.model === 'string'
    ? (request.providerOptions.model as string)
    : (defaultModel ?? 'gpt-image-2');
}

/**
 * canonical `quality`（4 档）→ wire `quality` 的唯一映射收口点。
 *
 * 当前支持的模型（gpt-image 系列）原生接受 `auto/low/medium/high`，故为 identity。
 * 将来接入「不认这 4 档」的模型（如需 dall-e-3 的 standard/hd）时，
 * **只在此按 `model` 加分支**，不要回到 applyOutputToBody 里硬塞 if。
 */
function mapQuality(
  model: string,
  quality: NonNullable<ProviderOutputOptions['quality']>,
): NonNullable<OpenAIImageGenerationBody['quality']> {
  return model === 'dall-e-3' && quality === 'high' ? 'high' : quality;
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

  throw new BuildRequestError('Image endpoint edit input asset requires fileId, url, or base64 data.');
}

/**
 * 将 Asset 映射为 mask 引用对象，并校验 `image_url` 与 `file_id` exactly-one。
 */
function assetToMaskRef(asset: Asset): OpenAIImageMaskReference {
  const ref = assetToImageRef(asset);
  const hasFileId = typeof ref.file_id === 'string' && ref.file_id.length > 0;
  const hasImageUrl = typeof ref.image_url === 'string' && ref.image_url.length > 0;
  if (hasFileId === hasImageUrl) {
    throw new BuildRequestError('Image endpoint edit mask MUST provide exactly one of `file_id` or `image_url`.', {
      fileId: ref.file_id,
      imageUrl: ref.image_url,
    });
  }
  return ref;
}

function stripDataUrlPrefix(data: string): string {
  const marker = ';base64,';
  const index = data.indexOf(marker);
  return index >= 0 ? data.slice(index + marker.length) : data;
}

function decodeBase64(data: string): Uint8Array {
  const normalized = stripDataUrlPrefix(data);
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function assetToBlob(asset: Asset): Blob {
  const mimeType = asset.mimeType ?? 'image/png';
  if (typeof asset.data === 'string' && asset.data.length > 0) {
    return new Blob([decodeBase64(asset.data)], { type: mimeType });
  }
  if (asset.data instanceof Uint8Array && asset.data.byteLength > 0) {
    return new Blob([asset.data], { type: mimeType });
  }
  throw new BuildRequestError('Image endpoint multipart edit requires inline image data.');
}

function appendMultipartField(form: FormData, key: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  form.append(key, String(value));
}

function appendMultipartImage(form: FormData, key: string, asset: Asset, index: number): void {
  if (typeof asset.data === 'string' || asset.data instanceof Uint8Array) {
    const filename = asset.name ?? `image-${index + 1}.png`;
    form.append(key, assetToBlob(asset), filename);
    return;
  }
  throw new BuildRequestError('Image endpoint multipart edit input asset requires inline data.', {
    fileId: asset.fileId,
    url: asset.url,
  });
}

function appendMultipartBodyFields(form: FormData, body: OpenAIImageEditBody): void {
  const skippedKeys = new Set(['images', 'mask']);
  for (const [key, value] of Object.entries(body)) {
    if (!skippedKeys.has(key)) {
      appendMultipartField(form, key, value);
    }
  }
}

function imageFieldNameForCodec(codec: Extract<ImageEditCodec, 'multipart-bracket' | 'multipart-plain'>): 'image[]' | 'image' {
  return codec === 'multipart-plain' ? 'image' : 'image[]';
}

/** 将 `request.output` 的 surface 字段映射到 HTTP body。 */
function applyOutputToBody(
  body: Record<string, unknown>,
  output: ProviderOutputOptions | undefined,
  options: {
    readonly includeInputFidelity: boolean;
    readonly operation: CanonicalImageJobRequest['operation'];
    readonly providerId: ImageCatalogProviderId;
  },
): void {
  if (output === undefined) {
    return;
  }

  if (output.count !== undefined) {
    body.n = output.count;
  }

  if (output.sizePreset !== undefined) {
    const resolvedOutput = resolveImageModelOutput({
      providerId: options.providerId,
      modelId: String(body.model ?? ''),
      operation: options.operation,
      output,
    });

    if (resolvedOutput.wireSize !== undefined) {
      body.size = resolvedOutput.wireSize;
    }
  } else {
    const semanticSize = concreteSizeFromOutput(output, { operation: options.operation });
    if (semanticSize !== undefined) {
      body.size = semanticSize;
    }
  }

  if (output.background !== undefined) {
    body.background = output.background;
  }

  if (output.quality !== undefined) {
    body.quality = mapQuality(String(body.model ?? ''), output.quality);
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
 * 构造 image endpoint images/generations HTTP request body。
 *
 * @param request 已校验的 canonical request
 * @param defaultModel provider config 中的默认 model
 */
export function buildRequestBody(request: CanonicalImageJobRequest, defaultModel?: string): OpenAIImageGenerationBody {
  const body: OpenAIImageGenerationBody = {
    model: resolveModel(request, defaultModel),
    prompt: request.prompt,
  };

  applyOutputToBody(body, request.output, {
    includeInputFidelity: false,
    operation: request.operation,
    providerId: 'image-endpoint',
  });

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
 * 构造 image endpoint images/edits HTTP request body。
 *
 * @param request 已校验的 canonical request
 * @param defaultModel provider config 中的默认 model
 */
export function buildEditRequestBody(request: CanonicalImageJobRequest, defaultModel?: string): OpenAIImageEditBody {
  if (request.images === undefined || request.images.length === 0) {
    throw new BuildRequestError('Image endpoint edit request requires at least one input image.');
  }

  const images = request.images.map((asset) => assetToImageRef(asset));

  const body: OpenAIImageEditBody = {
    model: resolveModel(request, defaultModel),
    prompt: request.prompt,
    images,
  };

  if (request.maskImage !== undefined) {
    body.mask = assetToMaskRef(request.maskImage);
  }

  applyOutputToBody(body, request.output, {
    includeInputFidelity: true,
    operation: request.operation,
    providerId: 'image-endpoint',
  });

  applyProviderOptions(body, request.providerOptions, ['image_response_format']);

  return body;
}

/**
 * 构造 image endpoint images/edits multipart 请求体。
 *
 * 真实 `/v1/images/edits` 端点要求 `multipart/form-data`。当前 transport 只提交
 * inline image data；外部 URL 与 fileId 引用仍由 JSON body builder 保留为请求语义映射，
 * 但不会伪装成 multipart 文件上传。
 */
export function buildEditMultipartBody(
  request: CanonicalImageJobRequest,
  defaultModel?: string,
): FormData {
  return buildEditMultipartBodyForCodec(request, 'multipart-bracket', defaultModel);
}

/**
 * 按显式 multipart codec 构造 image endpoint images/edits multipart 请求体。
 */
export function buildEditMultipartBodyForCodec(
  request: CanonicalImageJobRequest,
  codec: Extract<ImageEditCodec, 'multipart-bracket' | 'multipart-plain'>,
  defaultModel?: string,
): FormData {
  if (request.images === undefined || request.images.length === 0) {
    throw new BuildRequestError('Image endpoint edit request requires at least one input image.');
  }

  const body: OpenAIImageEditBody = {
    model: resolveModel(request, defaultModel),
    prompt: request.prompt,
    images: [],
  };

  if (request.maskImage !== undefined) {
    const hasInlineMaskData =
      typeof request.maskImage.data === 'string' ||
      (request.maskImage.data instanceof Uint8Array && request.maskImage.data.byteLength > 0);
    if (!hasInlineMaskData) {
      body.mask = assetToMaskRef(request.maskImage);
    }
  }

  applyOutputToBody(body, request.output, {
    includeInputFidelity: true,
    operation: request.operation,
    providerId: 'image-endpoint',
  });

  applyProviderOptions(body, request.providerOptions, ['image_response_format']);
  const form = new FormData();

  appendMultipartBodyFields(form, body);
  const imageFieldName = imageFieldNameForCodec(codec);

  request.images.forEach((asset, index) => appendMultipartImage(form, imageFieldName, asset, index));

  if (request.maskImage !== undefined) {
    appendMultipartImage(form, 'mask', request.maskImage, 0);
  }

  return form;
}

/**
 * 按显式 codec 构造 image endpoint images/edits 请求体。
 */
export function buildImageEditRequestBody(
  request: CanonicalImageJobRequest,
  codec: ImageEditCodec,
  defaultModel?: string,
): OpenAIImageEditBody | FormData {
  if (codec === 'json-reference') {
    return buildEditRequestBody(request, defaultModel);
  }
  return buildEditMultipartBodyForCodec(request, codec, defaultModel);
}
