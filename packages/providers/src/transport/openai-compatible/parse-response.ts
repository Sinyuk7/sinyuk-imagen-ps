/**
 * 解析 OpenAI-compatible images/generations 响应，归一化为结构化
 * `ParsedImagesResponse` 对象（`assets` + 可选 `created` / `usage` / `metadata`）。
 *
 * 字段映射以 `docs/openapi/` 中 `Create image` / `Create image edit` 两份文档
 * 的 `ImagesResponse` 为准：
 *
 * - `data[].url` / `data[].b64_json` → `assets[].url` / `assets[].data`
 * - 顶层 `output_format` → `assets[].mimeType` 与文件名后缀的唯一来源
 * - `usage.*` snake_case → `ProviderInvokeUsage` camelCase
 * - `background` / `output_format` / `quality` / `size` → `ProviderInvokeMetadata`
 * - `created` → 直接透传
 *
 * 上游未提供的字段 MUST 省略（不写 `undefined`），以与
 * `ProviderInvokeResult` 的缺省字段约定一致。
 */

import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderInvokeMetadata, ProviderInvokeUsage } from '../../contract/result.js';
import { mapInvalidResponseError } from './error-map.js';

/**
 * OpenAI API 返回的单条 image 数据。
 */
interface OpenAIImageData {
  /** 图片 URL。 */
  url?: string;

  /** Base64 编码的图片数据。 */
  b64_json?: string;

  /** 修订后的 prompt（若存在）。 */
  revised_prompt?: string;
}

/**
 * OpenAI `ImagesResponse` 的标准响应结构。
 */
interface OpenAIImagesResponse {
  /** 创建时间戳（Unix 秒）。 */
  created?: number;

  /** 图片数据数组。 */
  data?: OpenAIImageData[];

  /** 实际采用的输出格式。 */
  output_format?: string;

  /** 实际采用的质量档位。 */
  quality?: string;

  /** 实际采用的背景模式。 */
  background?: string;

  /** 实际采用的尺寸字符串。 */
  size?: string;

  /** Token 消耗统计（snake_case）。 */
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
    input_tokens_details?: { image_tokens?: number; text_tokens?: number };
    output_tokens_details?: { image_tokens?: number; text_tokens?: number };
  };
}

/** parseResponse 的结构化返回值。 */
export interface ParsedImagesResponse {
  readonly assets: readonly Asset[];
  readonly created?: number;
  readonly usage?: ProviderInvokeUsage;
  readonly metadata?: ProviderInvokeMetadata;
}

/** 根据 `output_format` 决定 mimeType 与文件名扩展名。 */
function resolveFormat(outputFormat: string | undefined): { mimeType: string; ext: string } {
  switch (outputFormat) {
    case 'jpeg':
      return { mimeType: 'image/jpeg', ext: 'jpg' };
    case 'webp':
      return { mimeType: 'image/webp', ext: 'webp' };
    case 'png':
      return { mimeType: 'image/png', ext: 'png' };
    default:
      // 上游未声明 output_format 时回退 png（OpenAPI 文档默认值）。
      return { mimeType: 'image/png', ext: 'png' };
  }
}

/** 将 snake_case `usage` 映射为 camelCase `ProviderInvokeUsage`。 */
function parseUsage(raw: OpenAIImagesResponse['usage']): ProviderInvokeUsage | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const inputTokens = typeof raw.input_tokens === 'number' ? raw.input_tokens : undefined;
  const outputTokens = typeof raw.output_tokens === 'number' ? raw.output_tokens : undefined;
  const totalTokens = typeof raw.total_tokens === 'number' ? raw.total_tokens : undefined;

  // 任何核心字段缺失时，整体视为缺省（上游 usage 契约要求三个主字段都存在）。
  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined) {
    return undefined;
  }

  const usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    inputTokensDetails?: { imageTokens: number; textTokens: number };
    outputTokensDetails?: { imageTokens: number; textTokens: number };
  } = { inputTokens, outputTokens, totalTokens };

  const inDetails = raw.input_tokens_details;
  if (
    inDetails !== undefined &&
    inDetails !== null &&
    typeof inDetails.image_tokens === 'number' &&
    typeof inDetails.text_tokens === 'number'
  ) {
    usage.inputTokensDetails = {
      imageTokens: inDetails.image_tokens,
      textTokens: inDetails.text_tokens,
    };
  }

  const outDetails = raw.output_tokens_details;
  if (
    outDetails !== undefined &&
    outDetails !== null &&
    typeof outDetails.image_tokens === 'number' &&
    typeof outDetails.text_tokens === 'number'
  ) {
    usage.outputTokensDetails = {
      imageTokens: outDetails.image_tokens,
      textTokens: outDetails.text_tokens,
    };
  }

  return usage;
}

/** 构造 `ProviderInvokeMetadata`；所有字段缺省时返回 undefined。 */
function parseMetadata(response: OpenAIImagesResponse): ProviderInvokeMetadata | undefined {
  const metadata: {
    background?: 'transparent' | 'opaque';
    outputFormat?: 'png' | 'jpeg' | 'webp';
    quality?: 'low' | 'medium' | 'high';
    size?: string;
  } = {};

  if (response.background === 'transparent' || response.background === 'opaque') {
    metadata.background = response.background;
  }

  if (response.output_format === 'png' || response.output_format === 'jpeg' || response.output_format === 'webp') {
    metadata.outputFormat = response.output_format;
  }

  if (response.quality === 'low' || response.quality === 'medium' || response.quality === 'high') {
    metadata.quality = response.quality;
  }

  if (typeof response.size === 'string' && response.size.length > 0) {
    metadata.size = response.size;
  }

  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

/**
 * 解析上游响应 JSON 并归一化为 `ParsedImagesResponse`。
 *
 * @param raw 原始响应数据
 * @returns 归一化结构化对象；缺省字段省略。
 */
export function parseResponse(raw: unknown): ParsedImagesResponse {
  if (typeof raw !== 'object' || raw === null) {
    throw mapInvalidResponseError('Response is not a JSON object.', { raw });
  }

  const response = raw as OpenAIImagesResponse;

  if (!Array.isArray(response.data)) {
    throw mapInvalidResponseError('Response missing "data" array.', { raw });
  }

  const { mimeType, ext } = resolveFormat(response.output_format);

  const assets: Asset[] = [];

  for (let i = 0; i < response.data.length; i++) {
    const item = response.data[i];

    if (typeof item !== 'object' || item === null) {
      throw mapInvalidResponseError(`Response data[${i}] is not an object.`, { raw, index: i });
    }

    const name = `generated-${i + 1}.${ext}`;

    if (item.url) {
      assets.push({
        type: 'image',
        name,
        url: item.url,
        mimeType,
      });
    } else if (item.b64_json) {
      assets.push({
        type: 'image',
        name,
        data: item.b64_json,
        mimeType,
      });
    } else {
      throw mapInvalidResponseError(`Response data[${i}] missing both "url" and "b64_json".`, { raw, index: i });
    }
  }

  const result: {
    assets: readonly Asset[];
    created?: number;
    usage?: ProviderInvokeUsage;
    metadata?: ProviderInvokeMetadata;
  } = { assets };

  if (typeof response.created === 'number') {
    result.created = response.created;
  }

  const usage = parseUsage(response.usage);
  if (usage !== undefined) {
    result.usage = usage;
  }

  const metadata = parseMetadata(response);
  if (metadata !== undefined) {
    result.metadata = metadata;
  }

  return result;
}
