/**
 * classifyEndpoint 命令
 *
 * UI 通过 application 命令层获取 endpoint/path 的 API format 判断结果。
 */
import { classifyEndpoint as classifyProviderEndpoint } from '@imagen-ps/providers';
import type { EndpointClassification } from './types.js';

/** 将 full endpoint URL 或 path 分类成受支持的 API format。 */
export function classifyEndpoint(input: string): EndpointClassification {
  return classifyProviderEndpoint(input);
}
