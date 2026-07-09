import type {
  Asset,
  DurableJobRecord,
  Job,
  ProfileModelItem,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileConnectionTestResult,
  ProviderProfileTestResult,
  TaskRecord,
} from '@imagen-ps/application';
import type { ChromeFilePicker } from '../../adapters/chrome/chrome-host-port';
import {
  createBrowserIndexedDbBackend,
  createMemoryIndexedDbBackend,
  type ChromeKeyValueBackend,
  type ChromeStoreName,
} from '../../adapters/chrome/indexed-db-storage';
import type { CommandsPort } from '../../shared/ports/commands-port';
import type { PhotoshopSimulatorScenarioId } from '../../simulators/photoshop/simulator';

type ChromeTestStorageMode = 'memory' | 'indexed-db';
type ChromeTestFilePickerMode = 'image' | 'cancel';
type ChromeTestMockFailureMode = 'none' | 'always';

interface ChromeRuntimeStorage {
  readonly profiles: { save(profile: ProviderProfile): Promise<void>; list(): Promise<readonly ProviderProfile[]> };
  readonly secrets: { setSecret(key: string, value: string): Promise<void> };
  readonly history: { put(record: DurableJobRecord): Promise<void>; list(): Promise<readonly DurableJobRecord[]> };
  readonly tasks: { put(record: TaskRecord): Promise<void> };
  readonly modelDiscovery: { put(cache: { readonly profileId: string; readonly modelIds: readonly string[]; readonly refreshedAt: string }): Promise<void> };
}

export interface ChromeTestHarnessConfig {
  readonly storageMode: ChromeTestStorageMode;
  readonly databaseName?: string;
  readonly seedProfile: boolean;
  readonly seedHistory: boolean;
  readonly scenario: PhotoshopSimulatorScenarioId;
  readonly filePickerMode: ChromeTestFilePickerMode;
  readonly mockFailureMode: ChromeTestMockFailureMode;
  readonly resetStorage: boolean;
}

export interface ChromeTestHarnessRuntime {
  readonly backend: ChromeKeyValueBackend;
  readonly filePicker: ChromeFilePicker;
  readonly scenario: PhotoshopSimulatorScenarioId;
  wrapCommands(commands: CommandsPort): CommandsPort;
  install(storage: ChromeRuntimeStorage): void;
}

interface ChromeTestHarnessApi {
  resetStorage(): Promise<void>;
  seedMockProfile(options?: { readonly failMode?: ChromeTestMockFailureMode; readonly displayName?: string }): Promise<void>;
  seedHistory(): Promise<void>;
  setFilePickerMode(mode: ChromeTestFilePickerMode): void;
  setMockFailureMode(mode: ChromeTestMockFailureMode): Promise<void>;
  setScenario(scenario: PhotoshopSimulatorScenarioId): void;
  snapshot(): Promise<{
    readonly profiles: readonly ProviderProfile[];
    readonly history: readonly DurableJobRecord[];
    readonly scenario: PhotoshopSimulatorScenarioId;
    readonly filePickerMode: ChromeTestFilePickerMode;
  }>;
}

const MOCK_PROFILE_ID = 'mock-profile';
const MOCK_SECRET_REF = `secret:provider-profile:${MOCK_PROFILE_ID}:apiKey`;
const FIXED_NOW = '2026-06-25T00:00:00.000Z';
const MOCK_MODEL_ID = 'gpt-image-2';
const MOCK_DISCOVERED_MODELS = [{ id: MOCK_MODEL_ID }] as const;
const MOCK_PROFILE_MODELS: readonly ProfileModelItem[] = [{
  modelId: MOCK_MODEL_ID,
  discovered: false,
  configured: true,
  configSource: 'user',
}];
const MOCK_RESULT_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';
let mockJobSequence = 0;

function parseScenario(value: string | null): PhotoshopSimulatorScenarioId {
  const allowed: readonly PhotoshopSimulatorScenarioId[] = [
    'no-document',
    'empty-document',
    'seeded-document',
    'mask-capable-layer',
    'host-busy',
    'file-picker-cancelled',
    'place-asset-failure',
  ];
  return allowed.includes(value as PhotoshopSimulatorScenarioId) ? value as PhotoshopSimulatorScenarioId : 'seeded-document';
}

function parseStorageMode(value: string | null): ChromeTestStorageMode {
  return value === 'indexed-db' ? 'indexed-db' : 'memory';
}

function parseFilePickerMode(value: string | null): ChromeTestFilePickerMode {
  return value === 'cancel' ? 'cancel' : 'image';
}

function parseMockFailureMode(value: string | null): ChromeTestMockFailureMode {
  return value === 'always' ? 'always' : 'none';
}

export function chromeTestHarnessConfigFromUrl(url: URL): ChromeTestHarnessConfig | undefined {
  if (url.searchParams.get('testHarness') !== '1') {
    return undefined;
  }
  return {
    storageMode: parseStorageMode(url.searchParams.get('storage')),
    databaseName: url.searchParams.get('db') ?? undefined,
    seedProfile: url.searchParams.get('seedProfile') === 'mock',
    seedHistory: url.searchParams.get('seedHistory') === '1',
    scenario: parseScenario(url.searchParams.get('scenario')),
    filePickerMode: parseFilePickerMode(url.searchParams.get('filePicker')),
    mockFailureMode: parseMockFailureMode(url.searchParams.get('mockFailure')),
    resetStorage: url.searchParams.get('resetStorage') === '1',
  };
}

function mockProfile(options?: { readonly failMode?: ChromeTestMockFailureMode; readonly displayName?: string }): ProviderProfile {
  const displayName = options?.displayName ?? 'Mock Profile';
  const config: ProviderProfileConfig = {
    apiFormat: 'openai-images',
    displayName,
    connection: {
      selectionMode: 'manual',
      selectedEndpointId: 'primary',
      endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
    },
    paths: { generation: '/images/generations', edit: '/images/edits' },
    defaultModel: MOCK_MODEL_ID,
    ...(options?.failMode === 'always' ? { failMode: { type: 'always' } } : {}),
  };
  return {
    profileId: MOCK_PROFILE_ID,
    apiFormat: 'openai-images',
    displayName,
    enabled: true,
    config,
    secretRefs: { apiKey: MOCK_SECRET_REF },
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
}

function seededHistoryRecords(): readonly DurableJobRecord[] {
  return [
    {
      schemaVersion: 1,
      jobId: 'chrome-e2e-history-completed',
      status: 'completed',
      workflow: 'provider-generate',
      input: { profileId: MOCK_PROFILE_ID, prompt: 'completed history prompt' },
      outputs: [{ kind: 'hostObject', ref: 'chrome-e2e-history-asset', mimeType: 'image/png', byteSize: 16 }],
      createdAt: FIXED_NOW,
      updatedAt: '2026-06-25T00:00:01.000Z',
    },
    {
      schemaVersion: 1,
      jobId: 'chrome-e2e-history-failed',
      status: 'failed',
      workflow: 'provider-generate',
      input: { profileId: MOCK_PROFILE_ID, prompt: 'failed history prompt' },
      outputs: [],
      error: { category: 'provider', message: 'Seeded mock provider failure.' },
      createdAt: FIXED_NOW,
      updatedAt: '2026-06-25T00:00:02.000Z',
    },
    {
      schemaVersion: 1,
      jobId: 'chrome-e2e-history-running',
      status: 'running',
      workflow: 'provider-generate',
      input: { profileId: MOCK_PROFILE_ID, prompt: 'running history prompt' },
      outputs: [],
      createdAt: FIXED_NOW,
      updatedAt: '2026-06-25T00:00:03.000Z',
    },
  ];
}

function seededTaskRecords(): readonly TaskRecord[] {
  return [
    {
      schemaVersion: 1,
      taskId: 'chrome-e2e-task-completed',
      status: 'completed',
      operation: 'text-to-image',
      prompt: 'completed history prompt',
      attachments: [],
      outputs: [{
        outputId: 'chrome-e2e-task-completed:output:0',
        index: 0,
        kind: 'image',
        asset: { ref: { kind: 'hostObject', ref: 'chrome-e2e-history-asset', mimeType: 'image/png', byteSize: 16 } },
      }],
      placement: { kind: 'unbound', reason: 'no-photoshop-source' },
      execution: { profileId: MOCK_PROFILE_ID, profileName: 'Mock Profile' },
      createdAt: FIXED_NOW,
      updatedAt: '2026-06-25T00:00:01.000Z',
      finishedAt: '2026-06-25T00:00:01.000Z',
    },
    {
      schemaVersion: 1,
      taskId: 'chrome-e2e-task-failed',
      status: 'failed',
      operation: 'text-to-image',
      prompt: 'failed history prompt',
      attachments: [],
      outputs: [],
      placement: { kind: 'unbound', reason: 'no-photoshop-source' },
      error: { category: 'provider', message: 'Seeded mock provider failure.' },
      execution: { profileId: MOCK_PROFILE_ID, profileName: 'Mock Profile' },
      createdAt: FIXED_NOW,
      updatedAt: '2026-06-25T00:00:02.000Z',
      finishedAt: '2026-06-25T00:00:02.000Z',
    },
    {
      schemaVersion: 1,
      taskId: 'chrome-e2e-task-running',
      status: 'running',
      operation: 'text-to-image',
      prompt: 'running history prompt',
      attachments: [],
      outputs: [],
      placement: { kind: 'unbound', reason: 'no-photoshop-source' },
      execution: { profileId: MOCK_PROFILE_ID, profileName: 'Mock Profile' },
      createdAt: FIXED_NOW,
      updatedAt: '2026-06-25T00:00:03.000Z',
    },
  ];
}

function initialRecords(config: ChromeTestHarnessConfig): Partial<Record<ChromeStoreName, readonly { readonly key: string; readonly value: unknown }[]>> {
  return {
    profiles: config.seedProfile ? [{ key: MOCK_PROFILE_ID, value: mockProfile({ failMode: config.mockFailureMode }) }] : [],
    secrets: config.seedProfile ? [{ key: MOCK_SECRET_REF, value: 'mock-key' }] : [],
    history: config.seedHistory ? seededHistoryRecords().map((record) => ({ key: record.jobId, value: record })) : [],
    tasks: config.seedHistory ? seededTaskRecords().map((record) => ({ key: record.taskId, value: record })) : [],
    modelDiscovery: config.seedProfile
      ? [{
          key: MOCK_PROFILE_ID,
          value: {
            profileId: MOCK_PROFILE_ID,
            modelIds: MOCK_DISCOVERED_MODELS.map((model) => model.id),
            refreshedAt: FIXED_NOW,
          },
        }]
      : [],
  };
}

async function generatedImageFile(): Promise<File> {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const context = canvas.getContext('2d');
    if (context) {
      context.fillStyle = '#2a9d8f';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#ffffff';
      context.fillRect(96, 96, 832, 832);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob) {
        return new File([blob], 'chrome-e2e-upload.png', { type: 'image/png' });
      }
    }
  }
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x04, 0x00, 0x00, 0x00, 0x04, 0x00, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return new File([bytes], 'chrome-e2e-upload.png', { type: 'image/png' });
}

async function seedMockProfile(storage: ChromeRuntimeStorage, options?: { readonly failMode?: ChromeTestMockFailureMode; readonly displayName?: string }): Promise<void> {
  await storage.secrets.setSecret(MOCK_SECRET_REF, 'mock-key');
  await storage.profiles.save(mockProfile(options));
  await storage.modelDiscovery.put({
    profileId: MOCK_PROFILE_ID,
    modelIds: MOCK_DISCOVERED_MODELS.map((model) => model.id),
    refreshedAt: FIXED_NOW,
  });
}

async function seedHistory(storage: ChromeRuntimeStorage): Promise<void> {
  await Promise.all([
    ...seededHistoryRecords().map((record) => storage.history.put(record)),
    ...seededTaskRecords().map((record) => storage.tasks.put(record)),
  ]);
}

function mockProfileTestResult(profile: ProviderProfile): ProviderProfileTestResult {
  return {
    profileId: profile.profileId,
    apiFormat: profile.apiFormat,
    valid: true,
    connectivity: {
      status: 'verified',
    },
  };
}

function mockProfileConnectionTestResult(): ProviderProfileConnectionTestResult {
  return {
    status: 'verified',
  };
}

function mockOutputAsset(): Asset {
  const binary = atob(MOCK_RESULT_PNG_BASE64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return {
    type: 'image',
    name: 'chrome-e2e-result.png',
    mimeType: 'image/png',
    data: bytes,
    url: `data:image/png;base64,${MOCK_RESULT_PNG_BASE64}`,
  };
}

function mockJobForSubmit(input: { readonly workflow: string; readonly input: Record<string, unknown> }, profile: ProviderProfile): Job {
  mockJobSequence += 1;
  const now = new Date().toISOString();
  const model = typeof input.input.providerOptions === 'object' && input.input.providerOptions !== null
    ? (input.input.providerOptions as { readonly model?: unknown }).model
    : undefined;
  const modelId = typeof model === 'string' ? model : MOCK_MODEL_ID;
  if ((profile.config.failMode as { readonly type?: unknown } | undefined)?.type === 'always') {
    return {
      id: `chrome-e2e-mock-failed-${mockJobSequence}`,
      status: 'failed',
      input: input.input,
      output: undefined,
      error: { category: 'provider', message: 'Mock provider forced failure' },
      createdAt: now,
      updatedAt: now,
    };
  }
  const operation = input.workflow === 'provider-edit' ? 'image_edit' : 'text_to_image';
  return {
    id: `chrome-e2e-mock-${mockJobSequence}`,
    status: 'completed',
    input: input.input,
    output: {
      image: {
        assets: [mockOutputAsset()],
        text: [
          `[operation=${operation}]`,
          `[model=${modelId}]`,
          `[prompt=${String(input.input.prompt ?? '')}]`,
          '[app.output=size=2k format=png aspect=auto providerInputSize=1k]',
          '[images=0]',
          '[mask=no]',
          '[assets=1]',
        ].join(' '),
        metadata: {
          size: '1024x1024',
          outputFormat: 'png',
        },
      },
    },
    error: undefined,
    createdAt: now,
    updatedAt: now,
  };
}

function hasMockLocalEndpoint(config: ProviderProfileConfig | undefined): boolean {
  const connection = config?.connection;
  if (typeof connection !== 'object' || connection === null || Array.isArray(connection)) {
    return false;
  }
  const endpoints = (connection as { readonly endpoints?: unknown }).endpoints;
  if (!Array.isArray(endpoints)) {
    return false;
  }
  return endpoints.some((endpoint) => {
    if (typeof endpoint !== 'object' || endpoint === null || Array.isArray(endpoint)) {
      return false;
    }
    const url = (endpoint as { readonly url?: unknown }).url;
    return typeof url === 'string' && url.replace(/\/+$/, '') === 'https://mock.local';
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Chrome-only E2E harness 装配测试状态，不改变 shared UI 的 runtime 分支。
 */
export function createChromeTestHarnessRuntime(config: ChromeTestHarnessConfig): ChromeTestHarnessRuntime {
  let filePickerMode = config.filePickerMode;
  let installedStorage: ChromeRuntimeStorage | undefined;
  const backend = config.storageMode === 'indexed-db'
    ? createBrowserIndexedDbBackend({ databaseName: config.databaseName })
    : createMemoryIndexedDbBackend({ initial: initialRecords(config) });
  const filePicker: ChromeFilePicker = {
    async pick() {
      return filePickerMode === 'cancel' ? undefined : generatedImageFile();
    },
  };

  return {
    backend,
    filePicker,
    scenario: config.scenario,
    wrapCommands(commands) {
      return {
        ...commands,
        async submitJob(input) {
          const profileId = typeof input.input.profileId === 'string'
            ? input.input.profileId
            : typeof input.input.providerProfileId === 'string'
              ? input.input.providerProfileId
              : undefined;
          if (profileId === MOCK_PROFILE_ID) {
            const profile = await commands.getProviderProfile(profileId);
            if (profile.ok) {
              await delay(100);
              return { ok: true, value: mockJobForSubmit(input, profile.value) };
            }
          }
          return commands.submitJob(input);
        },
        async testProviderProfile(profileId, options) {
          const profile = await commands.getProviderProfile(profileId);
          if (profile.ok && profile.value.profileId === MOCK_PROFILE_ID) {
            await delay(100);
            return { ok: true, value: mockProfileTestResult(profile.value) };
          }
          return commands.testProviderProfile(profileId, options);
        },
        async testProviderProfileConnection(input) {
          if (input.apiFormat === 'openai-images' && hasMockLocalEndpoint(input.config)) {
            await delay(100);
            return { ok: true, value: mockProfileConnectionTestResult() };
          }
          return commands.testProviderProfileConnection(input);
        },
        async refreshProfileModels(profileId) {
          const profile = await commands.getProviderProfile(profileId);
          if (profile.ok && profile.value.profileId === MOCK_PROFILE_ID) {
            await delay(100);
            await installedStorage?.modelDiscovery.put({
              profileId,
              modelIds: MOCK_DISCOVERED_MODELS.map((model) => model.id),
              refreshedAt: new Date().toISOString(),
            });
            return { ok: true, value: MOCK_DISCOVERED_MODELS };
          }
          return commands.refreshProfileModels(profileId);
        },
        async refreshDraftProfileModels(input) {
          if (input.apiFormat === 'openai-images' && hasMockLocalEndpoint(input.config)) {
            await delay(100);
            return { ok: true, value: MOCK_PROFILE_MODELS };
          }
          return commands.refreshDraftProfileModels(input);
        },
      };
    },
    install(storage) {
      installedStorage = storage;
      const api: ChromeTestHarnessApi = {
        async resetStorage() {
          await backend.clear?.();
        },
        async seedMockProfile(options) {
          await seedMockProfile(storage, options);
        },
        async seedHistory() {
          await seedHistory(storage);
        },
        setFilePickerMode(mode) {
          filePickerMode = mode;
        },
        async setMockFailureMode(mode) {
          await seedMockProfile(storage, { failMode: mode });
        },
        setScenario(scenario) {
          const next = new URL(window.location.href);
          next.searchParams.set('testHarness', '1');
          next.searchParams.set('scenario', scenario);
          window.location.assign(next.toString());
        },
        async snapshot() {
          return {
            profiles: await storage.profiles.list(),
            history: await storage.history.list(),
            scenario: config.scenario,
            filePickerMode,
          };
        },
      };
      globalThis.__IMAGEN_CHROME_TEST_HARNESS__ = api;
      if (config.storageMode === 'indexed-db') {
        void (async () => {
          if (config.resetStorage) await backend.clear?.();
          if (config.seedProfile) await seedMockProfile(storage, { failMode: config.mockFailureMode });
          if (config.seedHistory) await seedHistory(storage);
        })();
      }
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __IMAGEN_CHROME_TEST_HARNESS__: ChromeTestHarnessApi | undefined;
}
