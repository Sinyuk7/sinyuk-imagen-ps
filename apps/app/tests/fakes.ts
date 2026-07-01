import { vi } from 'vitest';
import type {
  Asset,
  DurableJobRecord,
  Job,
  ProviderDescriptor,
  ProviderProfile,
  ProviderProfileInput,
  ProviderProfileTestResult,
  TaskRecord,
} from '@imagen-ps/application';
import type { AppServices } from '../src/app-services/app-services';
import type { CommandsPort } from '../src/app-services/commands-port';
import { PHOTOSHOP_UXP_RUNTIME_CAPABILITIES, type HostBridge } from '../src/app-services/host-bridge';
import { createHostImageAsset } from '../src/shared/domain/host-image-asset';
import { createMemoryThumbnailStore } from '../src/shared/image/thumbnail-store';
import type { DiagnosticsPort } from '../src/shared/ports/diagnostics-port';
import { createMemoryGenerationSettingsStore, type AppGenerationSettings } from '../src/shared/ports/app-generation-settings';

export const fakeAsset: Asset = {
  type: 'image',
  name: 'result.png',
  data: 'ZmFrZS1pbWFnZQ==',
  mimeType: 'image/png',
};

const fakeProviderInputBytes = new TextEncoder().encode('fake-provider-input');
const fakeOutputBytes = new TextEncoder().encode('fake-image');

export const fakeProviderInputAsset: Asset = {
  type: 'image',
  name: 'input.png',
  mimeType: 'image/png',
  storedRef: {
    kind: 'hostObject',
    ref: 'fake-provider-input-1',
    name: 'input.png',
    mimeType: 'image/png',
    byteSize: fakeProviderInputBytes.byteLength,
  },
};

export const fakeOutputAsset: Asset = {
  type: 'image',
  name: 'result.png',
  mimeType: 'image/png',
  storedRef: {
    kind: 'hostObject',
    ref: 'fake-output-asset-1',
    name: 'result.png',
    mimeType: 'image/png',
    byteSize: fakeOutputBytes.byteLength,
  },
};

export const fakeHostImage = createHostImageAsset(fakeProviderInputAsset, {
  source: 'file',
  previewUrl: 'data:image/png;base64,ZmFrZS1pbWFnZQ==',
  payloadKind: 'host-object',
  payloadRef: fakeProviderInputAsset.storedRef?.ref,
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
    imageMaxSide: 2048,
  },
  secretRefs: {
    apiKey: 'secret:provider-profile:mock-profile:apiKey',
  },
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
};

export const fakeOptimizerProfile: ProviderProfile = {
  profileId: '__prompt-optimizer__',
  providerId: 'prompt-optimize',
  displayName: 'Prompt Optimizer',
  enabled: false,
  config: {
    providerId: 'prompt-optimize',
    displayName: 'Prompt Optimizer',
    family: 'prompt-optimize',
    baseURL: 'https://openrouter.ai/api/v1',
    defaultModel: 'gpt-4o-mini',
    instruction: 'Rewrite the prompt.',
    testPrompt: 'test',
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

export const fakeTaskRecord: TaskRecord = {
  schemaVersion: 1,
  taskId: 'task-history-1',
  status: 'completed',
  operation: 'text-to-image',
  prompt: 'history prompt',
  attachments: [],
  outputs: [{
    outputId: 'task-history-1:output:0',
    index: 0,
    kind: 'image',
    asset: {
      ref: {
        kind: 'hostObject',
        ref: 'history-asset-1',
        name: 'history.png',
        mimeType: 'image/png',
        byteSize: 16,
      },
    },
  }],
  placement: { kind: 'unbound', reason: 'no-photoshop-source' },
  execution: {
    profileId: 'mock-profile',
    profileName: 'Mock Profile',
  },
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:01.000Z',
  finishedAt: '2026-06-15T00:00:01.000Z',
};

function completedJob(input: Record<string, unknown>): Job {
  return {
    id: 'job-1',
    status: 'completed',
    input,
    output: {
      image: {
        assets: [fakeOutputAsset],
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

export function createFakeServices(options?: {
  readonly profiles?: readonly ProviderProfile[];
  readonly generationSettings?: Partial<AppGenerationSettings>;
}): {
  readonly services: AppServices;
  readonly spies: {
    readonly submitJob: ReturnType<typeof vi.fn>;
    readonly putTaskRecord: ReturnType<typeof vi.fn>;
    readonly subscribeJobEvents: ReturnType<typeof vi.fn>;
    readonly listJobHistoryRecords: ReturnType<typeof vi.fn>;
    readonly getProviderProfile: ReturnType<typeof vi.fn>;
    readonly saveProviderProfile: ReturnType<typeof vi.fn>;
    readonly deleteProviderProfile: ReturnType<typeof vi.fn>;
    readonly testProviderProfile: ReturnType<typeof vi.fn>;
    readonly listProfileModels: ReturnType<typeof vi.fn>;
    readonly refreshProfileModels: ReturnType<typeof vi.fn>;
    readonly ensurePromptOptimizerProfile: ReturnType<typeof vi.fn>;
    readonly optimizePrompt: ReturnType<typeof vi.fn>;
    readonly validatePromptOptimizerProfile: ReturnType<typeof vi.fn>;
    readonly listLayers: ReturnType<typeof vi.fn>;
    readonly pickImageFile: ReturnType<typeof vi.fn>;
    readonly captureActiveImage: ReturnType<typeof vi.fn>;
    readonly readLayerAsAsset: ReturnType<typeof vi.fn>;
    readonly placeAssetOnCanvas: ReturnType<typeof vi.fn>;
    readonly resolveTaskResource: ReturnType<typeof vi.fn>;
  };
} {
  let profiles: readonly ProviderProfile[] = options?.profiles ?? [fakeProfile, fakeOptimizerProfile];

  const submitJob = vi.fn(async (input: Parameters<CommandsPort['submitJob']>[0]) => ({
    ok: true as const,
    value: completedJob(input.input),
  }));
  const taskRecords: TaskRecord[] = [fakeTaskRecord];
  const putTaskRecord = vi.fn(async (record: TaskRecord) => {
    const index = taskRecords.findIndex((item) => item.taskId === record.taskId);
    if (index === -1) {
      taskRecords.push(record);
    } else {
      taskRecords[index] = record;
    }
  });
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
  const ensurePromptOptimizerProfile = vi.fn(async () => ({ ok: true as const, value: fakeOptimizerProfile }));
  const optimizePrompt = vi.fn(async () => ({ ok: true as const, value: 'optimized prompt' }));
  const validatePromptOptimizerProfile = vi.fn(async () => ({ ok: true as const, value: 'optimized test prompt' }));
  const listLayers = vi.fn(async () => [{ id: 1, name: 'Layer 1', kind: 'pixel', visible: true }]);
  const pickImageFile = vi.fn(async () => fakeHostImage);
  const captureActiveImage = vi.fn(async () => ({
    image: fakeHostImage,
    sourceKind: 'layer' as const,
    placement: {
      snapshot: {
        documentId: 42,
        documentSize: { width: 1024, height: 768 },
        layerId: 1,
        layerBoundsNoEffects: { left: 10, top: 20, right: 266, bottom: 276 },
        selectionBounds: null,
      },
      placementRect: { left: 10, top: 20, right: 266, bottom: 276 },
    },
  }));
  const readLayerAsAsset = vi.fn(async () => ({
    ...fakeHostImage,
    photoshopPlacement: {
      snapshot: {
        documentId: 42,
        documentSize: { width: 1024, height: 768 },
        layerId: 1,
        layerBoundsNoEffects: { left: 10, top: 20, right: 266, bottom: 276 },
        selectionBounds: null,
      },
      placementRect: { left: 10, top: 20, right: 266, bottom: 276 },
    },
  }));
  const placeAssetOnCanvas = vi.fn(async () => undefined);
  const resolveTaskResource = vi.fn(async () => ({
    resource: fakeTaskRecord.outputs[0]!.asset,
    availability: 'available' as const,
    bytes: fakeOutputBytes.buffer.slice(0),
    preview: { url: 'blob:task-history-preview' },
  }));

  const commands: CommandsPort = {
    submitJob,
    getJob: vi.fn(() => completedJob({})),
    subscribeJobEvents,
    retryJob: vi.fn(async () => ({ ok: true as const, value: completedJob({}) })),
    listJobHistoryRecords,
    putTaskRecord,
    getTaskRecord: vi.fn(async (taskId: string) => taskRecords.find((record) => record.taskId === taskId)),
    listTaskRecords: vi.fn(async () => taskRecords),
    listProviders: vi.fn(() => [fakeProvider]),
    describeProvider: vi.fn(() => fakeProvider),
    listProviderProfiles: vi.fn(async () => ({ ok: true as const, value: profiles })),
    getProviderProfile,
    saveProviderProfile,
    deleteProviderProfile,
    testProviderProfile,
    listProfileModels,
    refreshProfileModels,
    ensurePromptOptimizerProfile,
    optimizePrompt,
    validatePromptOptimizerProfile,
  };

  const host: HostBridge = {
    capabilities: PHOTOSHOP_UXP_RUNTIME_CAPABILITIES,
    listLayers,
    pickImageFile,
    captureActiveImage,
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
    services: {
      commands,
      host,
      generationSettings: createMemoryGenerationSettingsStore(options?.generationSettings),
      thumbnails: createMemoryThumbnailStore({
        async resolveStoredRef(ref) {
          if (ref.ref === fakeOutputAsset.storedRef?.ref) {
            return fakeOutputBytes.buffer.slice(0);
          }
          if (ref.ref === fakeProviderInputAsset.storedRef?.ref) {
            return fakeProviderInputBytes.buffer.slice(0);
          }
          return undefined;
        },
      }),
      taskResources: { resolve: resolveTaskResource },
      diagnostics,
    },
    spies: {
      submitJob,
      putTaskRecord,
      subscribeJobEvents,
      listJobHistoryRecords,
      getProviderProfile,
      saveProviderProfile,
      deleteProviderProfile,
      testProviderProfile,
      listProfileModels,
      refreshProfileModels,
      ensurePromptOptimizerProfile,
      optimizePrompt,
      validatePromptOptimizerProfile,
      listLayers,
      pickImageFile,
      captureActiveImage,
      readLayerAsAsset,
      placeAssetOnCanvas,
      resolveTaskResource,
    },
  };
}
