import { vi } from 'vitest';
import type {
  EndpointMeasurementResult,
  MeasureProfileEndpointsResult,
  OfficialModelPreset,
  ProfileModelItem,
  ProfileBillingState,
  ProviderProfile,
  ProviderProfileConnectionTestResult,
  ProviderProfileTestResult,
  TaskRecord,
} from '@imagen-ps/application';
import { classifyEndpoint, resolveModelBrand } from '@imagen-ps/application';
import type { CommandsPort } from '../../../src/app-services/commands-port';
import {
  fakeChatProvider,
  fakeDraftProfileModelItems,
  fakeProfile,
  fakeProvider,
  savedProfile,
} from '../fixtures/provider.fixtures';
import { completedJob, fakeDurableRecord, fakeTaskRecord } from '../fixtures/task.fixtures';
import { createModelConfigRepositoryFake } from './model-config-repository.fake';

export function createCommandsFake(options?: {
  readonly profiles?: readonly ProviderProfile[];
  readonly userModelConfigs?: readonly Parameters<typeof createModelConfigRepositoryFake>[0]['userModelConfigs'];
  readonly officialModelConfigPresets?: readonly OfficialModelPreset[];
  readonly profileModelItems?: readonly ProfileModelItem[];
}) {
  let profiles: readonly ProviderProfile[] = options?.profiles ?? [fakeProfile];
  const modelConfig = createModelConfigRepositoryFake({
    userModelConfigs: options?.userModelConfigs,
    officialModelConfigPresets: options?.officialModelConfigPresets,
    profileModelItems: options?.profileModelItems,
  });

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
  const saveProviderProfile = vi.fn(async (input: Parameters<CommandsPort['saveProviderProfile']>[0]) => {
    const existing = profiles.find((profile) => profile.profileId === input.profileId);
    const next = savedProfile(input, existing);
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
      connectivity: { reachable: true, modelCount: 1, models: [{ id: 'gpt-image-2' }] },
    } satisfies ProviderProfileTestResult,
  }));
  const testProviderProfileConnection = vi.fn(async () => ({
    ok: true as const,
    value: {
      supported: true,
      reachable: true,
      modelCount: 1,
      models: [{ id: 'gpt-image-2' }],
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
        } satisfies EndpointMeasurementResult,
      ],
      ...((
        (input.config.connection as { readonly selectionMode?: string } | undefined)?.selectionMode === 'auto'
      ) ? { resolvedEndpointId: 'primary' } : {}),
    },
  }));
  const refreshDraftProfileModels = vi.fn(async () => ({ ok: true as const, value: fakeDraftProfileModelItems }));
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
  const listProviders = vi.fn(() => [fakeProvider, fakeChatProvider]);
  const describeProvider = vi.fn(() => fakeProvider);
  const classifyEndpointSpy = vi.fn(classifyEndpoint);
  const listTaskRecords = vi.fn(async () => taskRecords);
  const reconcileStaleRunningTaskRecords = vi.fn(async () => []);

  const commands: CommandsPort = {
    submitJob,
    getJob: vi.fn(() => completedJob({})),
    subscribeJobEvents,
    retryJob: vi.fn(async () => ({ ok: true as const, value: completedJob({}) })),
    listJobHistoryRecords,
    putTaskRecord,
    getTaskRecord: vi.fn(async (taskId: string) => taskRecords.find((record) => record.taskId === taskId)),
    listTaskRecords,
    reconcileStaleRunningTaskRecords,
    listProviders,
    describeProvider,
    classifyEndpoint: classifyEndpointSpy,
    resolveModelBrand,
    listProviderProfiles: vi.fn(async () => ({ ok: true as const, value: profiles })),
    getProviderProfile,
    saveProviderProfile,
    deleteProviderProfile,
    testProviderProfile,
    testProviderProfileConnection,
    measureProfileEndpoints,
    refreshDraftProfileModels,
    refreshProfileBalance,
    getProfileBillingState,
    ...modelConfig.commands,
  };

  return {
    commands,
    modelGenerationPreferences: modelConfig.modelGenerationPreferences,
    spies: {
      submitJob,
      listProviders,
      describeProvider,
      classifyEndpoint: classifyEndpointSpy,
      putTaskRecord,
      subscribeJobEvents,
      listJobHistoryRecords,
      getProviderProfile,
      saveProviderProfile,
      deleteProviderProfile,
      testProviderProfile,
      testProviderProfileConnection,
      measureProfileEndpoints,
      refreshDraftProfileModels,
      refreshProfileBalance,
      getProfileBillingState,
      ...modelConfig.spies,
      listTaskRecords,
      reconcileStaleRunningTaskRecords,
    },
  };
}
