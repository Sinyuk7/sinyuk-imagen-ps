import {
  createImagenSession,
  getJob,
  listProviders,
  saveProviderSurfaceProfile,
  setAssetStore,
  setProviderAccountRepository,
  setJobHistoryStore,
  setProviderProfileRepository,
  setSecretStorageAdapter,
  setTaskStore,
  setUserModelConfigRepository,
  TASK_RECORD_SCHEMA_VERSION,
  type Job,
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
    family: 'gemini-generate-content',
    bundleSupport: 'supported',
    corsExpectation: 'requires provider endpoint CORS approval for browser origins',
    authHeaderBehavior: 'x-goog-api-key is browser-buildable but exposes user credentials to the browser runtime',
    streamingSupport: 'not-used',
    imageInputSupport: 'GenerateContent JSON image parts are browser-buildable',
    directBrowserSupport: 'conditional',
    notes: 'Default tests must intercept fetch or use mock profiles; live browser calls are opt-in only.',
  },
  {
    family: 'grsai-generate',
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
  return providers.map((provider) => provider.identity.implementationId).sort();
}

const CHROME_FEASIBILITY_RESULT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
}

function createChromeFeasibilityFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(requestUrl(input));
    if (url.hostname === 'api.openai.com') {
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
  setProviderAccountRepository(storage.providerAccounts);
  setSecretStorageAdapter(storage.secrets);
  setJobHistoryStore(storage.history);
  setTaskStore(storage.tasks);
  setAssetStore(storage.assets);
  setUserModelConfigRepository(storage.userModelConfigs);

  const providers = listProviders();
  const profile = await saveProviderSurfaceProfile({
    implementationId: 'image-endpoint',
    profileId: 'chrome-feasibility-mock',
    displayName: 'Chrome Feasibility Mock',
    apiKey: 'mock-key',
  });
  if (!profile.ok) {
    throw new Error(profile.error.message);
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createChromeFeasibilityFetch(originalFetch);
  const taskId = 'chrome-feasibility-task';
  const createdAt = new Date().toISOString();
  const session = createImagenSession();
  const terminalJob = new Promise<Job>((resolve) => {
    const unsubscribe = session.subscribe((snapshot) => {
      const job = snapshot.jobs.find((candidate) => candidate.taskId === taskId);
      if (job?.status !== 'completed' && job?.status !== 'failed') return;
      const result = getJob(job.id);
      if (result === undefined) return;
      unsubscribe();
      resolve(result);
    });
  });
  const accepted = await session.submitJob({
    taskId,
    backendId: 'provider',
    payload: {
      profileId: profile.value.profileId,
      operation: 'text_to_image',
      request: {
        prompt: 'Chrome feasibility profile dispatch smoke',
        output: { count: 1 },
        providerOptions: { model: 'gpt-image-2' },
      },
      runningTask: {
        schemaVersion: TASK_RECORD_SCHEMA_VERSION,
        taskId,
        status: 'running',
        operation: 'text-to-image',
        prompt: 'Chrome feasibility profile dispatch smoke',
        attachments: [],
        outputs: [],
        placement: { kind: 'unbound', reason: 'no-photoshop-source' },
        execution: {
          backend: { id: 'provider', label: 'Provider' },
          connection: { id: profile.value.profileId, label: profile.value.displayName },
          target: { id: 'gpt-image-2', label: 'gpt-image-2' },
        },
        createdAt,
        updatedAt: createdAt,
      },
    },
  });
  if (!accepted.ok) {
    globalThis.fetch = originalFetch;
    session.dispose();
    throw new Error(accepted.error.message);
  }
  const job = await terminalJob.finally(() => {
    globalThis.fetch = originalFetch;
    session.dispose();
  });
  if (job.status === 'failed') {
    throw new Error(job.error?.message ?? 'Chrome feasibility generation failed.');
  }
  const profileDispatchProfileId = profile.value.profileId;

  const image = job.output?.image as { assets?: readonly unknown[] } | undefined;
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
