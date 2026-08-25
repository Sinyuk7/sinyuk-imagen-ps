import {
  createProviderRegistry,
  getOfficialModelPreset,
  registerBuiltins,
} from '@imagen-ps/providers';
import { describe, expect, it, vi } from 'vitest';
import type {
  ModelGenerationPreferenceRepository,
  ProviderProfile,
  UserModelConfig,
  UserModelConfigRepository,
} from '../commands/types.js';
import type { TaskRecord } from '../task.js';
import {
  admitGeneration,
  createProviderGenerationBackend,
  normalizeGenerationCommand,
  PROVIDER_GENERATION_BACKEND_ID,
  PROVIDER_PROFILE_LANE_MAX_CONCURRENCY,
  providerExecutionInput,
  type GenerationCommand,
  type ProviderGenerationBackendDependencies,
} from './index.js';

const createdAt = '2026-07-18T00:00:00.000Z';

function runningTask(taskId = 'task-a'): TaskRecord {
  return {
    schemaVersion: 3,
    taskId,
    status: 'running',
    operation: 'text-to-image',
    prompt: 'contract prompt',
    attachments: [],
    outputs: [],
    placement: { kind: 'unbound', reason: 'no-photoshop-source' },
    execution: {
      backend: { id: 'provider', label: 'Provider' },
      connection: { id: 'profile-a', label: 'Profile A' },
      target: { id: 'gpt-image-2', label: 'GPT Image 2' },
    },
    createdAt,
    updatedAt: createdAt,
  };
}

const profile: ProviderProfile = {
  profileId: 'profile-a',
  apiFormat: 'openai-images',
  displayName: 'Profile A',
  lifecycle: 'ready',
  config: {},
  createdAt,
  updatedAt: createdAt,
};

const modelConfig: UserModelConfig = {
  profileId: profile.profileId,
  apiFormat: profile.apiFormat,
  modelId: 'gpt-image-2',
  baseModelId: 'gpt-image-2',
  wireModelId: 'gpt-image-2-wire',
  requestStrategyId: 'image-endpoint-default',
  outputExposure: {
    kind: 'flexible-pixels',
    sizePresetIds: ['auto', '1k', '2k', '4k'],
    outputFormats: ['png', 'webp'],
    allowInputDerivedExactSize: true,
  },
  outputMatrix: getOfficialModelPreset('openai-images', 'gpt-image-2')?.outputMatrix ?? [],
};

function modelRepository(): Pick<UserModelConfigRepository, 'get' | 'list'> {
  return {
    async get(profileId, modelId) {
      return profileId === profile.profileId && modelId === modelConfig.modelId ? modelConfig : undefined;
    },
    async list(profileId) {
      return profileId === profile.profileId ? [modelConfig] : [];
    },
  };
}

function createBackendHarness(profileValue: ProviderProfile = profile) {
  const registry = createProviderRegistry();
  registerBuiltins(registry);
  const materializeOutput = vi.fn<ProviderGenerationBackendDependencies['materializeOutput']>(async () => ([{
    kind: 'hostObject',
    ref: 'output-1',
    mimeType: 'image/png',
  }]));
  const afterTerminal = vi.fn<ProviderGenerationBackendDependencies['afterTerminal']>(async () => undefined);
  const preferences: Pick<ModelGenerationPreferenceRepository, 'get'> = {
    async get() {
      return undefined;
    },
  };
  const backend = createProviderGenerationBackend({
    profileRepository: {
      async get(profileId) {
        return profileId === profileValue.profileId ? profileValue : undefined;
      },
    },
    providerRegistry: registry,
    userModelConfigRepository: modelRepository(),
    modelGenerationPreferenceRepository: preferences,
    materializeOutput,
    afterTerminal,
    now: () => '2026-07-18T00:01:00.000Z',
  });
  return { backend, materializeOutput, afterTerminal };
}

function command(task = runningTask()): GenerationCommand {
  return {
    taskId: task.taskId,
    backendId: PROVIDER_GENERATION_BACKEND_ID,
    payload: {
      profileId: profile.profileId,
      operation: 'text_to_image',
      request: {
        prompt: task.prompt,
        providerOptions: { model: modelConfig.modelId, quality: 'high' },
      },
      runningTask: task,
    },
  };
}

describe('GenerationBackend admission contract', () => {
  it('rejects secret, binary, and mutable caller payloads before publication', () => {
    expect(() => normalizeGenerationCommand({
      taskId: 'task-a',
      backendId: 'fake',
      payload: { apiKey: 'sk_abcdefgh' },
    })).toThrow();
    expect(() => normalizeGenerationCommand({
      taskId: 'task-a',
      backendId: 'fake',
      payload: { bytes: new Uint8Array([1, 2, 3]) },
    })).toThrow();

    const payload = { nested: { value: 'before' } };
    const normalized = normalizeGenerationCommand({
      taskId: 'task-a',
      backendId: 'fake',
      payload,
    });
    payload.nested.value = 'after';
    expect(normalized.payload).toEqual({ nested: { value: 'before' } });
    expect(Object.isFrozen(normalized.payload)).toBe(true);
    expect(Object.isFrozen(normalized.payload.nested)).toBe(true);
  });

  it('normalizes Provider admission to exact frozen execution input and lane cap 2', async () => {
    const { backend } = createBackendHarness();
    const source = command();
    const admitted = await admitGeneration(backend, source);
    const input = providerExecutionInput(admitted);

    expect(admitted.taskId).toBe(source.taskId);
    expect(admitted.backendId).toBe(PROVIDER_GENERATION_BACKEND_ID);
    expect(admitted.execution.workflow).toBe('provider-generate');
    expect(Object.keys(admitted.execution.input)).toEqual(['implementationId', 'profileId', 'request']);
    expect(input).toMatchObject({
      implementationId: 'image-endpoint',
      profileId: profile.profileId,
      request: {
        operation: 'text_to_image',
        prompt: 'contract prompt',
        model: {
          modelId: modelConfig.wireModelId,
          requestStrategyId: modelConfig.requestStrategyId,
        },
        capabilityModelId: modelConfig.baseModelId,
        providerOptions: { quality: 'high' },
      },
    });
    expect(JSON.stringify(input)).not.toContain('__clientTaskId');
    expect(JSON.stringify(input)).not.toContain('__clientRoundId');
    expect(admitted.lane).toEqual({
      key: `provider:${profile.profileId}`,
      maxConcurrency: PROVIDER_PROFILE_LANE_MAX_CONCURRENCY,
    });
    expect(admitted.retry).toEqual({ allowed: true });
    expect(admitted.runningTask.latestJobId).toBeUndefined();
    expect(admitted.runningTask.execution).toEqual({
      backend: { id: 'provider', label: 'Provider' },
      connection: { id: profile.profileId, label: profile.displayName },
      target: { id: modelConfig.modelId, label: 'GPT Image 2' },
    });
    expect(Object.isFrozen(admitted)).toBe(true);
    expect(Object.isFrozen(input.request)).toBe(true);
  });

  it('rejects admission when no configured model id is available', async () => {
    const { backend } = createBackendHarness();
    const task = {
      ...runningTask('task-no-model'),
      execution: {
        backend: { id: 'provider', label: 'Provider' },
        connection: { id: profile.profileId, label: profile.displayName },
      },
    } as const;

    await expect(admitGeneration(backend, {
      taskId: task.taskId,
      backendId: PROVIDER_GENERATION_BACKEND_ID,
      payload: {
        profileId: profile.profileId,
        operation: 'text_to_image',
        request: {
          prompt: task.prompt,
        },
        runningTask: task,
      },
    })).rejects.toThrow(`Provider profile "${profile.profileId}" has no configured model for admission.`);
  });

  it('ignores a legacy profile-level enabled value during admission and readiness', async () => {
    const legacyDisabled = { ...profile, enabled: false } as ProviderProfile & { readonly enabled: boolean };
    await expect(admitGeneration(createBackendHarness(legacyDisabled).backend, command())).resolves.toBeDefined();

    let current: ProviderProfile = legacyDisabled;
    const harness = createBackendHarness();
    const dependencies = harness.backend;
    const admitted = await admitGeneration(dependencies, command());
    const registry = createProviderRegistry();
    registerBuiltins(registry);
    const readinessBackend = createProviderGenerationBackend({
      profileRepository: { async get() { return current; } },
      providerRegistry: registry,
      userModelConfigRepository: modelRepository(),
      modelGenerationPreferenceRepository: { async get() { return undefined; } },
      materializeOutput: async () => [],
      afterTerminal: async () => undefined,
    });
    await expect(readinessBackend.checkReadiness(admitted)).resolves.toEqual({ status: 'ready' });
  });

  it('rejects readiness when current profile maps to another implementation', async () => {
    const admitted = await admitGeneration(createBackendHarness().backend, command());
    const changedProfile: ProviderProfile = {
      ...profile,
      apiFormat: 'gemini-generate-content',
    };
    const registry = createProviderRegistry();
    registerBuiltins(registry);
    const backend = createProviderGenerationBackend({
      profileRepository: { async get() { return changedProfile; } },
      providerRegistry: registry,
      userModelConfigRepository: modelRepository(),
      modelGenerationPreferenceRepository: { async get() { return undefined; } },
      materializeOutput: async () => [],
      afterTerminal: async () => undefined,
    });

    await expect(backend.checkReadiness(admitted)).resolves.toMatchObject({
      status: 'reject',
      error: {
        category: 'validation',
        details: {
          admittedImplementationId: 'image-endpoint',
          currentImplementationId: 'gemini-generate-content',
        },
      },
    });
  });

  it('projects terminal output, runs follow-up separately, and reconstructs frozen retry', async () => {
    const { backend, materializeOutput, afterTerminal } = createBackendHarness();
    const admitted = await admitGeneration(backend, command());
    const runningWithJob: TaskRecord = {
      ...admitted.runningTask,
      latestJobId: 'job-1',
    };
    const completedJob = {
      id: 'job-1',
      status: 'completed',
      input: admitted.execution.input,
      output: { image: { assets: [] } },
      error: undefined,
      createdAt,
      updatedAt: '2026-07-18T00:02:00.000Z',
    } as const;
    const terminal = await backend.projectTerminal({
      admitted,
      job: completedJob,
      runningTask: runningWithJob,
    });
    expect(terminal).toMatchObject({
      taskId: admitted.taskId,
      status: 'completed',
      latestJobId: completedJob.id,
      outputs: [{ asset: { ref: { ref: 'output-1' } } }],
    });
    expect(materializeOutput).toHaveBeenCalledOnce();
    expect(afterTerminal).not.toHaveBeenCalled();
    await backend.afterTerminal?.({ admitted, job: completedJob, task: terminal });
    expect(afterTerminal).toHaveBeenCalledWith(expect.objectContaining({
      profileId: profile.profileId,
      implementationId: 'image-endpoint',
    }));

    const failedTask: TaskRecord = {
      ...terminal,
      status: 'failed',
      outputs: [],
      error: { category: 'provider', message: 'failed' },
    };
    const failedJob = {
      ...completedJob,
      status: 'failed',
      output: undefined,
      error: { category: 'provider', message: 'failed' },
    } as const;
    const retry = await backend.retry?.({ task: failedTask, latestJob: failedJob });
    expect(retry).toBeDefined();
    expect(retry?.taskId).toBe(failedTask.taskId);
    expect(retry?.runningTask.latestJobId).toBeUndefined();
    expect(Object.isFrozen(retry)).toBe(true);
    expect(Object.keys(retry?.execution.input ?? {})).toEqual(['implementationId', 'profileId', 'request']);
  });

  it('reconstructs Provider retry Mask from Task Edit Region instead of latest Job input', async () => {
    const { backend } = createBackendHarness();
    const task: TaskRecord = {
      ...runningTask('task-mask-retry'),
      operation: 'image-edit',
      attachments: [{
        kind: 'photoshop-layer',
        attachmentId: 'primary',
        asset: { ref: { kind: 'hostObject', ref: 'primary-image', mimeType: 'image/png' } },
      }],
      editRegion: {
        targetAttachmentId: 'primary',
        source: { kind: 'photoshop-user-layer-mask', documentId: 42, layerId: 7 },
        geometry: { sourceBounds: { left: 0, top: 0, right: 100, bottom: 100 }, targetWidth: 100, targetHeight: 100 },
        mask: { ref: { kind: 'hostObject', ref: 'task-mask', mimeType: 'image/png' }, width: 100, height: 100 },
        encoding: 'grayscale-png',
        bitDepth: 8,
        polarity: 'white-edit',
      },
    };
    const admitted = await backend.admit({
      taskId: task.taskId,
      backendId: PROVIDER_GENERATION_BACKEND_ID,
      payload: {
        profileId: profile.profileId,
        operation: 'image_edit',
        request: {
          prompt: task.prompt,
          images: [{ storedRef: { kind: 'hostObject', ref: 'primary-image', mimeType: 'image/png' } }],
          inputContext: { primaryEditInput: { width: 100, height: 100 } },
          primaryAttachmentId: 'primary',
          maskImage: {
            asset: { storedRef: { kind: 'hostObject', ref: 'stale-job-mask', mimeType: 'image/png' } },
            targetAttachmentId: 'primary',
            dimensions: { width: 100, height: 100 },
            encoding: 'grayscale-png',
            bitDepth: 8,
            polarity: 'white-edit',
          },
          providerOptions: { model: modelConfig.modelId },
        },
        runningTask: task,
      },
    });
    const failedTask: TaskRecord = {
      ...admitted.runningTask,
      status: 'failed',
      latestJobId: 'job-mask-retry',
      outputs: [],
      error: { category: 'provider', message: 'failed' },
      finishedAt: '2026-07-18T00:02:00.000Z',
    };
    const retry = await backend.retry?.({
      task: failedTask,
      latestJob: {
        id: 'job-mask-retry',
        status: 'failed',
        input: admitted.execution.input,
        output: undefined,
        error: { category: 'provider', message: 'failed' },
        createdAt,
        updatedAt: '2026-07-18T00:02:00.000Z',
      },
    });

    expect(providerExecutionInput(retry!)).toMatchObject({
      request: {
        primaryAttachmentId: 'primary',
        maskImage: {
          asset: { storedRef: { kind: 'hostObject', ref: 'task-mask', mimeType: 'image/png' } },
          targetAttachmentId: 'primary',
          dimensions: { width: 100, height: 100 },
          encoding: 'grayscale-png',
          bitDepth: 8,
          polarity: 'white-edit',
        },
      },
    });
    expect(retry?.runningTask.editRegion).toEqual(task.editRegion);
  });
});
