import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComfyUiWorkflowConfig, TaskRecord } from '@imagen-ps/application';
import { createHostImageAsset } from '../../../../src/shared/domain/host-image-asset';
import type { CanonicalMaskAsset } from '../../../../src/shared/domain/mask-source';
import { createMemoryThumbnailStore } from '../../../../src/shared/image/thumbnail-store';
import {
  useConversation,
  type ConversationAttachment,
  type ConversationController,
} from '../../../../src/shared/ui/hooks/use-conversation';
import type { ImagenSessionBinding } from '../../../../src/shared/ui/hooks/use-imagen-session';
import { fakeOutputAsset, fakeOutputBytes } from '../../../helpers/fixtures/assets.fixtures';
import { fakeTaskRecord } from '../../../helpers/fixtures/task.fixtures';
import { createFakeServices } from '../../../helpers/harness/create-fake-services';

let root: Root | undefined;
let controller: ConversationController | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
}

function storedImage(ref: string) {
  return createHostImageAsset({
    type: 'image',
    name: `${ref}.png`,
    mimeType: 'image/png',
    storedRef: { kind: 'hostObject', ref, name: `${ref}.png`, mimeType: 'image/png' },
  }, {
    source: 'layer',
    width: 512,
    height: 512,
  });
}

function HookHarness({
  services,
  binding,
}: {
  readonly services: ReturnType<typeof createFakeServices>['services'];
  readonly binding: ImagenSessionBinding;
}) {
  const value = useConversation(services, binding);
  useEffect(() => {
    controller = value;
  }, [value]);
  return null;
}

describe('useConversation ComfyUI submission', () => {
  afterEach(async () => {
    if (root) {
      await act(async () => root!.unmount());
    }
    root = undefined;
    controller = undefined;
    document.body.innerHTML = '';
  });

  it('submits ordered stored inputs, canonical mask evidence, and existing placement through one backend', async () => {
    const submitJob = vi.fn(async () => ({ ok: true, value: { id: 'job-a' } }));
    const binding = {
      snapshot: { jobs: [], queuedTasks: [] },
      session: { submitJob },
    } as unknown as ImagenSessionBinding;
    const { services } = createFakeServices();
    const image = storedImage('image-a');
    const maskImage = storedImage('mask-a');
    const mask: CanonicalMaskAsset = {
      ...maskImage,
      canonicalMask: { encoding: 'grayscale', bitDepth: 8, size: { width: 512, height: 512 } },
    };
    const attachment: ConversationAttachment = {
      id: 'capture-a',
      type: 'photoshop-capture',
      name: 'capture.png',
      image,
      mask,
      previewUrl: '',
    };
    const workflow = {
      workflowId: 'workflow-a',
      displayName: 'Edit workflow',
      connectionId: 'connection-a',
      source: { kind: 'frontend-workflow', remotePath: 'imagen/edit.json' },
      contract: {
        schemaVersion: 1,
        operation: 'image-edit',
        entries: [
          { role: 'prompt', slot: 0, required: true, dataType: 'text', locator: { nodeId: 'prompt', fieldName: 'text' } },
          { role: 'image', slot: 0, required: true, dataType: 'image', locator: { nodeId: 'image', fieldName: 'image' } },
          { role: 'mask', slot: 0, required: false, dataType: 'mask', maskEncoding: 'grayscale', locator: { nodeId: 'mask', fieldName: 'mask' } },
          { role: 'output-image', slot: 0, required: true, dataType: 'image', locator: { nodeId: 'output', fieldName: 'images' } },
        ],
      },
    } as ComfyUiWorkflowConfig;
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<HookHarness services={services} binding={binding} />);
    });
    if (!controller) throw new Error('Conversation hook did not mount.');

    await act(async () => {
      await controller!.submit({
        backendId: 'comfyui',
        operation: 'image-edit',
        prompt: 'edit this image',
        providerName: 'ComfyUI',
        workflow,
        connection: { connectionId: 'connection-a', displayName: 'Studio ComfyUI' },
        attachments: [attachment],
        mask,
      });
    });

    expect(submitJob).toHaveBeenCalledTimes(1);
    const submitted = submitJob.mock.calls[0]?.[0];
    expect(submitted).toMatchObject({
      backendId: 'comfyui',
      payload: {
        workflowId: 'workflow-a',
        prompt: 'edit this image',
        images: [{ storedRef: { ref: 'image-a' }, width: 512, height: 512 }],
        mask: { storedRef: { ref: 'mask-a' }, width: 512, height: 512 },
        runningTask: {
          operation: 'image-edit',
          placement: { kind: 'unbound', reason: 'no-photoshop-source' },
          execution: {
            backend: { id: 'comfyui', label: 'ComfyUI' },
            connection: { id: 'connection-a', label: 'Studio ComfyUI' },
            target: { id: 'workflow-a', label: 'Edit workflow' },
          },
        },
      },
    });
    expect(submitted?.payload.runningTask.attachments).toHaveLength(2);
    expect(submitted?.payload.runningTask.attachments[1]).toMatchObject({
      kind: 'selection-mask',
      executionInput: { ref: { ref: 'mask-a' }, width: 512, height: 512 },
    });
  });

  it('does not replace a materialized preview when durable Task output arrives later', async () => {
    const taskRecord = deferred<TaskRecord | undefined>();
    const submitJob = vi.fn(async () => ({ ok: true, value: { id: 'job-a' } }));
    const initialBinding = {
      snapshot: { jobs: [], queuedTasks: [] },
      session: { submitJob },
    } as unknown as ImagenSessionBinding;
    const fake = createFakeServices();
    const services = {
      ...fake.services,
      commands: {
        ...fake.services.commands,
        getTaskRecord: vi.fn(() => taskRecord.promise),
      },
      thumbnails: createMemoryThumbnailStore({
        async resolveStoredRef() {
          return fakeOutputBytes.buffer.slice(0);
        },
      }),
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root!.render(<HookHarness services={services} binding={initialBinding} />);
    });
    if (!controller) throw new Error('Conversation hook did not mount.');
    await act(async () => {
      await controller!.submit({
        operation: 'text-to-image',
        prompt: 'keep the rendered preview',
        profileId: 'profile-a',
        providerName: 'Provider',
      });
    });
    const roundId = controller.rounds[0]?.id;
    if (!roundId) throw new Error('Conversation round was not created.');
    const completedBinding = {
      snapshot: {
        jobs: [{
          id: 'job-a',
          taskId: roundId,
          type: 'generate',
          status: 'completed',
          phase: 'completed',
          canRetry: false,
          canCancel: false,
          output: { image: { assets: [fakeOutputAsset] } },
        }],
        queuedTasks: [],
      },
      session: initialBinding.session,
    } as unknown as ImagenSessionBinding;
    await act(async () => {
      root!.render(<HookHarness services={services} binding={completedBinding} />);
      await Promise.resolve();
      await Promise.resolve();
    });
    const materializedUrl = controller.rounds[0]?.previews[0]?.url;
    expect(materializedUrl).toBeTruthy();

    await act(async () => {
      taskRecord.resolve({ ...fakeTaskRecord, taskId: roundId });
      await taskRecord.promise;
      await Promise.resolve();
    });

    expect(controller.rounds[0]?.previews[0]?.url).toBe(materializedUrl);
  });
});
