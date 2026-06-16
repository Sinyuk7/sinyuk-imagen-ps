import { vi } from 'vitest';
import type {
  Asset,
  Job,
  ProviderDescriptor,
  ProviderProfile,
  ProviderProfileInput,
  ProviderProfileTestResult,
} from '@imagen-ps/application';
import type { AppServices } from '../src/app-services/app-services';
import type { CommandsPort } from '../src/app-services/commands-port';
import type { HostBridge } from '../src/app-services/host-bridge';

export const fakeAsset: Asset = {
  type: 'image',
  name: 'result.png',
  data: 'ZmFrZS1pbWFnZQ==',
  mimeType: 'image/png',
};

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
    readonly saveProviderProfile: ReturnType<typeof vi.fn>;
    readonly placeAssetOnCanvas: ReturnType<typeof vi.fn>;
  };
} {
  let profiles: readonly ProviderProfile[] = [fakeProfile];

  const submitJob = vi.fn(async (input: Parameters<CommandsPort['submitJob']>[0]) => ({
    ok: true as const,
    value: completedJob(input.input),
  }));
  const subscribeJobEvents = vi.fn(() => () => undefined);
  const saveProviderProfile = vi.fn(async (input: ProviderProfileInput) => {
    const next = savedProfile(input);
    profiles = [next];
    return { ok: true as const, value: next };
  });
  const placeAssetOnCanvas = vi.fn(async () => undefined);

  const commands: CommandsPort = {
    submitJob,
    getJob: vi.fn(() => completedJob({})),
    subscribeJobEvents,
    retryJob: vi.fn(async () => ({ ok: true as const, value: completedJob({}) })),
    listProviders: vi.fn(() => [fakeProvider]),
    describeProvider: vi.fn(() => fakeProvider),
    listProviderProfiles: vi.fn(async () => ({ ok: true as const, value: profiles })),
    getProviderProfile: vi.fn(async () => ({ ok: true as const, value: profiles[0] ?? fakeProfile })),
    saveProviderProfile,
    deleteProviderProfile: vi.fn(async () => ({ ok: true as const, value: undefined })),
    testProviderProfile: vi.fn(async (profileId: string) => ({
      ok: true as const,
      value: {
        profileId,
        providerId: 'mock',
        family: 'image-endpoint',
        valid: true,
        connectivity: { reachable: true, modelCount: 1, models: [{ id: 'mock-image-v1' }] },
      } satisfies ProviderProfileTestResult,
    })),
    listProfileModels: vi.fn(async () => ({ ok: true as const, value: [{ id: 'mock-image-v1' }] })),
    refreshProfileModels: vi.fn(async () => ({ ok: true as const, value: [{ id: 'mock-image-v1' }] })),
  };

  const host: HostBridge = {
    listLayers: vi.fn(async () => [{ id: 1, name: 'Layer 1', kind: 'pixel', visible: true }]),
    pickImageFile: vi.fn(async () => fakeAsset),
    readLayerAsAsset: vi.fn(async () => fakeAsset),
    readLayerMaskAsAsset: vi.fn(async () => undefined),
    placeAssetOnCanvas,
  };

  return {
    services: { commands, host },
    spies: { submitJob, subscribeJobEvents, saveProviderProfile, placeAssetOnCanvas },
  };
}
