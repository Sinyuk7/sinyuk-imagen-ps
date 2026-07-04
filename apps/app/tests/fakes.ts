import { vi } from 'vitest';
import type {
  Asset,
  BalanceChange,
  DurableJobRecord,
  EndpointMeasurementResult,
  ExactTaskCost,
  Job,
  MeasureProfileEndpointsResult,
  ProfileBillingState,
  ProviderDescriptor,
  ProviderProfile,
  ProviderProfileInput,
  ProviderProfileConnectionTestResult,
  ProviderProfileTestResult,
  TaskRecord,
} from '@imagen-ps/application';
import { classifyEndpoint, resolveModelBrand } from '@imagen-ps/application';
import type { AppServices } from '../src/app-services/app-services';
import type { CommandsPort } from '../src/app-services/commands-port';
import { PHOTOSHOP_UXP_RUNTIME_CAPABILITIES, type HostBridge } from '../src/app-services/host-bridge';
import { createHostImageAsset } from '../src/shared/domain/host-image-asset';
import { createMemoryThumbnailStore } from '../src/shared/image/thumbnail-store';
import { createStaticAppPathInfoPort } from '../src/shared/ports/app-path-info';
import type { DiagnosticsPort } from '../src/shared/ports/diagnostics-port';
import { createMemoryActiveImageProfileStore } from '../src/shared/ports/active-image-profile';
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
  apiFormat: 'openai-images',
  displayName: 'Mock Profile',
  enabled: true,
  config: {
    apiFormat: 'openai-images',
    displayName: 'Mock Profile',
    connection: {
      selectionMode: 'manual',
      selectedEndpointId: 'primary',
      endpoints: [
        {
          id: 'primary',
          url: 'https://mock.local',
          enabled: true,
        },
      ],
    },
    paths: { generation: '/images/generations', edit: '/images/edits' },
    defaultModel: 'mock-image-v1',
  },
  secretRefs: {
    apiKey: 'secret:provider-profile:mock-profile:apiKey',
  },
  createdAt: '2026-06-15T00:00:00.000Z',
  updatedAt: '2026-06-15T00:00:00.000Z',
};

export const fakeOptimizerProfile: ProviderProfile = {
  profileId: '__prompt-optimizer__',
  apiFormat: 'openai-chat-completions',
  displayName: 'Prompt Optimizer',
  enabled: false,
  config: {
    apiFormat: 'openai-chat-completions',
    displayName: 'Prompt Optimizer',
    connection: {
      selectionMode: 'manual',
      selectedEndpointId: 'primary',
      endpoints: [
        {
          id: 'primary',
          url: 'https://openrouter.ai/api/v1',
          enabled: true,
        },
      ],
    },
    paths: { invoke: '/chat/completions' },
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
  apiFormat: 'openai-images',
  displayName: 'Mock Provider',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModels: [{ id: 'mock-image-v1' }],
  billing: {
    supportedModes: ['none'],
  },
};

export const fakeChatProvider: ProviderDescriptor = {
  id: 'chat-image',
  family: 'chat-image',
  apiFormat: 'openai-chat-completions',
  displayName: 'Chat Image',
  operations: ['text_to_image', 'image_edit'],
  invokeMode: 'sync',
  defaultModels: [{ id: 'gpt-4o-image' }],
  billing: {
    supportedModes: ['none', 'new-api'],
    defaultMode: 'new-api',
  },
  connectivity: {
    endpointMeasurement: 'supported',
    connectionTest: 'supported',
  },
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
        text: [
          '[operation=text_to_image]',
          '[model=mock-image-v1]',
          `[prompt=${String(input.prompt ?? 'make an image')}]`,
          '[output=size=2k format=png aspect=auto providerInputSize=1k]',
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
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:01.000Z',
  };
}

function savedProfile(input: ProviderProfileInput): ProviderProfile {
  return {
    ...fakeProfile,
    profileId: input.profileId,
    apiFormat: input.apiFormat ?? fakeProfile.apiFormat,
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
  readonly activeImageProfileId?: string | null;
}): {
  readonly services: AppServices;
  readonly spies: {
    readonly submitJob: ReturnType<typeof vi.fn>;
    readonly listProviders: ReturnType<typeof vi.fn>;
    readonly describeProvider: ReturnType<typeof vi.fn>;
    readonly classifyEndpoint: ReturnType<typeof vi.fn>;
    readonly putTaskRecord: ReturnType<typeof vi.fn>;
    readonly subscribeJobEvents: ReturnType<typeof vi.fn>;
    readonly listJobHistoryRecords: ReturnType<typeof vi.fn>;
    readonly getProviderProfile: ReturnType<typeof vi.fn>;
    readonly saveProviderProfile: ReturnType<typeof vi.fn>;
    readonly deleteProviderProfile: ReturnType<typeof vi.fn>;
    readonly testProviderProfile: ReturnType<typeof vi.fn>;
    readonly testProviderProfileConnection: ReturnType<typeof vi.fn>;
    readonly measureProfileEndpoints: ReturnType<typeof vi.fn>;
    readonly refreshProfileBalance: ReturnType<typeof vi.fn>;
    readonly getProfileBillingState: ReturnType<typeof vi.fn>;
    readonly listProfileModels: ReturnType<typeof vi.fn>;
    readonly refreshProfileModels: ReturnType<typeof vi.fn>;
    readonly ensurePromptOptimizerProfile: ReturnType<typeof vi.fn>;
    readonly optimizePrompt: ReturnType<typeof vi.fn>;
    readonly validatePromptOptimizerProfile: ReturnType<typeof vi.fn>;
    readonly listTaskRecords: ReturnType<typeof vi.fn>;
    readonly reconcileStaleRunningTaskRecords: ReturnType<typeof vi.fn>;
    readonly listLayers: ReturnType<typeof vi.fn>;
    readonly pickImageFile: ReturnType<typeof vi.fn>;
    readonly captureActiveImage: ReturnType<typeof vi.fn>;
    readonly readLayerAsAsset: ReturnType<typeof vi.fn>;
    readonly placeAssetOnCanvas: ReturnType<typeof vi.fn>;
    readonly saveAssetToFile: ReturnType<typeof vi.fn>;
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
    const index = profiles.findIndex((profile) => profile.profileId === next.profileId);
    profiles = index >= 0
      ? profiles.map((profile) => (profile.profileId === next.profileId ? next : profile))
      : [...profiles, next];
    return { ok: true as const, value: next };
  });
  const deleteProviderProfile = vi.fn(async () => ({ ok: true as const, value: undefined }));
  const testProviderProfile = vi.fn(async (profileId: string) => ({
    ok: true as const,
    value: {
      profileId,
      apiFormat: 'openai-images',
      valid: true,
      connectivity: { reachable: true, modelCount: 1, models: [{ id: 'mock-image-v1' }] },
    } satisfies ProviderProfileTestResult,
  }));
  const testProviderProfileConnection = vi.fn(async () => ({
    ok: true as const,
    value: {
      supported: true,
      reachable: true,
      modelCount: 1,
      models: [{ id: 'mock-image-v1' }],
    } satisfies ProviderProfileConnectionTestResult,
  }));
  const measureProfileEndpoints = vi.fn(async (
    input: Parameters<CommandsPort['measureProfileEndpoints']>[0],
  ): Promise<{ ok: true; value: MeasureProfileEndpointsResult }> => ({
    ok: true as const,
    value: {
      results: [
        {
          endpointId: 'primary',
          status: 'success',
          checkedAt: Date.now(),
          latencyMs: 12,
          modelCount: 1,
          models: [{ id: 'mock-image-v1' }],
        } satisfies EndpointMeasurementResult,
      ],
      models: [{ id: 'mock-image-v1' }],
      ...((
        (input.config.connection as { readonly selectionMode?: string } | undefined)?.selectionMode === 'auto'
      ) ? { resolvedEndpointId: 'primary' } : {}),
    },
  }));
  let billingState: ProfileBillingState = { refreshState: 'idle' };
  const getProfileBillingState = vi.fn(async () => ({ ok: true as const, value: billingState }));
  const refreshProfileBalance = vi.fn(async ({ profileId }: { profileId: string }) => {
    billingState = {
      ...billingState,
      refreshState: 'idle',
      balance: {
        profileId,
        apiFormat: 'openai-images',
        checkedAt: Date.now(),
        snapshot: {
          primary: {
            kind: 'money',
            remaining: '12.50',
            currency: 'USD',
          },
        },
      },
    };
    return { ok: true as const, value: { ...billingState.balance!, state: billingState } };
  });
  const listProfileModels = vi.fn(async () => ({ ok: true as const, value: [{ id: 'mock-image-v1' }] }));
  const refreshProfileModels = vi.fn(async () => ({ ok: true as const, value: [{ id: 'mock-image-v2' }] }));
  const ensurePromptOptimizerProfile = vi.fn(async () => ({ ok: true as const, value: fakeOptimizerProfile }));
  const optimizePrompt = vi.fn(async () => ({ ok: true as const, value: 'optimized prompt' }));
  const validatePromptOptimizerProfile = vi.fn(async () => ({ ok: true as const, value: 'optimized test prompt' }));
  const reconcileStaleRunningTaskRecords = vi.fn(async () => []);
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
  const saveAssetToFile = vi.fn(async () => undefined);
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
    reconcileStaleRunningTaskRecords,
    listProviders: vi.fn(() => [fakeProvider, fakeChatProvider]),
    describeProvider: vi.fn(() => fakeProvider),
    classifyEndpoint: vi.fn(classifyEndpoint),
    resolveModelBrand,
    listProviderProfiles: vi.fn(async () => ({ ok: true as const, value: profiles })),
    getProviderProfile,
    saveProviderProfile,
    deleteProviderProfile,
    testProviderProfile,
    testProviderProfileConnection,
    measureProfileEndpoints,
    refreshProfileBalance,
    getProfileBillingState,
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
    saveAssetToFile,
    getLayerThumbnail: vi.fn(async () => undefined),
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
      activeImageProfile: createMemoryActiveImageProfileStore(options?.activeImageProfileId),
      pathInfo: createStaticAppPathInfoPort({
        logPath: '/fake/data/logs/2026-07-02/imagen.jsonl',
        generatedImagePath: '/fake/data/uxp-asset-*',
      }),
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
      listProviders: commands.listProviders as ReturnType<typeof vi.fn>,
      describeProvider: commands.describeProvider as ReturnType<typeof vi.fn>,
      classifyEndpoint: commands.classifyEndpoint as ReturnType<typeof vi.fn>,
      putTaskRecord,
      subscribeJobEvents,
      listJobHistoryRecords,
      getProviderProfile,
      saveProviderProfile,
      deleteProviderProfile,
      testProviderProfile,
      testProviderProfileConnection,
      measureProfileEndpoints,
      refreshProfileBalance,
      getProfileBillingState,
      listProfileModels,
      refreshProfileModels,
      ensurePromptOptimizerProfile,
      optimizePrompt,
      validatePromptOptimizerProfile,
      listTaskRecords: commands.listTaskRecords as ReturnType<typeof vi.fn>,
      reconcileStaleRunningTaskRecords,
      listLayers,
      pickImageFile,
      captureActiveImage,
      readLayerAsAsset,
      placeAssetOnCanvas,
      saveAssetToFile,
      resolveTaskResource,
    },
  };
}
