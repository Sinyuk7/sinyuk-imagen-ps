import type { Asset } from '@imagen-ps/core-engine';
import type { Provider, ProviderAsyncLifecycle, ProviderInvokeArgs } from '../../contract/provider.js';
import type { ProviderInvokeResult } from '../../contract/result.js';
import { getPrimaryProviderEndpoint } from '../../contract/config.js';
import { assembleApiUrl } from '../../contract/api-format.js';
import { resolveProviderResolvedOutput } from '../../contract/image-model-capability.js';
import type { CanonicalImageJobRequest } from '../../contract/request.js';
import { httpRequest } from '../../shared/transport/http.js';
import { executeBillingProtocolChain } from '../../transport/billing/protocol-registry.js';
import { mockRequestSchema } from '../mock/request-schema.js';
import { grsaiGenerateConfigSchema, type GrsaiGenerateProviderConfig } from './config-schema.js';
import { grsaiGenerateDescriptor } from './descriptor.js';

const NO_RETRY = { maxRetries: 0, baseDelayMs: 0, factor: 1 };

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function imageReference(asset: Asset): string {
  if (typeof asset.data === 'string' && asset.data.length > 0) {
    return asset.data.startsWith('data:') ? asset.data : `data:${asset.mimeType ?? 'image/png'};base64,${asset.data}`;
  }
  if (asset.data instanceof Uint8Array && asset.data.byteLength > 0) {
    return `data:${asset.mimeType ?? 'image/png'};base64,${bytesToBase64(asset.data)}`;
  }
  const value = typeof asset.url === 'string' && asset.url.length > 0
    ? asset.url
    : asset.storedRef?.kind === 'url' || asset.storedRef?.kind === 'externalToken'
      ? asset.storedRef.ref
      : undefined;
  if (!value) throw new Error('GRSAI images require HTTP(S) URLs or materialized base64 data.');
  const url = new URL(value);
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
    throw new Error('GRSAI images require safe HTTP(S) URLs.');
  }
  return url.toString();
}

function taskId(data: unknown): string {
  const record = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
  const nested = typeof record.data === 'object' && record.data !== null ? record.data as Record<string, unknown> : {};
  const id = record.id ?? record.taskId ?? nested.id ?? nested.taskId;
  if (typeof id !== 'string' || id.trim().length === 0) throw new Error('GRSAI submit response is missing task id.');
  return id.trim();
}

function safeResultAssets(data: unknown): readonly Asset[] {
  const record = typeof data === 'object' && data !== null ? data as Record<string, unknown> : {};
  const results = Array.isArray(record.results) ? record.results : [];
  return results.flatMap((entry, index) => {
    const url = typeof entry === 'object' && entry !== null ? (entry as { url?: unknown }).url : undefined;
    if (typeof url !== 'string') return [];
    try {
      const parsed = new URL(url);
      return (parsed.protocol === 'http:' || parsed.protocol === 'https:') && !parsed.username && !parsed.password
        ? [{ type: 'image' as const, name: `grsai-${index + 1}`, url: parsed.toString() }]
        : [];
    } catch { return []; }
  });
}

function requestBody(request: CanonicalImageJobRequest) {
  const modelId = request.modelId?.trim();
  if (!modelId) throw new Error('GRSAI modelId is required.');
  const prompt = request.prompt.trim();
  if (!prompt) throw new Error('GRSAI prompt must not be empty.');
  const output = resolveProviderResolvedOutput({
    providerId: 'grsai-generate', capabilityModelId: modelId,
    operation: request.operation, output: request.output, inputContext: request.inputContext,
  });
  if (output.kind !== 'grsai-generate') throw new Error('GRSAI output strategy mismatch.');
  return {
    model: modelId,
    prompt,
    ...(request.images?.length ? { images: request.images.map(imageReference) } : {}),
    ...(output.aspectRatio ? { aspectRatio: output.aspectRatio } : {}),
    ...(output.imageSize ? { imageSize: output.imageSize } : {}),
    replyType: 'async' as const,
  };
}

export function createGrsaiGenerateProvider(): Provider<GrsaiGenerateProviderConfig, CanonicalImageJobRequest> {
  const configsByRemoteRef = new Map<string, GrsaiGenerateProviderConfig>();
  const asyncLifecycle: ProviderAsyncLifecycle<GrsaiGenerateProviderConfig, CanonicalImageJobRequest> = {
    async submit(args) {
      const endpoint = getPrimaryProviderEndpoint(args.config.connection);
      const response = await httpRequest({
        url: assembleApiUrl(endpoint.url, args.config.paths.submit), method: 'POST', timeoutMs: args.config.timeoutMs,
        headers: { Authorization: `Bearer ${args.config.apiKey}`, 'Content-Type': 'application/json', ...args.config.extraHeaders }, body: requestBody(args.request),
      }, NO_RETRY, args.signal, args.logger);
      const remoteRef = taskId(response.response.data);
      configsByRemoteRef.set(remoteRef, args.config);
      return { status: 'pending', remoteRef };
    },
    async poll(args) {
      const config = configsByRemoteRef.get(args.remoteRef);
      if (!config) return { status: 'failed', error: new Error('GRSAI remote task reference is unknown.') };
      const endpoint = getPrimaryProviderEndpoint(config.connection);
      const url = new URL(assembleApiUrl(endpoint.url, config.paths.result));
      url.searchParams.set('id', args.remoteRef);
      const response = await httpRequest({ url: url.toString(), method: 'GET', timeoutMs: config.timeoutMs, headers: { Authorization: `Bearer ${config.apiKey}`, ...config.extraHeaders } }, NO_RETRY, args.signal, args.logger);
      const record = typeof response.response.data === 'object' && response.response.data !== null ? response.response.data as { status?: unknown } : {};
      if (record.status === 'running') return { status: 'pending' };
      if (record.status === 'violation' || record.status === 'failed') {
        configsByRemoteRef.delete(args.remoteRef);
        return { status: 'failed', error: new Error(`GRSAI task ${record.status}.`) };
      }
      if (record.status === 'succeeded') {
        const assets = safeResultAssets(response.response.data);
        configsByRemoteRef.delete(args.remoteRef);
        return assets.length ? { status: 'completed', result: { assets } } : { status: 'failed', error: new Error('GRSAI succeeded response has no safe result URL.') };
      }
      configsByRemoteRef.delete(args.remoteRef);
      return { status: 'failed', error: new Error('GRSAI result response has unknown status.') };
    },
  };
  return {
    id: 'grsai-generate', family: 'grsai-generate', describe: () => grsaiGenerateDescriptor,
    validateConfig(input) { return grsaiGenerateConfigSchema.parse(input); },
    validateRequest(input) { return mockRequestSchema.parse(input); },
    async invoke(_args: ProviderInvokeArgs<GrsaiGenerateProviderConfig, CanonicalImageJobRequest>): Promise<ProviderInvokeResult> {
      throw new Error('GRSAI Generate uses async lifecycle.');
    },
    async queryBalance(config: GrsaiGenerateProviderConfig, input) {
      const endpoint = getPrimaryProviderEndpoint(config.connection);
      const billing = config.billing;
      // Token source wins; no token source means API key query.
      if (billing?.source === 'billing-token') {
        const token = billing.tokenSecretRef.trim();
        if (!token) throw new Error('GRSAI billing token is missing.');
        return executeBillingProtocolChain({
          endpointUrl: endpoint.url,
          billing: { source: 'billing-token', path: '/client/openapi/getCredits', tokenSecretRef: token },
          protocolIds: ['credits-token-json-v1'],
          ...(input.signal ? { signal: input.signal } : {}),
        });
      }
      const apiKey = config.apiKey.trim();
      if (!apiKey) throw new Error('GRSAI API key is required for balance query.');
      return executeBillingProtocolChain({
        endpointUrl: endpoint.url,
        billing: { source: 'profile-api-key', path: '/client/openapi/getAPIKeyCredits' },
        protocolIds: ['credits-api-key-json-v1'],
        apiKey,
        ...(input.signal ? { signal: input.signal } : {}),
      });
    },
    asyncLifecycle,
  };
}
