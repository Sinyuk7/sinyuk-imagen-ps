import type { Asset } from '@imagen-ps/core-engine';
import type { Provider, ProviderAsyncLifecycle, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import type { CanonicalImageJobRequest } from '../../contract/request.js';
import { httpRequest } from '../../shared/transport/http.js';
import { mockRequestSchema } from '../mock/request-schema.js';
import { prepareRunningHubRequest } from '../../fixed-provider-adapters.js';
import { getPrimaryProviderEndpoint } from '../../contract/config.js';
import { runningHubGenerateConfigSchema, type RunningHubGenerateProviderConfig } from './config-schema.js';
import { runningHubGenerateDescriptor } from './descriptor.js';
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
async function downloadAsset(config: RunningHubGenerateProviderConfig, url: string, signal: AbortSignal | undefined, logger: ProviderInvokeArgs<RunningHubGenerateProviderConfig, CanonicalImageJobRequest>['logger'], index: number): Promise<Asset> {
  const response = await httpRequest({ url, method: 'GET', timeoutMs: config.timeoutMs, headers: { Authorization: `Bearer ${config.apiKey}`, ...config.extraHeaders }, responseType: 'bytes' }, NO_RETRY, signal, logger);
  const bytes = response.response.data;
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new Error('RunningHub result download returned no bytes.');
  return { type: 'image', name: `runninghub-${index + 1}`, data: bytes, mimeType: response.response.headers.get('content-type') ?? 'image/png' };
}
async function uploadImage(config: RunningHubGenerateProviderConfig, asset: Asset, signal: AbortSignal | undefined, logger: ProviderInvokeArgs<RunningHubGenerateProviderConfig, CanonicalImageJobRequest>['logger']): Promise<string> {
  const bytes = typeof asset.data === 'string' ? Uint8Array.from(atob(asset.data.replace(/^data:[^;]+;base64,/u, '')), (c) => c.charCodeAt(0)) : asset.data instanceof Uint8Array ? asset.data : undefined;
  if (!bytes) { if (asset.url) return asset.url; throw new Error('RunningHub image upload requires materialized image bytes or URL.'); }
  const form = new FormData(); form.append('file', new Blob([bytes], { type: asset.mimeType ?? 'image/png' }), asset.name ?? 'reference.png');
  const response = await httpRequest({ url: new URL('/openapi/v2/media/upload/binary', getPrimaryProviderEndpoint(config.connection).url).toString(), method: 'POST', timeoutMs: config.timeoutMs, headers: { Authorization: `Bearer ${config.apiKey}`, ...config.extraHeaders }, body: form }, NO_RETRY, signal, logger);
  const record = typeof response.response.data === 'object' && response.response.data !== null ? response.response.data as Record<string, unknown> : {};
  const nested = typeof record.data === 'object' && record.data !== null ? record.data as Record<string, unknown> : {};
  if (record.code !== 0 || typeof nested.download_url !== 'string' || !nested.download_url) throw new Error(String(record.errorMessage ?? record.message ?? 'RunningHub image upload failed.'));
  return nested.download_url;
}
export function createRunningHubGenerateProvider(): Provider<RunningHubGenerateProviderConfig, CanonicalImageJobRequest> {
  const configs = new Map<string, RunningHubGenerateProviderConfig>();
  const asyncLifecycle: ProviderAsyncLifecycle<RunningHubGenerateProviderConfig, CanonicalImageJobRequest> = {
    async submit({ config, request, signal, logger }) { const uploaded = request.images?.length ? await Promise.all(request.images.map((asset) => uploadImage(config, asset, signal, logger))) : []; const uploadedMask = request.maskImage ? await uploadImage(config, request.maskImage.asset, signal, logger) : undefined; const modelId = request.modelId?.trim(); if (!modelId) throw new Error('RunningHub modelId is required.'); const prepared = prepareRunningHubRequest({ providerId: 'runninghub', modelId, operation: request.operation, prompt: request.prompt, images: request.images, ...(request.maskImage ? { maskImage: { ...request.maskImage, asset: { type: 'image', url: uploadedMask } as Asset } } : {}), parameters: request.parameters ?? {} }); const body = { ...prepared.body, ...(uploaded.length ? { imageUrls: uploaded } : {}), ...(uploadedMask ? { maskUrl: uploadedMask } : {}) }; const response = await httpRequest({ url: new URL(prepared.urlPath, getPrimaryProviderEndpoint(config.connection).url).toString(), method: 'POST', timeoutMs: config.timeoutMs, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', ...config.extraHeaders }, body }, NO_RETRY, signal, logger); const id = taskId(response.response.data); configs.set(id, config); return { status: 'pending', remoteRef: id }; },
    async poll({ remoteRef, signal, logger }) { const config = configs.get(remoteRef); if (!config) return { status: 'failed', error: new Error('RunningHub remote task reference is unknown.') }; const response = await httpRequest({ url: new URL('/openapi/v2/query', getPrimaryProviderEndpoint(config.connection).url).toString(), method: 'POST', timeoutMs: config.timeoutMs, headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', ...config.extraHeaders }, body: { taskId: remoteRef } }, NO_RETRY, signal, logger); const record = typeof response.response.data === 'object' && response.response.data !== null ? response.response.data as Record<string, unknown> : {}; const state = String(record.status ?? '').toUpperCase(); if (state === 'SUCCESS' || state === 'SUCCEEDED') { const urls = assets(record).map((asset) => asset.url).filter((url): url is string => Boolean(url)); configs.delete(remoteRef); try { const materialized = await Promise.all(urls.map((url, index) => downloadAsset(config, url, signal, logger, index))); return materialized.length ? { status: 'completed', result: { assets: materialized } } : { status: 'failed', error: new Error('RunningHub completed response has no image URL.') }; } catch (error) { return { status: 'failed', error: error instanceof Error ? error : new Error(String(error)) }; } } if (state === 'FAILED' || state === 'CANCEL') { configs.delete(remoteRef); return { status: 'failed', error: new Error(String(record.errorMessage ?? record.failedReason ?? `RunningHub task ${state}.`)) }; } return { status: 'pending' }; },
  };
  return { id: 'runninghub-generate', family: 'image-endpoint', describe: () => runningHubGenerateDescriptor, validateConfig: (input) => runningHubGenerateConfigSchema.parse(input), validateRequest: (input) => mockRequestSchema.parse(input), async invoke(_args: ProviderInvokeArgs<RunningHubGenerateProviderConfig, CanonicalImageJobRequest>): Promise<ProviderInvokeResult> { throw new Error('RunningHub uses async lifecycle.'); }, asyncLifecycle };
}
