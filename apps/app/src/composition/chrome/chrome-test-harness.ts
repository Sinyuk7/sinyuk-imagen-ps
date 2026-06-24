import type {
  DurableJobRecord,
  ProviderModelInfo,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileTestResult,
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
}

export interface ChromeTestHarnessConfig {
  readonly storageMode: ChromeTestStorageMode;
  readonly databaseName?: string;
  readonly seedProfile: boolean;
  readonly seedHistory: boolean;
  readonly scenario: PhotoshopSimulatorScenarioId;
  readonly filePickerMode: ChromeTestFilePickerMode;
  readonly mockFailureMode: ChromeTestMockFailureMode;
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
const MOCK_MODELS: readonly ProviderModelInfo[] = [{ id: 'mock-image-v1' }];

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
  };
}

function mockProfile(options?: { readonly failMode?: ChromeTestMockFailureMode; readonly displayName?: string }): ProviderProfile {
  const displayName = options?.displayName ?? 'Mock Profile';
  const config: ProviderProfileConfig = {
    providerId: 'mock',
    displayName,
    family: 'image-endpoint',
    baseURL: 'https://mock.local',
    defaultModel: 'mock-image-v1',
    ...(options?.failMode === 'always' ? { failMode: { type: 'always' } } : {}),
  };
  return {
    profileId: MOCK_PROFILE_ID,
    providerId: 'mock',
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

function initialRecords(config: ChromeTestHarnessConfig): Partial<Record<ChromeStoreName, readonly { readonly key: string; readonly value: unknown }[]>> {
  return {
    profiles: config.seedProfile ? [{ key: MOCK_PROFILE_ID, value: mockProfile({ failMode: config.mockFailureMode }) }] : [],
    secrets: config.seedProfile ? [{ key: MOCK_SECRET_REF, value: 'mock-key' }] : [],
    history: config.seedHistory ? seededHistoryRecords().map((record) => ({ key: record.jobId, value: record })) : [],
  };
}

function generatedImageFile(): File {
  const bytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
    0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
    0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
  ]);
  return new File([bytes], 'chrome-e2e-upload.png', { type: 'image/png' });
}

async function seedMockProfile(storage: ChromeRuntimeStorage, options?: { readonly failMode?: ChromeTestMockFailureMode; readonly displayName?: string }): Promise<void> {
  await storage.secrets.setSecret(MOCK_SECRET_REF, 'mock-key');
  await storage.profiles.save(mockProfile(options));
}

async function seedHistory(storage: ChromeRuntimeStorage): Promise<void> {
  await Promise.all(seededHistoryRecords().map((record) => storage.history.put(record)));
}

function mockProfileTestResult(profile: ProviderProfile): ProviderProfileTestResult {
  return {
    profileId: profile.profileId,
    providerId: profile.providerId,
    family: 'image-endpoint',
    valid: true,
    connectivity: {
      reachable: true,
      modelCount: MOCK_MODELS.length,
      models: MOCK_MODELS,
    },
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Chrome-only E2E harness 装配测试状态，不改变 shared UI 的 runtime 分支。
 */
export function createChromeTestHarnessRuntime(config: ChromeTestHarnessConfig): ChromeTestHarnessRuntime {
  let filePickerMode = config.filePickerMode;
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
        async testProviderProfile(profileId, options) {
          const profile = await commands.getProviderProfile(profileId);
          if (profile.ok && profile.value.providerId === 'mock') {
            await delay(100);
            return { ok: true, value: mockProfileTestResult(profile.value) };
          }
          return commands.testProviderProfile(profileId, options);
        },
        async refreshProfileModels(profileId) {
          const profile = await commands.getProviderProfile(profileId);
          if (profile.ok && profile.value.providerId === 'mock') {
            await delay(100);
            return { ok: true, value: MOCK_MODELS };
          }
          return commands.refreshProfileModels(profileId);
        },
      };
    },
    install(storage) {
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
          await backend.clear?.();
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
