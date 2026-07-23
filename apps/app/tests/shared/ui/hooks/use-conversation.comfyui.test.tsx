import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type {
  ImagenSessionController,
  ImagenSessionSnapshot,
  TaskRecord,
} from '@imagen-ps/application';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ThumbnailRequest, ThumbnailStore } from '../../../../src/shared/image/thumbnail-store';
import type { AppServices } from '../../../../src/shared/ports/app-services';
import {
  type ConversationController,
  useConversation,
} from '../../../../src/shared/ui/hooks/use-conversation';
import type { ImagenSessionBinding } from '../../../../src/shared/ui/hooks/use-imagen-session';
import { createFakeServices, fakeOutputAsset, fakeTaskRecord } from '../../../helpers/fakes';

const EMPTY_SNAPSHOT: ImagenSessionSnapshot = { jobs: [], queuedTasks: [] };

function Probe({ services, binding, onChange }: {
  readonly services: AppServices;
  readonly binding: ImagenSessionBinding;
  readonly onChange: (controller: ConversationController) => void;
}) {
  const controller = useConversation(services, binding);
  useEffect(() => onChange(controller), [controller, onChange]);
  return null;
}

function createSession(onSubmit: (taskId: string) => void): ImagenSessionController {
  return {
    submitJob: vi.fn(async (command) => {
      onSubmit(command.taskId);
      return { ok: true as const, value: { taskId: command.taskId, status: 'queued' as const } };
    }),
    removeQueuedTask: vi.fn(() => false),
    retryJob: vi.fn(async () => ({
      ok: false as const,
      error: { category: 'validation' as const, message: 'retry unavailable' },
    })),
    getSnapshot: vi.fn(() => EMPTY_SNAPSHOT),
    subscribe: vi.fn(() => () => undefined),
    dispose: vi.fn(),
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('useConversation ComfyUI previews', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('uses terminal Task output when completed Job output is empty', async () => {
    let submittedTaskId = '';
    const session = createSession((taskId) => { submittedTaskId = taskId; });
    const getOrCreate = vi.fn(async (request: ThumbnailRequest) => ({
      cacheKey: 'task-output',
      preview: {
        asset: request.asset,
        url: 'blob:task-output-preview',
        label: request.label ?? 'Asset',
        transparencyState: 'unknown' as const,
      },
      release: vi.fn(),
    }));
    const thumbnails: ThumbnailStore = {
      getOrCreate,
      release: vi.fn(),
      clear: vi.fn(),
    };
    const fake = createFakeServices();
    const services: AppServices = { ...fake.services, thumbnails };
    const getTaskRecord = vi.spyOn(services.commands, 'getTaskRecord');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let controller: ConversationController | undefined;
    const onChange = (value: ConversationController): void => { controller = value; };

    await act(async () => {
      root.render(<Probe services={services} binding={{ session, snapshot: EMPTY_SNAPSHOT }} onChange={onChange} />);
      await flush();
    });
    await act(async () => {
      await controller!.submit({
        backendId: 'comfyui',
        operation: 'text-to-image',
        prompt: 'fallback preview',
        providerName: 'ComfyUI',
        selectedWorkflowId: 'workflow-edit',
        workflowName: '图片编辑测试',
      });
    });

    const terminalTask: TaskRecord = {
      ...fakeTaskRecord,
      taskId: submittedTaskId,
      latestJobId: 'job-comfy',
      execution: {
        backend: { id: 'comfyui', label: 'ComfyUI' },
        target: { id: 'workflow-edit', label: '图片编辑测试' },
      },
      outputs: [{
        ...fakeTaskRecord.outputs[0]!,
        outputId: `${submittedTaskId}:output:0`,
        asset: { ref: fakeOutputAsset.storedRef! },
      }],
    };
    getTaskRecord.mockResolvedValue(terminalTask);
    const completed: ImagenSessionSnapshot = {
      queuedTasks: [],
      jobs: [{
        id: 'job-comfy',
        taskId: submittedTaskId,
        type: 'generate',
        status: 'completed',
        phase: 'completed',
        canRetry: false,
        canCancel: false,
        output: {},
      }],
    };

    await act(async () => {
      root.render(<Probe services={services} binding={{ session, snapshot: completed }} onChange={onChange} />);
      await flush();
    });
    await vi.waitFor(() => {
      expect(controller?.rounds[0]?.previews[0]?.url).toBe('blob:task-output-preview');
    });

    expect(getTaskRecord).toHaveBeenCalledWith(submittedTaskId);
    expect(getOrCreate).toHaveBeenCalledWith(expect.objectContaining({
      asset: expect.objectContaining({ storedRef: fakeOutputAsset.storedRef }),
    }));
    expect(controller?.rounds[0]).toMatchObject({
      id: submittedTaskId,
      jobId: 'job-comfy',
      status: 'ok',
      previews: [{ url: 'blob:task-output-preview' }],
    });

    await act(async () => { root.unmount(); });
  });

  it('keeps completed round successful when terminal Task lookup rejects', async () => {
    let submittedTaskId = '';
    const session = createSession((taskId) => { submittedTaskId = taskId; });
    const fake = createFakeServices();
    vi.spyOn(fake.services.commands, 'getTaskRecord').mockRejectedValue(new Error('task store unavailable'));
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root: Root = createRoot(container);
    let controller: ConversationController | undefined;
    const onChange = (value: ConversationController): void => { controller = value; };

    await act(async () => {
      root.render(<Probe services={fake.services} binding={{ session, snapshot: EMPTY_SNAPSHOT }} onChange={onChange} />);
      await flush();
    });
    await act(async () => {
      await controller!.submit({
        backendId: 'comfyui',
        operation: 'text-to-image',
        prompt: 'lookup rejection',
        providerName: 'ComfyUI',
        selectedWorkflowId: 'workflow-edit',
        workflowName: '图片编辑测试',
      });
      root.render(<Probe services={fake.services} binding={{
        session,
        snapshot: {
          queuedTasks: [],
          jobs: [{
            id: 'job-comfy',
            taskId: submittedTaskId,
            type: 'generate',
            status: 'completed',
            canRetry: false,
            canCancel: false,
            output: {},
          }],
        },
      }} onChange={onChange} />);
      await flush();
    });

    expect(controller?.rounds[0]).toMatchObject({ status: 'ok', previews: [] });
    await act(async () => { root.unmount(); });
  });
});
