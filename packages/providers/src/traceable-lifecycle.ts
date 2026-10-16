import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderAsyncPollResult, ProviderAsyncSubmitResult } from './contract/provider.js';

/** 跨 provider 使用的远程结果 URL 事实。 */
export interface ProviderRemoteOutput {
  readonly index: number;
  readonly url: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

/** 脱离协议解析的图片下载端口。 */
export interface ProviderOutputMaterializer {
  materialize(output: ProviderRemoteOutput, signal?: AbortSignal): Promise<Asset>;
}

/** 将 provider poll 结果规范化为可持久化的 URL 记录。 */
export function normalizeProviderRemoteOutputs(result: ProviderAsyncPollResult): readonly ProviderRemoteOutput[] {
  if (result.status !== 'completed') return [];
  if (result.remoteOutputs) return result.remoteOutputs.map((output) => ({ index: output.index, url: redactSignedUrl(output.url), ...(output.metadata ? { metadata: output.metadata } : {}) }));
  return result.result.assets.map((asset, index) => {
    const url = asset.url ?? (asset.storedRef?.kind === 'url' ? asset.storedRef.ref : undefined);
    if (!url) return undefined;
    return { index, url: redactSignedUrl(url) };
  }).filter((value): value is ProviderRemoteOutput => value !== undefined);
}

/** 只移除签名 query/hash；原始 URL 仅留在 materializer 调用栈。 */
export function redactSignedUrl(value: string): string {
  try { const url = new URL(value); url.search = ''; url.hash = ''; return url.toString(); } catch { return value.split(/[?#]/, 1)[0] ?? value; }
}

/** Submit 结果必须只由调用方消费一次，禁止未知结果自动重提。 */
export function assertNoResubmitAfterUnknown(result: ProviderAsyncSubmitResult): void {
  if (result.status === 'pending' && (!result.remoteRef || result.remoteRef.trim().length === 0)) throw new Error('submission-unknown: remote task ID was not received; do not resubmit.');
}
