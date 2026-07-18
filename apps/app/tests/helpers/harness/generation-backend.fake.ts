import type {
  AdmittedGeneration,
  GenerationBackend,
  GenerationCommand,
  TaskOutput,
  TaskRecord,
} from '@imagen-ps/application';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function admittedFrom(command: GenerationCommand): AdmittedGeneration {
  const payload = command.payload;
  const runningTask = payload.runningTask as TaskRecord;
  const profileId = String(payload.profileId ?? 'mock-profile');
  const request = isRecord(payload.request) ? payload.request : {};
  const operation = payload.operation === 'image_edit' ? 'image_edit' : 'text_to_image';
  return {
    taskId: command.taskId,
    backendId: command.backendId,
    execution: {
      workflow: operation === 'image_edit' ? 'provider-edit' : 'provider-generate',
      input: {
        implementationId: 'mock',
        profileId,
        request: { operation, ...request },
      },
    },
    runningTask,
    lane: { key: `${command.backendId}:${profileId}`, maxConcurrency: 2 },
    retry: { allowed: true },
  };
}

function outputsFromJob(taskId: string, output: unknown): readonly TaskOutput[] {
  if (!isRecord(output) || !isRecord(output.image) || !Array.isArray(output.image.assets)) return [];
  return output.image.assets.flatMap((asset, index) => {
    if (!isRecord(asset) || !isRecord(asset.storedRef)) return [];
    return [{
      outputId: `${taskId}:output:${index}`,
      index,
      kind: 'image' as const,
      asset: { ref: asset.storedRef as TaskOutput['asset']['ref'] },
    }];
  });
}

/** 创建 App deterministic suites 使用的 non-Provider policy fake。 */
export function createGenerationBackendFake(): GenerationBackend {
  return {
    id: 'provider',
    async admit(command) {
      return admittedFrom(command);
    },
    async checkReadiness() {
      return { status: 'ready' };
    },
    async projectTerminal({ job, runningTask }) {
      const base = {
        ...runningTask,
        latestJobId: job.id,
        updatedAt: job.updatedAt,
        finishedAt: job.updatedAt,
      };
      return job.status === 'completed'
        ? { ...base, status: 'completed', outputs: outputsFromJob(runningTask.taskId, job.output) }
        : {
            ...base,
            status: 'failed',
            outputs: [],
            error: job.error ?? { category: 'runtime', message: 'Generation failed.' },
          };
    },
    async retry({ task, latestJob }) {
      const now = new Date().toISOString();
      const request = isRecord(latestJob.input.request) ? latestJob.input.request : {};
      const {
        error: _error,
        finishedAt: _finishedAt,
        latestJobId: _latestJobId,
        ...retryBase
      } = task;
      return admittedFrom({
        taskId: task.taskId,
        backendId: 'provider',
        payload: {
          profileId: String(latestJob.input.profileId ?? task.execution?.connection?.id ?? 'mock-profile'),
          operation: task.operation === 'image-edit' ? 'image_edit' : 'text_to_image',
          request,
          runningTask: {
            ...retryBase,
            status: 'running',
            outputs: [],
            updatedAt: now,
          },
        },
      });
    },
  };
}
