import { vi } from 'vitest';
import type {
  ProfileModelItem,
  ProviderProfile,
  ProviderProfileConnectionTestResult,
  ProviderProfileTestResult,
  TaskRecord,
} from '@imagen-ps/application';
import type { CommandsPort } from '../../../src/app-services/commands-port';
import {
  fakeProfile,
  fakeProviderSurfaces,
} from '../fixtures/provider.fixtures';
import { completedJob, fakeDurableRecord, fakeTaskRecord } from '../fixtures/task.fixtures';
import { createModelConfigRepositoryFake } from './model-config-repository.fake';

export function createCommandsFake(options?: {
  readonly profiles?: readonly ProviderProfile[];
  readonly profileModelItems?: readonly ProfileModelItem[];
}) {
  let profiles: readonly ProviderProfile[] = options?.profiles ?? [fakeProfile];
  const modelConfig = createModelConfigRepositoryFake({
    profileModelItems: options?.profileModelItems,
  });

  let jobSequence = 0;
  const jobs = new Map<string, ReturnType<typeof completedJob>>();
  const executeJob = vi.fn(async (input: Parameters<CommandsPort['executeJob']>[0]) => {
    const terminal = completedJob(input.execution.input, `job-${++jobSequence}`);
    const { output: _output, error: _error, ...createdBase } = terminal;
    await input.onJobCreated?.({
      ...createdBase,
      status: 'created',
      output: undefined,
      error: undefined,
      updatedAt: terminal.createdAt,
    });
    jobs.set(terminal.id, terminal);
    return { ok: true as const, value: terminal };
  });
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
  const saveProviderSurfaceProfile = vi.fn(async (
    input: Parameters<CommandsPort['saveProviderSurfaceProfile']>[0],
  ) => {
    const surface = fakeProviderSurfaces.find((item) => item.identity.implementationId === input.implementationId);
    if (!surface) {
      return { ok: false as const, error: { category: 'validation' as const, message: 'Provider surface unavailable.' } };
    }
    const existing = profiles.find((profile) => profile.profileId === input.profileId);
    const secretRefs = input.removeSavedApiKey
      ? undefined
      : input.apiKey || existing?.secretRefs?.apiKey
        ? { ...(existing?.secretRefs ?? {}), apiKey: `secret:provider-profile:${input.profileId}:apiKey` }
        : undefined;
    const next: ProviderProfile = {
      ...(existing ?? fakeProfile),
      profileId: input.profileId,
      apiFormat: surface.identity.apiFormat,
      displayName: input.displayName,
      lifecycle: 'ready',
      config: existing?.config ?? {},
      ...(secretRefs ? { secretRefs } : { secretRefs: undefined }),
      updatedAt: '2026-06-15T00:00:03.000Z',
    };
    profiles = existing
      ? profiles.map((profile) => (profile.profileId === input.profileId ? next : profile))
      : [...profiles, next];
    return { ok: true as const, value: next };
  });
  const deleteProviderProfile = vi.fn(async (profileId: string) => {
    profiles = profiles.filter((profile) => profile.profileId !== profileId);
    return { ok: true as const, value: undefined };
  });
  const testProviderProfile = vi.fn(async (profileId: string, _options?: unknown) => ({
    ok: true as const,
    value: {
      profileId,
      apiFormat: 'openai-images',
      valid: true,
      connectivity: { status: 'verified' },
    } satisfies ProviderProfileTestResult,
  }));
  const testProviderProfileConnection = vi.fn(async () => ({
    ok: true as const,
    value: {
      status: 'verified',
    } satisfies ProviderProfileConnectionTestResult,
  }));
  const listProviders = vi.fn(() => fakeProviderSurfaces);
  const describeProvider = vi.fn((providerId: string) => (
    fakeProviderSurfaces.find((surface) => surface.identity.implementationId === providerId)
  ));
  const listTaskRecords = vi.fn(async () => taskRecords);
  const reconcileStaleRunningTaskRecords = vi.fn(async () => []);
  const listProviderProfiles = vi.fn(async () => ({ ok: true as const, value: profiles }));

  const commands: CommandsPort = {
    executeJob,
    getJob: vi.fn((jobId: string) => jobs.get(jobId)),
    subscribeJobEvents,
    listJobHistoryRecords,
    putTaskRecord,
    getTaskRecord: vi.fn(async (taskId: string) => taskRecords.find((record) => record.taskId === taskId)),
    listTaskRecords,
    reconcileStaleRunningTaskRecords,
    listProviders,
    describeProvider,
    saveProviderSurfaceProfile,
    listProviderProfiles,
    getProviderProfile,
    deleteProviderProfile,
    testProviderProfile,
    testProviderProfileConnection,
    ...modelConfig.commands,
  };

  return {
    commands,
    modelGenerationPreferences: modelConfig.modelGenerationPreferences,
    spies: {
      executeJob,
      listProviders,
      describeProvider,
      saveProviderSurfaceProfile,
      putTaskRecord,
      subscribeJobEvents,
      listJobHistoryRecords,
      getProviderProfile,
      listProviderProfiles,
      deleteProviderProfile,
      testProviderProfile,
      testProviderProfileConnection,
      ...modelConfig.spies,
      listTaskRecords,
      reconcileStaleRunningTaskRecords,
    },
  };
}
