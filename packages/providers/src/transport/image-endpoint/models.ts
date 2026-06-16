/**
 * OpenAI `/v1/models` 端点的 wire format 类型与解析。
 *
 * 本模块仅在 transport 层内部使用，不暴露给 contract 层。
 * 所有 provider 的 `discoverModels()` 统一返回 contract 层的通用类型
 * `ProviderModelInfo`，本模块负责将 OpenAI wire format 映射到该通用类型。
 */

import type { ProviderModelInfo } from '../../contract/model.js';
import { mapInvalidResponseError } from './error-map.js';

/**
 * OpenAI `/v1/models` 响应中单条 model 的 wire format。
 *
 * @see https://platform.openai.com/docs/api-reference/models/list
 */
export interface OpenAIModelObject {
  /** 模型标识符，如 `dall-e-3`、`gpt-4`。 */
  readonly id: string;

  /** 对象类型，固定为 `"model"`。 */
  readonly object?: string;

  /** Unix 时间戳（秒）。 */
  readonly created?: number;

  /** 模型所有者。 */
  readonly owned_by?: string;
}

/**
 * OpenAI `/v1/models` 的标准响应结构。
 */
export interface OpenAIModelsResponse {
  /** 对象类型，固定为 `"list"`。 */
  readonly object: string;

  /** 模型列表。 */
  readonly data: readonly OpenAIModelObject[];
}

/**
 * 判断 model ID 是否属于 image generation 模型。
 *
 * 多关键词匹配（大小写不敏感）：
 * - `id` 以 `dall-e` 开头（OpenAI 官方）
 * - `id` 包含 `image`（社区/中转站通用）
 * - `id` 包含 `gpt-image`（中转站 GPT Image 系列）
 */
function isImageModel(id: string): boolean {
  const lower = id.toLowerCase();
  return lower.startsWith('dall-e') || lower.includes('image') || lower.includes('gpt-image');
}

/**
 * 将 model ID 转换为用户友好的展示名。
 *
 * 规则：将 `-` 和 `_` 替换为空格，每个词首字母大写。
 *
 * @example
 * formatDisplayName('dall-e-3')     // 'Dall E 3'
 * formatDisplayName('flux_image_pro') // 'Flux Image Pro'
 * formatDisplayName('dalle3')        // 'Dalle3'
 */
export function formatDisplayName(id: string): string {
  return id
    .replace(/[-_]/g, ' ')
    .split(' ')
    .map((word) => (word.length > 0 ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
    .join(' ');
}

/**
 * 解析上游 `/v1/models` 响应，过滤出 image generation 模型并映射为
 * `ProviderModelInfo[]`。
 *
 * @param raw 原始响应数据（`httpRequest` 返回的 `response.data`）
 * @returns 过滤后的 `ProviderModelInfo[]`；无匹配时返回 `[]`
 * @throws `ProviderInvokeError { kind: 'invalid_response' }` 当响应结构无效时
 */
export function parseModelsResponse(raw: unknown): ProviderModelInfo[] {
  if (typeof raw !== 'object' || raw === null) {
    throw mapInvalidResponseError('Models response is not a JSON object.', { raw });
  }

  const response = raw as Partial<OpenAIModelsResponse>;

  if (response.object !== 'list') {
    throw mapInvalidResponseError('Models response missing or invalid "object" field.', { raw });
  }

  if (!Array.isArray(response.data)) {
    throw mapInvalidResponseError('Models response "data" is not an array.', { raw });
  }

  const models: ProviderModelInfo[] = [];

  for (const item of response.data) {
    // 跳过非 object 的 data 项
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const model = item as Partial<OpenAIModelObject>;

    // 跳过缺少 `id` 字段的项
    if (typeof model.id !== 'string' || model.id.length === 0) {
      continue;
    }

    // 过滤非 image generation 模型
    if (!isImageModel(model.id)) {
      continue;
    }

    models.push({
      id: model.id,
      displayName: formatDisplayName(model.id),
    });
  }

  return models;
}
