import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Asset, Job } from '@imagen-ps/application';
import { AppServicesProvider } from '../../../../src/app-services/app-services-context';
import {
  derivePlacementIntent,
  useConversation,
  type ConversationAttachment,
  type ConversationController,
} from '../../../../src/shared/ui/hooks/use-conversation';
import { useImagenSession } from '../../../../src/shared/ui/hooks/use-imagen-session';
import { createFakeServices, fakeAsset, fakeHostImage, fakeOutputAsset, fakeProviderInputAsset } from '../../../helpers/fakes';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  vi.useRealTimers();
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

function completedJobWithAssets(id: string, input: Record<string, unknown>, assets: readonly Asset[]): Job {
  return {
    id,
    status: 'completed',
    input,
    output: {
      image: {
        assets,
        text: '[operation=text_to_image] [model=mock-image-v1] [prompt=make an image]',
      },
    },
    error: undefined,
    createdAt: '2026-06-15T00:00:00.000Z',
    updatedAt: '2026-06-15T00:00:01.000Z',
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve;
  });
  return { promise, resolve };
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

async function waitForExpectation(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => window.setTimeout(resolve, 0));
      });
    }
  }
  throw lastError;
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
      kind: 'exact-frame',
      documentId: 42,
      placementRect: { left: 0, top: 0, right: 128, bottom: 128 },
    });
    expect(derivePlacementIntent([layerAttachment])).toMatchObject({
      kind: 'exact-frame',
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
    expect(spies.submitJob).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'provider-generate',
      input: expect.objectContaining({
        __clientTaskId: expect.any(String),
        profileId: 'mock-profile',
        prompt: 'make an image',
        providerOptions: { model: 'mock-image-v1' },
      }),
      signal: expect.any(AbortSignal),
    }));
    expect(controller!.rounds[0]?.status).toBe('ok');
    expect(controller!.rounds[0]?.previews[0]?.asset.name).toBe('result.png');
  });

  it('maps provider text into session-only round text with mock app context', async () => {
    const { services } = createFakeServices();
    services.commands.submitJob = vi.fn(async (input: { input: Record<string, unknown> }) => ({
      ok: true as const,
      value: {
        id: 'job-text',
        status: 'completed',
        input: input.input,
        output: {
          image: {
            assets: [fakeOutputAsset],
            text: '[operation=text_to_image] [model=mock-image-v1] [prompt=make an ...]',
          },
        },
        error: undefined,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      } satisfies Job,
    }));
    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        operation: 'text-to-image',
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerId: 'mock',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
        output: {
          count: 1,
          requestOutput: {
            kind: 'image-endpoint',
            size: '3840x2160',
            outputFormat: 'webp',
          },
        },
        providerInputSizePreset: '1k',
      });
    });

    expect(getController().rounds[0]?.responseText).toContain('[operation=text_to_image] [model=mock-image-v1]');
    expect(getController().rounds[0]?.responseText).toContain('[app.output=image-endpoint providerInputSize=1k]');
    expect(getController().rounds[0]?.responseText).toContain('[app.attachments=0]');
    expect(getController().rounds[0]?.responseText).toContain('[app.placement=unbound]');
  });

  it('creates a running durable task snapshot before provider dispatch', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        operation: 'image-edit',
        prompt: 'edit image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
        attachments: [captureAttachment('capture-1')],
      });
    });

    expect(spies.putTaskRecord).toHaveBeenCalledTimes(1);
    expect(spies.putTaskRecord.mock.invocationCallOrder[0]).toBeLessThan(
      spies.submitJob.mock.invocationCallOrder[0] ?? 0,
    );
    const record = spies.putTaskRecord.mock.calls[0]?.[0];
    expect(record).toMatchObject({
      schemaVersion: 1,
      taskId: getController().rounds[0]?.id,
      status: 'running',
      operation: 'image-edit',
      prompt: 'edit image',
      placement: {
        kind: 'exact-frame',
        sourceSnapshotId: expect.any(String),
      },
      execution: {
        profileId: 'mock-profile',
        profileName: 'Mock Profile',
        modelId: 'mock-image-v1',
      },
      outputs: [],
    });
    expect(record.attachments[0]).toMatchObject({
      kind: 'photoshop-capture',
      attachmentId: 'capture-1',
      asset: { ref: fakeProviderInputAsset.storedRef },
      providerInput: { ref: fakeProviderInputAsset.storedRef },
      evidence: {
        host: 'photoshop',
        snapshotId: expect.stringContaining('capture-1:42:1'),
        document: { documentId: 42, width: 1024, height: 768 },
        placementRect: { left: 0, top: 0, right: 128, bottom: 128 },
      },
    });
    expect(JSON.stringify(record)).not.toContain('ZmFrZS1pbWFnZQ==');
    expect(JSON.stringify(record)).not.toContain('providerOptions');
  });

  it('passes an AbortSignal into submitJob and aborts it on clear', async () => {
    const { services, spies } = createFakeServices();
    let receivedSignal: AbortSignal | undefined;
    let resolveSubmit!: (value: Awaited<ReturnType<typeof services.commands.submitJob>>) => void;
    const pendingSubmit = new Promise<Awaited<ReturnType<typeof services.commands.submitJob>>>((resolve) => {
      resolveSubmit = resolve;
    });
    services.commands.submitJob = vi.fn((input) => {
      receivedSignal = input.signal;
      return pendingSubmit;
    });
    const { getController } = await mountProbe(services);

    await act(async () => {
      void getController().submit({
        operation: 'text-to-image',
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(receivedSignal).toBeInstanceOf(AbortSignal);
    expect(receivedSignal?.aborted).toBe(false);

    act(() => {
      getController().clear();
    });

    expect(receivedSignal?.aborted).toBe(true);
    resolveSubmit({
      ok: true,
      value: {
        id: 'job-aborted',
        status: 'failed',
        input: { _workflowName: 'provider-generate' },
        output: undefined,
        error: { category: 'validation', message: 'Job submission was cancelled.' },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    await act(async () => {
      await pendingSubmit;
    });

    expect(spies.submitJob).not.toHaveBeenCalled();
  });

  it('renders provider output through thumbnail store without keeping inline preview bytes in round state', async () => {
    const { services } = createFakeServices();
    const release = vi.fn();
    services.thumbnails = {
      async getOrCreate(request) {
        expect(request.asset).toEqual(fakeOutputAsset);
        return {
          cacheKey: 'thumb:output-1',
          preview: {
            asset: request.asset,
            url: 'blob:thumb-output-1',
            label: request.label ?? 'result.png',
          },
          release,
        };
      },
      release,
      clear: vi.fn(),
    };
    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        operation: 'text-to-image',
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
      await Promise.resolve();
    });

    await waitForExpectation(() => {
      expect(getController().rounds[0]?.previews[0]).toEqual({
        asset: fakeOutputAsset,
        url: 'blob:thumb-output-1',
        label: 'result.png',
      });
    });
    expect(JSON.stringify(getController().rounds[0]?.previews)).not.toContain('ZmFrZS1pbWFnZQ==');

    act(() => {
      getController().clear();
    });

    expect(release).toHaveBeenCalledWith('thumb:output-1');
  });

  it('aborts in-flight thumbnail work on clear', async () => {
    const { services } = createFakeServices();
    let thumbnailSignal: AbortSignal | undefined;
    services.thumbnails = {
      async getOrCreate(request) {
        thumbnailSignal = request.signal;
        return new Promise(() => undefined);
      },
      release: vi.fn(),
      clear: vi.fn(),
    };
    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        operation: 'text-to-image',
        prompt: 'make an image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
      await Promise.resolve();
    });

    expect(thumbnailSignal).toBeInstanceOf(AbortSignal);
    expect(thumbnailSignal?.aborted).toBe(false);

    act(() => {
      getController().clear();
    });

    expect(thumbnailSignal?.aborted).toBe(true);
  });

  it('does not restart completed-round thumbnail work on running-round elapsed ticks', async () => {
    vi.useFakeTimers();
    const { services } = createFakeServices();
    const preview = deferred<{
      readonly cacheKey: string;
      readonly preview: { readonly asset: Asset; readonly url: string; readonly label: string };
      release(): void;
    }>();
    const getOrCreate = vi.fn(async () => preview.promise);
    services.thumbnails = {
      getOrCreate,
      release: vi.fn(),
      clear: vi.fn(),
    };
    let submitCount = 0;
    let resolveSecondSubmit!: (value: { readonly ok: true; readonly value: Job }) => void;
    const secondSubmit = new Promise<{ readonly ok: true; readonly value: Job }>((resolve) => {
      resolveSecondSubmit = resolve;
    });
    services.commands.submitJob = vi.fn(async (input: { input: Record<string, unknown> }) => {
      submitCount += 1;
      if (submitCount === 2) {
        return secondSubmit;
      }
      return {
        ok: true as const,
        value: completedJobWithAssets('job-preview', input.input, [fakeOutputAsset]),
      };
    });
    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        operation: 'text-to-image',
        prompt: 'first',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
      await Promise.resolve();
    });
    expect(getOrCreate).toHaveBeenCalledTimes(1);

    let secondSubmitPromise: Promise<void> | undefined;
    await act(async () => {
      secondSubmitPromise = getController().submit({
        operation: 'text-to-image',
        prompt: 'second',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        modelId: 'mock-image-v1',
      });
      await Promise.resolve();
    });
    expect(getController().running).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(1000);
      await Promise.resolve();
    });
    preview.resolve({
      cacheKey: 'thumb:output-1',
      preview: { asset: fakeOutputAsset, url: 'blob:thumb-output-1', label: 'result.png' },
      release: vi.fn(),
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(getOrCreate).toHaveBeenCalledTimes(1);
    expect(getController().rounds[0]?.previews[0]?.url).toBe('blob:thumb-output-1');

    resolveSecondSubmit({
      ok: true,
      value: completedJobWithAssets('job-second', {}, []),
    });
    await act(async () => {
      await secondSubmitPromise;
    });
  });

  it('submits image-edit attachments from the ready provider derivative only', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);
    const providerInputRef = {
      kind: 'hostObject' as const,
      ref: 'provider-derivative-1',
      name: 'provider-input.png',
      mimeType: 'image/png',
      byteSize: 7,
    };
    const image = {
      ...fakeHostImage,
      asset: fakeAsset,
      resource: {
        ...fakeHostImage.resource,
        derivatives: {
          ...fakeHostImage.resource.derivatives,
          thumbnail: {
            kind: 'ready' as const,
            role: 'thumbnail' as const,
            previewUrl: 'blob:thumbnail-should-not-submit',
          },
          providerInput: {
            kind: 'ready' as const,
            role: 'provider-input' as const,
            width: 1024,
            height: 1024,
            mimeType: 'image/png',
            storedRef: providerInputRef,
          },
        },
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

    expect(spies.submitJob).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'provider-edit',
      input: expect.objectContaining({
        images: [{
          type: 'image',
          name: 'provider-input.png',
          mimeType: 'image/png',
          storedRef: providerInputRef,
        }],
      }),
      signal: expect.any(AbortSignal),
    }));
    expect(JSON.stringify(spies.submitJob.mock.calls[0]?.[0].input.images)).not.toContain('blob:thumbnail-should-not-submit');
    expect(JSON.stringify(spies.submitJob.mock.calls[0]?.[0].input.images)).not.toContain('ZmFrZS1pbWFnZQ==');
  });

  it('fails clearly before dispatch when an attachment has no ready provider derivative', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);
    const image = {
      ...fakeHostImage,
      resource: {
        ...fakeHostImage.resource,
        derivatives: {
          ...fakeHostImage.resource.derivatives,
          providerInput: {
            kind: 'pending' as const,
            role: 'provider-input' as const,
          },
        },
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

    expect(spies.submitJob).not.toHaveBeenCalled();
    expect(getController().rounds[0]?.status).toBe('err');
    expect(getController().rounds[0]?.errorMessage).toContain('Provider input derivative is not ready');
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

  it('reuses the same provider derivative ref for successful-round image retry', async () => {
    const { services, spies } = createFakeServices();
    const { getController } = await mountProbe(services);

    await act(async () => {
      await getController().submit({
        operation: 'image-edit',
        prompt: 'edit image',
        profileId: 'mock-profile',
        providerName: 'Mock Profile',
        attachments: [{
          id: 'file-1',
          type: 'file',
          name: 'input.png',
          image: fakeHostImage,
          previewUrl: '',
        }],
      });
    });
    const roundId = getController().rounds[0]!.id;

    await act(async () => {
      await getController().retry(roundId);
    });

    expect(spies.submitJob).toHaveBeenCalledTimes(2);
    expect(spies.submitJob.mock.calls[0]?.[0].input.images).toEqual([fakeProviderInputAsset]);
    expect(spies.submitJob.mock.calls[1]?.[0].input.images).toEqual([fakeProviderInputAsset]);
  });

  it('keeps failed-round retry from submitting or calling retryJob', async () => {
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
    // 让 submit 产生一个 failed round（status==='err'）；UI 层负责把失败草稿填回 composer。
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

    expect(services.commands.submitJob).toHaveBeenCalledTimes(1);
    expect(retryJobSpy).not.toHaveBeenCalled();
    expect(getController().rounds).toHaveLength(1);
  });
});
