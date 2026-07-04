import {
  listProviders,
  saveProviderProfile,
  setAssetStore,
  setJobHistoryStore,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setTaskStore,
  submitJob,
  type ProviderDescriptor,
} from '@imagen-ps/application';
import { createChromeHostPort, type ChromeFilePicker } from '../../adapters/chrome/chrome-host-port';
import { createChromeIndexedDbStorage, type ChromeKeyValueBackend } from '../../adapters/chrome/indexed-db-storage';
import { createPhotoshopSimulator } from '../../simulators/photoshop/simulator';

export interface ChromeProviderCapabilityRow {
  readonly family: string;
  readonly bundleSupport: 'supported' | 'blocked' | 'unknown';
  readonly corsExpectation: string;
  readonly authHeaderBehavior: string;
  readonly streamingSupport: 'not-used' | 'unsupported' | 'unknown';
  readonly imageInputSupport: string;
  readonly directBrowserSupport: 'supported' | 'mock-only' | 'conditional' | 'blocked';
  readonly notes: string;
}

export interface ChromeFeasibilityResult {
  readonly runtime: 'chrome';
  readonly providerCount: number;
  readonly providerIds: readonly string[];
  readonly profileDispatchProfileId: string;
  readonly generatedAssetCount: number;
  readonly simulatorLayerCount: number;
  readonly capabilityMatrix: readonly ChromeProviderCapabilityRow[];
}

export const CHROME_PROVIDER_CAPABILITY_MATRIX: readonly ChromeProviderCapabilityRow[] = [
  {
    family: 'mock',
    bundleSupport: 'supported',
    corsExpectation: 'none; no network transport is used by the built-in mock provider',
    authHeaderBehavior: 'uses an in-memory secret through application commands for contract parity only',
    streamingSupport: 'not-used',
    imageInputSupport: 'text_to_image and image_edit are supported with synthetic assets',
    directBrowserSupport: 'supported',
    notes: 'Default Chrome feasibility and CI path uses this mock implementation.',
  },
  {
    family: 'image-endpoint',
    bundleSupport: 'supported',
    corsExpectation: 'requires provider endpoint CORS approval for browser origins',
    authHeaderBehavior: 'Authorization-like headers are possible but expose user credentials to the browser runtime',
    streamingSupport: 'not-used',
    imageInputSupport: 'generation JSON body and edit multipart Blob body are browser-buildable',
    directBrowserSupport: 'conditional',
    notes: 'Default tests must intercept fetch or use mock profiles; live browser calls are opt-in only.',
  },
  {
    family: 'chat-image',
    bundleSupport: 'supported',
    corsExpectation: 'requires provider endpoint CORS approval for browser origins',
    authHeaderBehavior: 'Authorization-like headers are possible but expose user credentials to the browser runtime',
    streamingSupport: 'not-used',
    imageInputSupport: 'URL and base64 image inputs are browser-buildable; fileId depends on provider-side upload policy',
    directBrowserSupport: 'conditional',
    notes: 'Default tests must intercept fetch or use mock profiles; live browser calls are opt-in only.',
  },
];

function providerIds(providers: readonly ProviderDescriptor[]): readonly string[] {
  return providers.map((provider) => provider.id).sort();
}

const CHROME_FEASIBILITY_RESULT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
}

function createChromeFeasibilityFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(requestUrl(input));
    if (url.hostname === 'mock.local') {
      return new Response(JSON.stringify({
        data: [{ b64_json: CHROME_FEASIBILITY_RESULT_PNG_BASE64 }],
      }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return originalFetch(input, init);
  };
}

/**
 * 最小 Chrome composition：装配 browser-safe app adapters 并执行 profile dispatch
 * smoke，用于冻结浏览器可行性判断。
 */
export async function runChromeFeasibilityRuntime(options?: {
  readonly backend?: ChromeKeyValueBackend;
  readonly filePicker?: ChromeFilePicker;
}): Promise<ChromeFeasibilityResult> {
  const storage = createChromeIndexedDbStorage({ backend: options?.backend });
  const simulator = createPhotoshopSimulator(storage.assets, 'seeded-document');
  const host = createChromeHostPort({
    assetStore: storage.assets,
    simulator,
    filePicker: options?.filePicker ?? { pick: async () => undefined },
  });
  setProviderProfileRepository(storage.profiles);
  setSecretStorageAdapter(storage.secrets);
  setJobHistoryStore(storage.history);
  setTaskStore(storage.tasks);
  setAssetStore(storage.assets);

  const providers = listProviders();
  const profile = await saveProviderProfile({
    profileId: 'chrome-feasibility-mock',
    apiFormat: 'openai-images',
    displayName: 'Chrome Feasibility Mock',
    enabled: true,
    config: {
      apiFormat: 'openai-images',
      displayName: 'Chrome Feasibility Mock',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
      },
      paths: { generation: '/images/generations', edit: '/images/edits' },
      defaultModel: 'gpt-image-1',
    },
    secretValues: {
      apiKey: 'mock-key',
    },
  });
  if (!profile.ok) {
    throw new Error(profile.error.message);
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = createChromeFeasibilityFetch(originalFetch);
  const job = await submitJob({
    workflow: 'provider-generate',
    input: {
      profileId: profile.value.profileId,
      prompt: 'Chrome feasibility profile dispatch smoke',
      output: { count: 1 },
    },
  }).finally(() => {
    globalThis.fetch = originalFetch;
  });
  if (!job.ok) {
    throw new Error(job.error.message);
  }
  const profileDispatchProfileId = typeof job.value.input.profileId === 'string' ? job.value.input.profileId : '';

  const image = job.value.output?.image as { assets?: readonly unknown[] } | undefined;
  return {
    runtime: 'chrome',
    providerCount: providers.length,
    providerIds: providerIds(providers),
    profileDispatchProfileId,
    generatedAssetCount: image?.assets?.length ?? 0,
    simulatorLayerCount: (await host.listLayers()).length,
    capabilityMatrix: CHROME_PROVIDER_CAPABILITY_MATRIX,
  };
}
