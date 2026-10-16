import type { Asset } from '@imagen-ps/core-engine';
import type { Provider, ProviderAsyncLifecycle, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { CanonicalImageJobRequest } from '../../contract/request.js';
import { httpRequest } from '../../shared/transport/http.js';
import { mockRequestSchema } from '../mock/request-schema.js';
import { prepareRunningHubRequest } from '../../fixed-provider-adapters.js';
import { getPrimaryProviderEndpoint } from '../../contract/config.js';
import { runningHubConfigSchema, type RunningHubProviderConfig } from './config-schema.js';
import { runningHubDescriptor } from './descriptor.js';
const NO_RETRY = { maxRetries: 0, baseDelayMs: 0, factor: 1 };
function assets(data: unknown): readonly Asset[] {
  const urls: string[] = [];
  const visit = (value: unknown): void => {
    if (typeof value === 'string' && /^https?:\/\//u.test(value)) { urls.push(value); return; }
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value === 'object' && value !== null) Object.entries(value as Record<string, unknown>).forEach(([key, child]) => {
      if (/^(url|download_url|downloadUrl|imageUrl|image_url|outputUrl|output_url)$/u.test(key)) visit(child);
      else if (key === 'output' || key === 'outputs' || key === 'results' || key === 'data' || key === 'result') visit(child);
    });
  };
  visit(data);
  return [...new Set(urls)].map((url, index) => ({ type: 'image' as const, name: `runninghub-${index + 1}`, url }));
}
function taskId(data: unknown): string { const r = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {}; const id = r.taskId ?? r.task_id ?? (typeof r.data === 'object' && r.data !== null ? (r.data as Record<string, unknown>).taskId : undefined); if (typeof id !== 'string' && typeof id !== 'number') throw new Error('RunningHub response has no task ID; do not automatically resubmit.'); return String(id); }
async function uploadImage(config: RunningHubProviderConfig, asset: Asset, signal: AbortSignal | undefined, logger: ProviderInvokeArgs<RunningHubProviderConfig, CanonicalImageJobRequest>['logger']): Promise<string> {
  const bytes = typeof asset.data === 'string' ? Uint8Array.from(atob(asset.data.replace(/^data:[^;]+;base64,/u, '')), (c) => c.charCodeAt(0)) : asset.data instanceof Uint8Array ? asset.data : undefined;
  if (!bytes) { if (asset.url) return asset.url; throw new Error('RunningHub image upload requires materialized image bytes or URL.'); }
  const form = new FormData(); form.append('file', new Blob([bytes], { type: asset.mimeType ?? 'image/png' }), asset.name ?? 'reference.png');
  const response = await httpRequest({ url: new URL('/openapi/v2/media/upload/binary', getPrimaryProviderEndpoint(config.connection).url).toString(), method: 'POST', timeoutMs: config.timeoutMs, headers: { Authorization: `Bearer ${config.apiKey}`, ...config.extraHeaders }, body: form }, NO_RETRY, signal, logger);
  const record = typeof response.response.data === 'object' && response.response.data !== null ? response.response.data as Record<string, unknown> : {};
  const nested = typeof record.data === 'object' && record.data !== null ? record.data as Record<string, unknown> : {};
  if (record.code !== 0 || typeof nested.download_url !== 'string' || !nested.download_url) throw new Error(String(record.errorMessage ?? record.message ?? 'RunningHub image upload failed.'));
  return nested.download_url;
}
export function createRunningHubProvider(): Provider<RunningHubProviderConfig, CanonicalImageJobRequest> {
  const configs = new Map<string, RunningHubProviderConfig>();
  const uploadPromises = new Map<string, Promise<string>>();
  const asyncLifecycle: ProviderAsyncLifecycle<RunningHubProviderConfig, CanonicalImageJobRequest> = {
    async submit({ config, request, signal, logger }) { const upload = (asset: Asset) => { const key = asset.storedRef?.ref ?? asset.url ?? asset.name ?? `asset:${asset.mimeType ?? 'image'}`; const existing = uploadPromises.get(key); if (existing) return existing; const promise = uploadImage(config, asset, signal, logger).finally(() => uploadPromises.delete(key)); uploadPromises.set(key, promise); return promise; }; const uploaded = request.images?.length ? await Promise.all(request.images.map(upload)) : []; const uploadedMask = request.maskImage ? await upload(request.maskImage.asset) : undefined; const modelId = request.modelId?.trim(); if (!modelId) throw new Error('RunningHub modelId is required.'); const prepared = prepareRunningHubRequest({ providerId: 'runninghub', modelId, operation: request.operation, prompt: request.prompt, images: request.images, ...(request.maskImage ? { maskImage: { ...request.maskImage, asset: { type: 'image', url: uploadedMask } as Asset } } : {}), parameters: request.parameters ?? {} }); const body = { ...prepared.body, ...(uploaded.length ? { imageUrls: uploaded } : {}), ...(uploadedMask ? { maskUrl: uploadedMask } : {}) }; const response = await httpRequest({ url: new URL(prepared.urlPath, getPrimaryProviderEndpoint(config.connection).url).toString(), method: 'POST', timeoutMs: config.timeoutMs, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', ...config.extraHeaders }, body }, NO_RETRY, signal, logger); const id = taskId(response.response.data); configs.set(id, config); return { status: 'pending', remoteRef: id }; },
    async poll({ remoteRef, signal, logger }) { const config = configs.get(remoteRef); if (!config) return { status: 'failed', error: new Error('RunningHub remote task reference is unknown.') }; const response = await httpRequest({ url: new URL('/openapi/v2/query', getPrimaryProviderEndpoint(config.connection).url).toString(), method: 'POST', timeoutMs: config.timeoutMs, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', ...config.extraHeaders }, body: { taskId: remoteRef } }, NO_RETRY, signal, logger); const record = typeof response.response.data === 'object' && response.response.data !== null ? response.response.data as Record<string, unknown> : {}; const state = String(record.status ?? '').toUpperCase(); const outputAssets = assets(record); const urls = outputAssets.map((asset) => asset.url).filter((url): url is string => Boolean(url)); const errorCode = typeof record.errorCode === 'string' || typeof record.errorCode === 'number' ? String(record.errorCode) : undefined; const failedReason = typeof record.failedReason === 'string' ? record.failedReason : undefined; logger?.debug('provider.async.poll', { provider: 'runninghub', remoteStatus: state || 'UNKNOWN', hasResults: record.results !== undefined, resultCount: outputAssets.length, outputUrlCount: urls.length, ...(errorCode ? { errorCode } : {}), ...(failedReason ? { failedReason } : {}) }); if (state === 'SUCCESS' || state === 'SUCCEEDED') { configs.delete(remoteRef); return urls.length ? { status: 'completed', result: { assets: outputAssets }, remoteStatus: state, remoteOutputs: urls.map((url, index) => ({ index, url })), diagnostics: { resultCount: outputAssets.length, outputUrlCount: urls.length } } : { status: 'failed', error: new Error('RunningHub completed response has no image URL.') }; } if (state === 'FAILED' || state === 'CANCEL' || state === 'CANCELED') { configs.delete(remoteRef); return { status: 'failed', error: new Error(String(record.errorMessage ?? record.failedReason ?? `RunningHub task ${state}.`)) }; } return { status: 'pending', remoteStatus: state || 'running', diagnostics: { resultCount: outputAssets.length, outputUrlCount: urls.length } }; },
  };
  return { id: 'runninghub', family: 'runninghub', describe: () => runningHubDescriptor, validateConfig: (input) => runningHubConfigSchema.parse(input), validateRequest: (input) => mockRequestSchema.parse(input), async invoke(_args: ProviderInvokeArgs<RunningHubProviderConfig, CanonicalImageJobRequest>): Promise<ProviderInvokeResult> { throw new Error('RunningHub uses async lifecycle.'); }, asyncLifecycle };
}
