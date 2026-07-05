/**
 * OpenAI `/v1/models` 端点的 wire format 类型与解析。
 *
 * 本模块仅在 transport 层内部使用，不暴露给 contract 层。
 * 本模块只解析远端返回的 model ID 事实，不与本地 catalog 做交集过滤。
 */

import type { DiscoveredModel } from '../../contract/model.js';
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

export interface ParsedImageModelsResponse {
  /** `/v1/models` 原始响应里的全部字符串 model id。 */
  readonly rawIds: readonly string[];
  /** 去重后返回给上层的远端 model facts。 */
  readonly models: readonly DiscoveredModel[];
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

function parseImageModelsPayload(raw: unknown): ParsedImageModelsResponse {
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

  const rawIds: string[] = [];
  const models: DiscoveredModel[] = [];
  const seen = new Set<string>();

  for (const item of response.data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }

    const model = item as Partial<OpenAIModelObject>;
    if (typeof model.id !== 'string' || model.id.length === 0) {
      continue;
    }

    rawIds.push(model.id);
    const normalizedId = model.id.trim();
    if (normalizedId.length === 0 || seen.has(normalizedId)) {
      continue;
    }
    seen.add(normalizedId);
    models.push({ id: normalizedId });
  }

  return {
    rawIds,
    models,
  };
}

export function inspectModelsResponse(raw: unknown): ParsedImageModelsResponse {
  return parseImageModelsPayload(raw);
}

/**
 * 解析上游 `/v1/models` 响应并返回远端 model facts。
 *
 * @param raw 原始响应数据（`httpRequest` 返回的 `response.data`）
 * @returns 去重后的 `DiscoveredModel[]`；无匹配时返回 `[]`
 * @throws `ProviderInvokeError { kind: 'invalid_response' }` 当响应结构无效时
 */
export function parseModelsResponse(raw: unknown): readonly DiscoveredModel[] {
  return parseImageModelsPayload(raw).models;
}
