/**
 * 付费生成请求的传输层重试配置与 idempotency key 派生。
 *
 * 把「provider 是否支持 idempotency」「付费重试数值策略」「稳定 idempotency key
 * 派生」集中表达，供 image-endpoint / chat-image provider 在调用 `httpRequest`
 * 前统一计算，避免隐式假设所有 provider 行为一致。
 *
 * 注意：idempotency key 当前从规范化 request 字段派生（`invoke` args 不携带 job
 * origin），相同 prompt 的独立请求存在 key 碰撞风险；干净的长期方案是扩展
 * `ProviderInvokeArgs` 携带 `requestId`（本 slice 不做，见 dev-memory 写回）。
 */

import type { ProviderDescriptor } from '../../contract/provider.js';
import { defaultPaidRetryPolicy, type RetryPolicy } from './retry.js';

export interface PaidRetryConfig {
  /** 付费请求的 retry 数值策略。 */
  readonly policy: RetryPolicy;
  /** Provider 是否支持可靠 idempotency key。 */
  readonly idempotencySupported: boolean;
}

/**
 * 从 provider descriptor 解析付费请求的传输层重试配置。
 *
 * 未声明 `transport` 时返回保守默认：`defaultPaidRetryPolicy` + 不支持 idempotency。
 */
export function resolvePaidRetryConfig(descriptor: ProviderDescriptor): PaidRetryConfig {
  const transport = descriptor.transport;
  return {
    policy: transport?.retryPolicy ?? defaultPaidRetryPolicy,
    idempotencySupported: transport?.idempotency === 'supported',
  };
}

/**
 * 从规范化 request 字段派生稳定的 idempotency key。
 *
 * 相同逻辑请求（同 operation / prompt / images 数量 / providerOptions）派生出相同 key，
 * 使得 transport 自动重试时服务端可去重。不同请求派生出不同 key。
 *
 * 实现使用 djb2 哈希输出十六进制字符串，保证 header 安全且定长。
 */
export function buildIdempotencyKey(request: Record<string, unknown>): string {
  const operation = typeof request.operation === 'string' ? request.operation : '';
  const prompt = typeof request.prompt === 'string' ? request.prompt : '';
  const imageCount = Array.isArray(request.images) ? request.images.length : 0;
  const providerOptions = request.providerOptions ?? {};
  const payload = JSON.stringify({ operation, prompt, imageCount, providerOptions });

  let hash = 5381;
  for (let index = 0; index < payload.length; index++) {
    hash = ((hash << 5) + hash + payload.charCodeAt(index)) >>> 0;
  }
  return `imagen-${hash.toString(16)}`;
}

/**
 * 当 provider 支持 idempotency 时，计算应附加到请求 headers 的 `Idempotency-Key`；
 * 否则返回 `undefined`（不附加 header，且 transport 不会对模糊失败自动重试）。
 */
export function resolveIdempotencyHeader(
  config: PaidRetryConfig,
  request: Record<string, unknown>,
): { readonly 'Idempotency-Key': string } | undefined {
  if (!config.idempotencySupported) {
    return undefined;
  }
  return { 'Idempotency-Key': buildIdempotencyKey(request) };
}
