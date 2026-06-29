import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '@imagen-ps/application';
import { AppServicesProvider } from '../src/app-services/app-services-context';
import {
  derivePlacementIntent,
  useConversation,
  type ConversationAttachment,
  type ConversationController,
} from '../src/shared/ui/hooks/use-conversation';
import { useImagenSession } from '../src/shared/ui/hooks/use-imagen-session';
import { createFakeServices, fakeHostImage } from './fakes';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

function failedJob(input: Record<string, unknown>): Job {
  return {
    id: 'job-failed',
    status: 'failed',
    input,
    output: undefined,
    error: { category: 'provider', message: 'provider failed' },
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:01.000Z',
  };
}

function captureAttachment(id: string, documentId = 42): ConversationAttachment {
  return {
    id,
    type: 'photoshop-capture',
    name: `${id}.png`,
    image: fakeHostImage,
    previewUrl: fakeHostImage.preview.url ?? '',
    photoshopPlacement: {
      snapshot: {
        documentId,
        documentSize: { width: 1024, height: 768 },
        layerId: 1,
        layerBoundsNoEffects: { left: 0, top: 0, right: 128, bottom: 128 },
        selectionBounds: null,
      },
      placementRect: { left: 0, top: 0, right: 128, bottom: 128 },
    },
  };
}

async function mountProbe(services: ReturnType<typeof createFakeServices>['services']): Promise<{
  getController: () => ConversationController;
  container: HTMLDivElement;
}> {
  let controller: ConversationController | undefined;
  function Probe() {
    const session = useImagenSession(services);
    controller = useConversation(services, session);
    return null;
  }
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <AppServicesProvider services={services}>
        <Probe />
      </AppServicesProvider>,
    );
  });
  return { getController: () => controller!, container };
}

describe('useConversation', () => {
  it('derives request-level placement intent from submitted attachments', () => {
    const fileAttachment: ConversationAttachment = {
      id: 'file-1',
      type: 'file',
      name: 'file.png',
      image: fakeHostImage,
      previewUrl: fakeHostImage.preview.url ?? '',
    };
    const layerAttachment: ConversationAttachment = {
      ...captureAttachment('layer-1'),
      type: 'layer',
    };

    expect(derivePlacementIntent([captureAttachment('capture-1')])).toMatchObject({
      kind: 'exact-frame',
      documentId: 42,
      placementRect: { left: 0, top: 0, right: 128, bottom: 128 },
    });
    expect(derivePlacementIntent([captureAttachment('capture-1'), fileAttachment])).toMatchObject({
      kind: 'document-only',
      documentId: 42,
    });
    expect(derivePlacementIntent([layerAttachment])).toMatchObject({
      kind: 'document-only',
      documentId: 42,
    });
    expect(derivePlacementIntent([captureAttachment('capture-1'), captureAttachment('capture-2', 99)])).toEqual({
      kind: 'unbound',
      reason: 'multiple-documents',
    });
    expect(derivePlacementIntent([fileAttachment])).toEqual({ kind: 'unbound', reason: 'no-photoshop-capture' });
  });

  it('submits generation through CommandsPort.submitJob', async () => {
    const { services, spies } = createFakeServices();
    let controller: ConversationController | undefined;

    function Probe() {
      const session = useImagenSession(services);
      controller = useConversation(services, session);
      return null;
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <AppServicesProvider services={services}>
          <Probe />
        </AppServicesProvider>,
      );
    });

    await act(async () => {
      await controller!.submit({
        operation: 'text-to-image',
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
    });

    expect(spies.subscribeJobEvents).toHaveBeenCalledTimes(1);
    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-generate',
      input: expect.objectContaining({
        profileId: 'mock-profile',
        prompt: 'make an image',
        providerOptions: { model: 'mock-image-v1' },
      }),
    });
    expect(controller!.rounds[0]?.status).toBe('ok');
    expect(controller!.rounds[0]?.previews[0]?.asset.name).toBe('result.png');
  });

  it('submits image-edit attachments as hostObject refs instead of inline bytes when available', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);
    const image = {
      ...fakeHostImage,
      asset: {
        type: 'image' as const,
        name: 'picked.png',
        mimeType: 'image/png',
        data: new Uint8Array([1, 2, 3, 4]),
      },
      metadata: {
        ...fakeHostImage.metadata,
        byteSize: 4,
      },
      payload: {
        kind: 'host-object' as const,
        ref: 'memory-asset-1',
      },
    };

    await act(async () => {
      await getController().submit({
        operation: 'image-edit',
        prompt: 'edit image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        attachments: [{
          id: 'file-1',
          type: 'file',
          name: 'picked.png',
          image,
          previewUrl: '',
        }],
      });
    });

    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-edit',
      input: expect.objectContaining({
        images: [{
          type: 'image',
          name: 'picked.png',
          mimeType: 'image/png',
          storedRef: {
            kind: 'hostObject',
            ref: 'memory-asset-1',
            name: 'picked.png',
            mimeType: 'image/png',
            byteSize: 4,
          },
        }],
      }),
    });
  });

  it('blocks same-tick double submit to a single submitJob call (UI ref-gate)', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);

    await act(async () => {
      const a = getController().submit({
        operation: 'text-to-image',
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
      const b = getController().submit({
        operation: 'text-to-image',
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
      await Promise.all([a, b]);
    });

    // 同 tick 双击只穿透一次。
    expect(spies.submitJob).toHaveBeenCalledTimes(1);
    expect(getController().rounds).toHaveLength(1);
  });

  it('releases the submit gate after completion so a later send proceeds', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        operation: 'text-to-image',
        prompt: 'first',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
    });
    await act(async () => {
      await getController().submit({
        operation: 'text-to-image',
        prompt: 'second',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
    });

    // 两次独立、先后 send 各自穿透（锁已释放）。
    expect(spies.submitJob).toHaveBeenCalledTimes(2);
    expect(getController().rounds).toHaveLength(2);
  });

  it('routes a successful-round retry (regenerate) through submitJob, not retryJob', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        operation: 'text-to-image',
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
    });
    expect(getController().rounds[0]?.status).toBe('ok');
    const roundId = getController().rounds[0]!.id;

    await act(async () => {
      await getController().retry(roundId);
    });

    // regenerate → submitJob 路径（不调用 retryJob）。
    expect(spies.submitJob).toHaveBeenCalledTimes(2);
    expect(vi.mocked(services.commands.retryJob)).not.toHaveBeenCalled();
  });

  it('blocks same-tick double retry on a failed round to a single retryJob call', async () => {
    const { services } = createFakeServices();
    const retryJobSpy = vi.fn(async () => ({
      ok: true as const,
      value: {
        id: 'job-retry',
        status: 'completed',
        input: { _workflowName: 'provider-generate' },
        output: { image: { assets: [] } },
        error: undefined,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      } satisfies Job,
    }));
    // 让 submit 产生一个 failed round（status==='err'），retry 走 retryJob 路径。
    services.commands.submitJob = vi.fn(async (input: { input: Record<string, unknown> }) => ({
      ok: true as const,
      value: failedJob(input.input),
    }));
    services.commands.retryJob = retryJobSpy;

    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        operation: 'text-to-image',
        prompt: 'will fail',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
    });
    expect(getController().rounds[0]?.status).toBe('err');
    const roundId = getController().rounds[0]!.id;

    await act(async () => {
      const a = getController().retry(roundId);
      const b = getController().retry(roundId);
      await Promise.all([a, b]);
    });

    // 同 tick 双击 retry 只穿透一次 retryJob。
    expect(retryJobSpy).toHaveBeenCalledTimes(1);
  });
});
