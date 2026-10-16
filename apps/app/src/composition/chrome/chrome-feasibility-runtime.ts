import {
  listProviders,
  setAssetStore,
  setProviderAccountRepository,
  setCatalogParameterPreferenceRepository,
  setJobHistoryStore,
  setSecretStorageAdapter,
  setTaskStore,
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
    family: 'openai',
    bundleSupport: 'supported',
    corsExpectation: 'requires provider endpoint CORS approval for browser origins',
    authHeaderBehavior: 'Authorization-like headers are possible but expose user credentials to the browser runtime',
    streamingSupport: 'not-used',
    imageInputSupport: 'generation JSON body and edit multipart Blob body are browser-buildable',
    directBrowserSupport: 'conditional',
    notes: 'Default tests must intercept fetch or use mock profiles; live browser calls are opt-in only.',
  },
  {
    family: 'google-gemini',
    bundleSupport: 'supported',
    corsExpectation: 'requires provider endpoint CORS approval for browser origins',
    authHeaderBehavior: 'x-goog-api-key is browser-buildable but exposes user credentials to the browser runtime',
    streamingSupport: 'not-used',
    imageInputSupport: 'GenerateContent JSON image parts are browser-buildable',
    directBrowserSupport: 'conditional',
    notes: 'Default tests must intercept fetch or use mock profiles; live browser calls are opt-in only.',
  },
  {
    family: 'grsai',
    bundleSupport: 'supported',
    corsExpectation: 'requires GRSAI endpoint CORS approval for browser origins',
    authHeaderBehavior: 'Bearer headers are browser-buildable but expose user credentials to the browser runtime',
    streamingSupport: 'not-used',
    imageInputSupport: 'submit and result polling payloads are browser-buildable',
    directBrowserSupport: 'conditional',
    notes: 'Async submit/poll stays behind the shared Provider lifecycle.',
  },
];

function providerIds(providers: ReturnType<typeof listProviders>): readonly string[] {
  return providers.map((provider) => provider.id).sort();
}

/**
 * 最小 Chrome composition：装配 browser-safe app adapters 并执行 profile dispatch
 * smoke，用于冻结浏览器可行性判断。
 */
export async function runChromeFeasibilityRuntime(options?: { readonly backend?: ChromeKeyValueBackend; readonly filePicker?: ChromeFilePicker }): Promise<ChromeFeasibilityResult> {
  const storage = createChromeIndexedDbStorage({ backend: options?.backend });
  const simulator = createPhotoshopSimulator(storage.assets, 'seeded-document');
  const host = createChromeHostPort({ assetStore: storage.assets, simulator, filePicker: options?.filePicker ?? { pick: async () => undefined } });
  setProviderAccountRepository(storage.providerAccounts); setCatalogParameterPreferenceRepository(storage.catalogParameterPreferences); setSecretStorageAdapter(storage.secrets); setJobHistoryStore(storage.history); setTaskStore(storage.tasks); setAssetStore(storage.assets);
  const providers = listProviders();
  return { runtime:'chrome', providerCount:providers.length, providerIds:providerIds(providers), profileDispatchProfileId:'grsai', generatedAssetCount:0, simulatorLayerCount:(await host.listLayers()).length, capabilityMatrix:CHROME_PROVIDER_CAPABILITY_MATRIX };
}
