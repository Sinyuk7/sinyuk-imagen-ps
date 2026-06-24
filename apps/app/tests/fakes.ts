import { vi } from 'vitest';
import type {
  Asset,
  DurableJobRecord,
  Job,
  ProviderDescriptor,
  ProviderProfile,
  ProviderProfileInput,
  ProviderProfileTestResult,
} from '@imagen-ps/application';
import type { AppServices } from '../src/app-services/app-services';
import type { CommandsPort } from '../src/app-services/commands-port';
import { PHOTOSHOP_UXP_RUNTIME_CAPABILITIES, type HostBridge } from '../src/app-services/host-bridge';
import { createHostImageAsset } from '../src/shared/domain/host-image-asset';
import type { DiagnosticsPort } from '../src/shared/ports/diagnostics-port';

export const fakeAsset: Asset = {
  type: 'image',
  name: 'result.png',
  data: 'ZmFrZS1pbWFnZQ==',
  mimeType: 'image/png',
};

export const fakeHostImage = createHostImageAsset(fakeAsset, {
  source: 'file',
  previewUrl: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
});

export const fakeProfile: ProviderProfile = {
  profileId: 'mock-profile',
  providerId: 'mock',
  displayName: 'Mock Profile',
  enabled: true,
  config: {
    providerId: 'mock',
    displayName: 'Mock Profile',
    family: 'image-endpoint',
    baseURL: 'https://mock.local',
    defaultModel: 'mock-image-v1',
  },
  secretRefs: {
    apiKey: 'secret:provider-profile:mock-profile:apiKey',
  },
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
};

export const fakeProvider: ProviderDescriptor = {
  id: 'mock',
  family: 'image-endpoint',
  displayName: 'Mock Provider',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModels: [{ id: 'mock-image-v1' }],
};

export const fakeDurableRecord: DurableJobRecord = {
  schemaVersion: 1,
  jobId: 'job-history-1',
  status: 'completed',
  workflow: 'provider-generate',
  input: {
    profileId: 'mock-profile',
    prompt: 'history prompt',
  },
  outputs: [{ kind: 'hostObject', ref: 'history-asset-1', mimeType: 'image/png', byteSize: 16 }],
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:01.000Z',
};

function completedJob(input: Record<string, unknown>): Job {
  return {
    id: 'job-1',
    status: 'completed',
    input,
    output: {
      image: {
        assets: [fakeAsset],
        metadata: {
          size: '1024x1024',
          outputFormat: 'png',
        },
      },
    },
    error: undefined,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:01.000Z',
  };
}

function savedProfile(input: ProviderProfileInput): ProviderProfile {
  return {
    ...fakeProfile,
    profileId: input.profileId,
    providerId: input.providerId ?? fakeProfile.providerId,
    displayName: input.displayName ?? fakeProfile.displayName,
    enabled: input.enabled ?? fakeProfile.enabled,
    config: {
      ...fakeProfile.config,
      ...(input.config ?? {}),
    },
    updatedAt: '2026-06-15T00:00:02.000Z',
  };
}

export function createFakeServices(): {
  readonly services: AppServices;
  readonly spies: {
    readonly submitJob: ReturnType<typeof vi.fn>;
    readonly subscribeJobEvents: ReturnType<typeof vi.fn>;
    readonly listJobHistoryRecords: ReturnType<typeof vi.fn>;
    readonly getProviderProfile: ReturnType<typeof vi.fn>;
    readonly saveProviderProfile: ReturnType<typeof vi.fn>;
    readonly deleteProviderProfile: ReturnType<typeof vi.fn>;
    readonly testProviderProfile: ReturnType<typeof vi.fn>;
    readonly listProfileModels: ReturnType<typeof vi.fn>;
    readonly refreshProfileModels: ReturnType<typeof vi.fn>;
    readonly listLayers: ReturnType<typeof vi.fn>;
    readonly pickImageFile: ReturnType<typeof vi.fn>;
    readonly readLayerAsAsset: ReturnType<typeof vi.fn>;
    readonly placeAssetOnCanvas: ReturnType<typeof vi.fn>;
  };
} {
  let profiles: readonly ProviderProfile[] = [fakeProfile];

  const submitJob = vi.fn(async (input: Parameters<CommandsPort['submitJob']>[0]) => ({
    ok: true as const,
    value: completedJob(input.input),
  }));
  const subscribeJobEvents = vi.fn(() => () => undefined);
  const listJobHistoryRecords = vi.fn(async () => [fakeDurableRecord]);
  const getProviderProfile = vi.fn(async () => ({ ok: true as const, value: profiles[0] ?? fakeProfile }));
  const saveProviderProfile = vi.fn(async (input: ProviderProfileInput) => {
    const next = savedProfile(input);
    profiles = [next];
    return { ok: true as const, value: next };
  });
  const deleteProviderProfile = vi.fn(async () => ({ ok: true as const, value: undefined }));
  const testProviderProfile = vi.fn(async (profileId: string) => ({
    ok: true as const,
    value: {
      profileId,
      providerId: 'mock',
      family: 'image-endpoint',
      valid: true,
      connectivity: { reachable: true, modelCount: 1, models: [{ id: 'mock-image-v1' }] },
    } satisfies ProviderProfileTestResult,
  }));
  const listProfileModels = vi.fn(async () => ({ ok: true as const, value: [{ id: 'mock-image-v1' }] }));
  const refreshProfileModels = vi.fn(async () => ({ ok: true as const, value: [{ id: 'mock-image-v2' }] }));
  const listLayers = vi.fn(async () => [{ id: 1, name: 'Layer 1', kind: 'pixel', visible: true }]);
  const pickImageFile = vi.fn(async () => fakeHostImage);
  const readLayerAsAsset = vi.fn(async () => fakeHostImage);
  const placeAssetOnCanvas = vi.fn(async () => undefined);

  const commands: CommandsPort = {
    submitJob,
    getJob: vi.fn(() => completedJob({})),
    subscribeJobEvents,
    retryJob: vi.fn(async () => ({ ok: true as const, value: completedJob({}) })),
    listJobHistoryRecords,
    listProviders: vi.fn(() => [fakeProvider]),
    describeProvider: vi.fn(() => fakeProvider),
    listProviderProfiles: vi.fn(async () => ({ ok: true as const, value: profiles })),
    getProviderProfile,
    saveProviderProfile,
    deleteProviderProfile,
    testProviderProfile,
    listProfileModels,
    refreshProfileModels,
  };

  const host: HostBridge = {
    capabilities: PHOTOSHOP_UXP_RUNTIME_CAPABILITIES,
    listLayers,
    pickImageFile,
    readLayerAsAsset,
    readLayerMaskAsAsset: vi.fn(async () => undefined),
    placeAssetOnCanvas,
  };

  const diagnostics: DiagnosticsPort = {
    async checkpoint(event, attrs) {
      if (globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__) {
        return;
      }
      await globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__?.checkpoint(event, attrs);
    },
    async failure(event, error, attrs) {
      if (globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__) {
        return;
      }
      await globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__?.fail(event, error, attrs);
    },
  };

  return {
    services: { commands, host, diagnostics },
    spies: {
      submitJob,
      subscribeJobEvents,
      listJobHistoryRecords,
      getProviderProfile,
      saveProviderProfile,
      deleteProviderProfile,
      testProviderProfile,
      listProfileModels,
      refreshProfileModels,
      listLayers,
      pickImageFile,
      readLayerAsAsset,
      placeAssetOnCanvas,
    },
  };
}
