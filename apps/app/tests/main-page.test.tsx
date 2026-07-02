import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/shared/ui/app-shell';
import { fakeHostImage, fakeOptimizerProfile, fakeOutputAsset, fakeProfile, fakeProviderInputAsset } from './fakes';
import { createFakeServices } from './fakes';
import { MOTION_DURATION } from '../src/shared/ui/motion';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderApp(container: HTMLElement, services = createFakeServices()) {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <AppShell
        host={{
          kind: 'photoshop-uxp',
          app: { stage: 'uxp-first-shell', host: 'photoshop-uxp', services: ['commands', 'host'] },
          locale: 'zh-CN',
          services: services.services,
          dispose: () => undefined,
        }}
      />,
    );
  });
  await flush();
  await flush();
  return services;
}

function changeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

async function sendPrompt(container: HTMLElement, prompt: string): Promise<void> {
  await act(async () => {
    changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, prompt);
  });
  await act(async () => {
    container.querySelector<HTMLElement>('[data-testid="composer-send-button"]')!.click();
  });
  await flush();
}

function clickText(container: HTMLElement, selector: string, text: string): void {
  const element = Array.from(container.querySelectorAll<HTMLElement>(selector)).find((item) =>
    item.textContent?.includes(text),
  );
  if (!element) {
    throw new Error(`找不到包含文本的元素: ${text}`);
  }
  element.click();
}

function findIconInHost(button: Element, selector: string): Element | null {
  const host = button.closest('.ui-icon-button-host');
  return host?.querySelector(selector) ?? null;
}

describe('MainPage contract', () => {
  it('无 attachment 时提交 provider-generate', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await sendPrompt(container, 'make an image');

    expect(spies.submitJob).toHaveBeenCalledWith(expect.objectContaining({
      workflow: 'provider-generate',
      input: expect.objectContaining({
        prompt: 'make an image',
        profileId: 'mock-profile',
        output: {
          count: 1,
          sizePreset: '2k',
          outputFormat: 'png',
          aspectRatio: 'auto',
        },
      }),
    }));
  });

  it('file attachment 只能经 HostBridge 读取，并提交 provider-edit', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从电脑上传');
    });
    await flush();
    await sendPrompt(container, 'edit uploaded image');

    expect(spies.pickImageFile).toHaveBeenCalledTimes(1);
    expect(spies.readLayerAsAsset).not.toHaveBeenCalled();
    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-edit',
      input: expect.objectContaining({
        prompt: 'edit uploaded image',
        images: [fakeProviderInputAsset],
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it('JPEG file attachment follows the same main success path and submits the provider derivative only', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.pickImageFile.mockResolvedValueOnce({
      ...fakeHostImage,
      asset: {
        ...fakeProviderInputAsset,
        name: 'picked.JPG',
        mimeType: 'image/jpeg',
      },
      metadata: {
        ...fakeHostImage.metadata,
        name: 'picked.JPG',
        mimeType: 'image/jpeg',
      },
      resource: {
        ...fakeHostImage.resource,
        original: {
          ...fakeHostImage.resource.original,
          name: 'picked.JPG',
          mimeType: 'image/jpeg',
        },
      },
    });
    const { spies } = await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从电脑上传');
    });
    await flush();
    await sendPrompt(container, 'edit uploaded jpeg');

    expect(spies.pickImageFile).toHaveBeenCalledTimes(1);
    expect(spies.readLayerAsAsset).not.toHaveBeenCalled();
    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-edit',
      input: expect.objectContaining({
        prompt: 'edit uploaded jpeg',
        images: [fakeProviderInputAsset],
      }),
      signal: expect.any(AbortSignal),
    });
    expect(JSON.stringify(spies.submitJob.mock.calls[0]?.[0].input.images)).not.toContain('picked.JPG');
    expect(JSON.stringify(spies.submitJob.mock.calls[0]?.[0].input.images)).not.toContain('image/jpeg');
  });

  it('preserves Photoshop placement evidence on local-file attachments when host provides it', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.pickImageFile.mockResolvedValueOnce({
      ...fakeHostImage,
      photoshopPlacement: {
        snapshot: {
          documentId: 42,
          documentSize: { width: 1024, height: 768 },
          layerId: 1,
          layerBoundsNoEffects: { left: 10, top: 20, right: 266, bottom: 276 },
          selectionBounds: { left: 10, top: 20, right: 266, bottom: 276 },
        },
        placementRect: { left: 10, top: 20, right: 266, bottom: 276 },
      },
    });
    const { spies } = await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从电脑上传');
    });
    await flush();
    await sendPrompt(container, 'edit bound local file');

    expect(spies.putTaskRecord).toHaveBeenCalledWith(expect.objectContaining({
      placement: {
        kind: 'exact-frame',
        sourceSnapshotId: expect.any(String),
      },
    }));
  });

  it('add attachment button does not inject a nested icon background wrapper', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    const addButton = container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]');
    expect(addButton).not.toBeNull();
    expect(findIconInHost(addButton!, '.cmp-add-icon-bg')).toBeNull();
  });

  it('upload option shows the Chrome local file limitation before picker selection', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await flush();

    const option = container.querySelector<HTMLElement>('[data-testid="attach-upload-option"]');
    expect(option?.textContent).toContain('PNG / JPG / WebP');
    expect(option?.textContent).toContain('部分尺寸用 Capture / Layer');
  });

  it('layer attachment 只能经 HostBridge 读取，并提交 provider-edit', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从 PS 图层选择');
    });
    await act(async () => {
      clickText(container, '.layer-item', 'Layer 1');
    });
    await flush();
    await sendPrompt(container, 'edit layer image');

    expect(spies.readLayerAsAsset).toHaveBeenCalledWith(1, { maxSide: 1024 });
    expect(spies.pickImageFile).not.toHaveBeenCalled();
    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-edit',
      input: expect.objectContaining({
        prompt: 'edit layer image',
        images: [fakeProviderInputAsset],
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it('opening the Photoshop layer picker refreshes host layers', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    expect(spies.listLayers).toHaveBeenCalledTimes(1);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从 PS 图层选择');
    });
    await flush();

    expect(spies.listLayers).toHaveBeenCalledTimes(2);
  });

  it('Capture materializes Photoshop attachment and submits provider-edit', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await sendPrompt(container, 'edit captured image');

    expect(spies.captureActiveImage).toHaveBeenCalledTimes(1);
    expect(spies.captureActiveImage).toHaveBeenCalledWith({ maxSide: 1024 });
    expect(spies.readLayerAsAsset).not.toHaveBeenCalled();
    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-edit',
      input: expect.objectContaining({
        prompt: 'edit captured image',
        images: [fakeProviderInputAsset],
      }),
      signal: expect.any(AbortSignal),
    });
  });

  it('uses global generation settings for output payload and provider input resize', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      generationSettings: {
        outputSizePreset: '4k',
        outputFormat: 'webp',
        aspectRatio: '16:9',
        providerInputSizePreset: '1k',
      },
    });
    const { spies } = await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await sendPrompt(container, 'edit captured image');

    expect(spies.captureActiveImage).toHaveBeenCalledWith({ maxSide: 1024 });
    expect(spies.submitJob).toHaveBeenCalledWith(expect.objectContaining({
      input: expect.objectContaining({
        output: {
          count: 1,
          sizePreset: '4k',
          outputFormat: 'webp',
          aspectRatio: '16:9',
        },
      }),
    }));
  });

  it('preview writeback 只能经 host.placeAssetOnCanvas 并携带 placement intent', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await sendPrompt(container, 'edit captured image');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.img-act')!.click();
    });

    expect(spies.placeAssetOnCanvas).toHaveBeenCalledWith(fakeOutputAsset, expect.objectContaining({
      kind: 'exact-frame',
      documentId: 42,
    }));
  });

  it('Place button exposes placing and placed states without delaying host writeback', async () => {
    vi.useFakeTimers();
    try {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const services = createFakeServices();
      let resolvePlace: (() => void) | undefined;
      services.spies.placeAssetOnCanvas.mockImplementation(() => new Promise<void>((resolve) => {
        resolvePlace = resolve;
      }));
      const { spies } = await renderApp(container, services);

      await act(async () => {
        container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
      });
      await flush();
      await sendPrompt(container, 'edit captured image');

      const placeButton = container.querySelector<HTMLButtonElement>('[data-testid^="result-place-button-"]')!;
      await act(async () => {
        placeButton.click();
      });
      expect(spies.placeAssetOnCanvas).toHaveBeenCalledTimes(1);
      expect(placeButton.dataset.placeStatus).toBe('placing');
      expect(placeButton.disabled).toBe(true);
      expect(placeButton.closest('.ui-icon-button-host')).toBeNull();

      await act(async () => {
        resolvePlace?.();
        await Promise.resolve();
      });
      expect(placeButton.dataset.placeStatus).toBe('placed');

      await act(async () => {
        vi.advanceTimersByTime(MOTION_DURATION.statusReset);
      });
      expect(placeButton.dataset.placeStatus).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('多张 provider 结果只渲染一个主图，并按当前选择置入', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { storedRef: _storedRef, ...secondOutputAssetBase } = fakeOutputAsset;
    const secondOutputAsset = {
      ...secondOutputAssetBase,
      name: 'result-2.png',
      data: 'ZmFrZS1pbWFnZS0y',
    };
    const services = createFakeServices();
    services.spies.submitJob.mockResolvedValue({
      ok: true as const,
      value: {
        id: 'job-1',
        status: 'completed',
        input: {},
        output: {
          image: {
            assets: [fakeOutputAsset, secondOutputAsset],
            metadata: {
              size: '1024x1024',
              outputFormat: 'png',
            },
          },
        },
        error: undefined,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    const { spies } = await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await sendPrompt(container, 'edit captured image');

    expect(container.querySelectorAll('.prov-img .img-result')).toHaveLength(1);
    expect(container.querySelector('.msg-prov > .av-prov')).toBeNull();
    const providerIdentity = container.querySelector<HTMLElement>('.prov-top .prov-identity')!;
    const providerIdentityHost = providerIdentity.querySelector<HTMLElement>('.prov-identity-host')!;
    expect(providerIdentity.textContent).toContain('Mock Profile');
    expect(providerIdentity.textContent).toContain('mock-image-v1');
    expect(providerIdentityHost.querySelector('.prov-identity-icon-shell')).not.toBeNull();
    expect(providerIdentityHost.querySelector('.prov-identity-icon-svg')).not.toBeNull();
    expect(providerIdentityHost.querySelector('[data-model-avatar-icon="debug-mock"]')).not.toBeNull();
    const previewCount = container.querySelector<HTMLElement>('[data-testid^="result-preview-count-"]')!;
    const roundId = previewCount.dataset.testid?.replace('result-preview-count-', '') ?? '';
    expect(previewCount.textContent).toContain('1 / 2');
    const preview = container.querySelector<HTMLElement>(`[data-testid="result-preview-${roundId}"]`)!;
    const prevButton = container.querySelector<HTMLButtonElement>(`[data-testid="result-preview-prev-${roundId}"]`)!;
    const nextButton = container.querySelector<HTMLButtonElement>(`[data-testid="result-preview-next-${roundId}"]`)!;
    expect(preview.className).toContain('media-square');
    expect(prevButton.disabled).toBe(true);
    expect(prevButton.closest('.img-nav-host-prev')).not.toBeNull();
    expect(nextButton.disabled).toBe(false);
    expect(nextButton.closest('.img-nav-host-next')).not.toBeNull();

    await act(async () => {
      nextButton.click();
    });
    await flush();

    expect(container.querySelector<HTMLElement>(`[data-testid="result-preview-${roundId}"]`)?.dataset.previewIndex).toBe('1');
    expect(previewCount.textContent).toContain('2 / 2');
    expect(prevButton.disabled).toBe(false);
    expect(nextButton.disabled).toBe(true);

    await act(async () => {
      nextButton.click();
    });
    await flush();
    expect(container.querySelector<HTMLElement>(`[data-testid="result-preview-${roundId}"]`)?.dataset.previewIndex).toBe('1');

    await act(async () => {
      prevButton.click();
    });
    await flush();
    expect(container.querySelector<HTMLElement>(`[data-testid="result-preview-${roundId}"]`)?.dataset.previewIndex).toBe('0');

    await act(async () => {
      nextButton.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.img-act')!.click();
    });

    expect(spies.placeAssetOnCanvas).toHaveBeenCalledWith(expect.objectContaining({
      name: 'result-2.png',
      type: 'image',
    }), expect.objectContaining({
      kind: 'exact-frame',
      documentId: 42,
    }));
  });

  it('结果底部 action bar 只保留当前图下载入口', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await sendPrompt(container, 'edit captured image');

    const actions = container.querySelector<HTMLElement>('.prov-actions')!;
    const download = actions.querySelector<HTMLElement>('[data-testid^="result-download-button-"]')!;
    expect(download).not.toBeNull();
    expect(download.className).toContain('act-download');
    expect(download.closest('.act-download-host')).not.toBeNull();
    expect(actions.firstElementChild?.classList.contains('act-download-host')).toBe(true);
    expect(actions.querySelector('[data-testid^="result-place-button-"]')).toBeNull();
    expect(actions.querySelector('[data-testid^="result-regenerate-button-"]')).toBeNull();
    expect(actions.querySelector('[data-testid^="result-copy-button-"]')).toBeNull();
  });

  it('renders provider response text above image results and supports copying the complete text', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const services = createFakeServices();
    services.spies.submitJob.mockResolvedValue({
      ok: true as const,
      value: {
        id: 'job-text',
        status: 'completed',
        input: {},
        output: {
          image: {
            assets: [fakeOutputAsset],
            text: [
              'line one',
              'line two',
              '[operation=text_to_image] [model=mock-image-v1]',
              '[prompt=image te...]',
            ].join('\n'),
            metadata: { size: '1024x1024', outputFormat: 'png' },
          },
        },
        error: undefined,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    await renderApp(container, services);

    await sendPrompt(container, 'image text result');

    const response = container.querySelector<HTMLElement>('[data-testid^="result-response-text-"]')!;
    expect(response.textContent).toContain('line one\nline two');
    expect(response.textContent).toContain('[operation=text_to_image] [model=mock-image-v1]');
    expect(response.textContent).toContain('[app.output=size=2k format=png aspect=auto providerInputSize=1k]');
    expect(container.querySelector('.prov-response-details')).toBeNull();
    const responseBox = response.closest<HTMLElement>('.prov-response')!;
    expect(responseBox.dataset.expanded).toBeUndefined();
    expect(container.querySelector('[data-testid^="result-preview-"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid^="result-response-copy-button-"]')!.click();
    });
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('line one\nline two'));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('[app.output=size=2k format=png aspect=auto providerInputSize=1k]'));
  });

  it('renders failed rounds as a structured error card and copies only the request id', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const services = createFakeServices();
    services.spies.submitJob.mockResolvedValue({
      ok: true as const,
      value: {
        id: 'job-failed',
        status: 'failed',
        input: {},
        output: undefined,
        error: {
          category: 'provider',
          message: 'provider: 无效的令牌 (request id: 20260702182031563028416evPNk4m7)',
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    await renderApp(container, services);

    await sendPrompt(container, 'failed request');

    expect(container.querySelector('.err-title')?.textContent).toContain('失败 · Mock Profile');
    expect(container.querySelector('.err-card .sdot')).toBeNull();
    expect(container.querySelector('.err-msg')?.textContent).toContain('无效的令牌');
    expect(container.querySelector('.err-msg')?.textContent).not.toContain('provider:');
    expect(container.querySelector('.err-msg')?.textContent).not.toContain('request id');
    expect(container.querySelector('[data-testid^="error-copy-button-"]')).toBeNull();
    expect(container.textContent).toContain('Request ID');
    expect(container.querySelector<HTMLElement>('[data-testid^="error-request-id-"]')?.textContent).toBe('20260702182031563028416evPNk4m7');

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid^="error-request-copy-button-"]')!.click();
    });

    expect(writeText).toHaveBeenCalledWith('20260702182031563028416evPNk4m7');
    expect(container.querySelector<HTMLElement>('[data-testid^="error-retry-button-"]')?.textContent).toContain('重试');
  });

  it('renders compact mock token response as plain response text without details splitting', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.submitJob.mockResolvedValue({
      ok: true as const,
      value: {
        id: 'job-debug-only',
        status: 'completed',
        input: {},
        output: {
          image: {
            assets: [fakeOutputAsset],
            text: '[operation=text_to_image] [model=mock-image-v1] [prompt=debug on...]',
            metadata: { size: '1024x2048', outputFormat: 'png' },
          },
        },
        error: undefined,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    await renderApp(container, services);

    await sendPrompt(container, 'debug only');

    const response = container.querySelector<HTMLElement>('[data-testid^="result-response-text-"]')!;
    expect(response.textContent).toContain('[operation=text_to_image] [model=mock-image-v1] [prompt=debug on...]');
    expect(response.textContent).toContain('[app.model=mock-image-v1]');
    expect(container.querySelector('.prov-response-details')).toBeNull();
    expect(container.querySelector<HTMLElement>('[data-testid^="result-preview-"]')?.className).toContain('media-tall');
  });

  it('always renders response text for image results when present', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.submitJob.mockResolvedValue({
      ok: true as const,
      value: {
        id: 'job-text-hidden',
        status: 'completed',
        input: {},
        output: {
          image: {
            assets: [fakeOutputAsset],
            text: 'hidden supplemental text',
            metadata: { size: '1024x1024', outputFormat: 'png' },
          },
        },
        error: undefined,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    await renderApp(container, services);

    await sendPrompt(container, 'image text hidden');

    expect(container.querySelector('[data-testid^="result-response-text-"]')?.textContent).toContain('hidden supplemental text');
    expect(container.querySelector('[data-testid^="result-preview-"]')).not.toBeNull();
    expect(container.querySelector('[data-testid^="result-download-button-"]')).not.toBeNull();
  });

  it('renders text-only success results without Media Stage or footer', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.submitJob.mockResolvedValue({
      ok: true as const,
      value: {
        id: 'job-text-only',
        status: 'completed',
        input: {},
        output: {
          image: {
            assets: [],
            text: 'text-only result',
          },
        },
        error: undefined,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    await renderApp(container, services);

    await sendPrompt(container, 'text only');

    expect(container.querySelector('[data-testid^="result-response-text-"]')?.textContent).toContain('text-only result');
    expect(container.textContent).toContain('文本结果');
    expect(container.querySelector('[data-testid^="result-preview-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="result-download-button-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="result-place-button-"]')).toBeNull();
  });

  it('layer attachment writeback targets the source Photoshop document', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从 PS 图层选择');
    });
    await act(async () => {
      clickText(container, '.layer-item', 'Layer 1');
    });
    await flush();
    await sendPrompt(container, 'edit layer image');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.img-act')!.click();
    });

    expect(spies.placeAssetOnCanvas).toHaveBeenCalledWith(fakeOutputAsset, expect.objectContaining({
      kind: 'exact-frame',
      documentId: 42,
    }));
  });

  it('/new 作为本地命令，不提交任务', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await sendPrompt(container, '/new');

    expect(spies.submitJob).not.toHaveBeenCalled();
  });

  it('运行中时空状态提示不再显示', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    expect(container.textContent).toContain('当前会话');
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await sendPrompt(container, 'running task');

    expect(container.querySelector('.empty-hint')).toBeNull();
  });

  it('模型选择保留用户选择而非强制回到第一个', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [
        { id: 'mock-image-v1' },
        { id: 'mock-image-v2' },
      ],
    });
    await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector-option-mock-image-v2"]')!.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await sendPrompt(container, 'generate with selected model');

    expect(services.spies.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          providerOptions: { model: 'mock-image-v2' },
        }),
      }),
    );
  });

  it('主输入区模型菜单会把当前自定义 model 合并进发现列表', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        config: {
          ...fakeProfile.config,
          defaultModel: 'gpt-image2',
        },
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [{ id: 'gpt-image2' }, { id: 'mock-image-v1' }],
    });
    await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="main-model-selector-option-gpt-image2"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="main-model-selector-option-mock-image-v1"]')).not.toBeNull();
  });

  it('主输入区选择自定义 model 后再次打开菜单仍保留该候选', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        config: {
          ...fakeProfile.config,
          defaultModel: 'mock-image-v1',
        },
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [{ id: 'gpt-image2' }, { id: 'mock-image-v1' }],
    });
    await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector-option-gpt-image2"]')!.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="main-model-selector-option-gpt-image2"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="main-model-selector-option-mock-image-v1"]')).not.toBeNull();
  });

  it('主输入区 provider 与 model 选择不包含 Prompt Optimizer', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.services.commands.listProviderProfiles = vi.fn(async () => ({
      ok: true as const,
      value: [
        {
          profileId: 'mock-profile',
          providerId: 'mock',
          displayName: 'Mock Profile',
          enabled: true,
          config: {
            providerId: 'mock',
            displayName: 'Mock Profile',
            family: 'image-endpoint',
            connection: {
              selectionMode: 'manual',
              failoverEnabled: false,
              preferredEndpointId: 'primary',
              endpoints: [{ id: 'primary', url: 'https://mock.local', enabled: true }],
            },
            defaultModel: 'mock-image-v1',
          },
          secretRefs: {
            apiKey: 'secret:provider-profile:mock-profile:apiKey',
          },
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
        {
          profileId: '__prompt-optimizer__',
          providerId: 'prompt-optimize',
          displayName: 'Prompt Optimizer',
          enabled: true,
          config: {
            providerId: 'prompt-optimize',
            displayName: 'Prompt Optimizer',
            family: 'prompt-optimize',
            connection: {
              selectionMode: 'manual',
              failoverEnabled: false,
              preferredEndpointId: 'primary',
              endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
            },
            defaultModel: 'gpt-4o-mini',
            instruction: 'Rewrite the prompt.',
            testPrompt: 'test',
          },
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      ],
    }));
    await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')!.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="profile-menu-option-mock-profile"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="profile-menu-option-__prompt-optimizer__"]')).toBeNull();
    expect(container.textContent).not.toContain('prompt-optimize');
  });

  it('main profile selector exposes dropdown affordance and keeps menu scoped to selectable profiles', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container, createFakeServices({
      profiles: [
        {
          profileId: 'mock-profile',
          displayName: 'Image Endpoint',
          providerId: 'image-endpoint',
          enabled: true,
          config: {
            family: 'image-endpoint',
            connection: {
              selectionMode: 'manual',
              failoverEnabled: false,
              preferredEndpointId: 'primary',
              endpoints: [{ id: 'primary', url: 'https://example.invalid/v1', enabled: true }],
            },
            apiKey: 'sk-test',
            defaultModel: 'mock-image-v1',
          },
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
        {
          profileId: '__prompt-optimizer__',
          displayName: 'Prompt Optimizer',
          providerId: 'prompt-optimize',
          enabled: true,
          config: {
            family: 'prompt-optimize',
            connection: {
              selectionMode: 'manual',
              failoverEnabled: false,
              preferredEndpointId: 'primary',
              endpoints: [{ id: 'primary', url: 'https://openrouter.ai/api/v1', enabled: true }],
            },
            defaultModel: 'gpt-4o-mini',
            instruction: 'Rewrite the prompt.',
            testPrompt: 'test',
          },
          createdAt: '2026-06-15T00:00:00.000Z',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      ],
    }));

    const selector = container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')!;
    expect(selector.getAttribute('aria-haspopup')).toBe('listbox');
    expect(selector.getAttribute('aria-expanded')).toBe('false');
    expect(findIconInHost(selector, '[data-icon-name="chevron-down"]')).not.toBeNull();

    await act(async () => {
      selector.click();
    });
    await flush();

    expect(selector.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('[data-testid="profile-menu-option-mock-profile"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="profile-menu-option-__prompt-optimizer__"]')).toBeNull();
  });

  it('Composer 底部控制行按 prompt action 与 send/capture 分组结构契约', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    const left = container.querySelector('.cmp-action-left');
    const right = container.querySelector('.cmp-action-right');
    const attachBand = container.querySelector('.cmp-attach-band');
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(attachBand).not.toBeNull();

    // attachment zone: 常驻 add tile
    expect(attachBand!.querySelector('[data-testid="composer-add-image-button"]')).not.toBeNull();

    // 左组：Prompt Optimizer
    expect(left!.querySelector('[data-testid="composer-prompt-optimize-button"]')).not.toBeNull();
    expect(left!.querySelector('[data-testid="composer-send-button"]')).toBeNull();
    expect(left!.querySelector('[data-testid="composer-add-image-button"]')).toBeNull();

    // 右组：Capture / Send
    expect(right!.querySelector('[data-testid="composer-capture-button"]')).not.toBeNull();
    expect(right!.querySelector('[data-testid="composer-send-button"]')).not.toBeNull();
    expect(right!.querySelector('[data-testid="composer-prompt-optimize-button"]')).toBeNull();
  });

  it('Composer 参数工具栏保持 Model 左侧、Size 右侧，不再承载 optimizer', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    const toolbar = container.querySelector<HTMLElement>('[data-testid="composer-toolbar"]')!;
    const toolbarStyle = getComputedStyle(toolbar);
    const toolbarLeftStyle = getComputedStyle(container.querySelector<HTMLElement>('.cmp-toolbar-left')!);
    const toolbarRightStyle = getComputedStyle(container.querySelector<HTMLElement>('.cmp-toolbar-right')!);
    expect(toolbarStyle.flexWrap).toBe('nowrap');
    expect(toolbarStyle.justifyContent).toBe('space-between');
    expect(toolbarLeftStyle.overflow).toBe('visible');
    expect(toolbarRightStyle.overflow).toBe('visible');

    const modelSelector = toolbar.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!;
    expect(modelSelector.textContent).toContain('mock-image-v1');
    expect(modelSelector.closest('.ui-overlay-icon-host')?.querySelector('[data-icon-name="algorithm"]')).not.toBeNull();
    expect(toolbar.querySelector('[data-testid="composer-capture-button"]')).toBeNull();
    expect(toolbar.querySelector('[data-testid="composer-output-size-selector"]')!.textContent).toContain('2K');
    expect(toolbar.querySelector('[data-testid="composer-prompt-optimize-button"]')).toBeNull();
  });

  it('output-size 选择器可打开、选择并关闭，Capture 不打开菜单', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    expect(spies.captureActiveImage).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="composer-capture-button-menu"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-output-size-selector"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="composer-output-size-selector-menu"]')).not.toBeNull();
    await act(async () => {
      clickText(container, '[data-testid^="composer-output-size-selector-option-"]', '4K');
    });
    await flush();
    expect(container.querySelector('[data-testid="composer-output-size-selector-menu"]')).toBeNull();
    expect(container.querySelector('[data-testid="composer-output-size-selector"]')!.textContent).toContain('4K');
  });

  it('同一时刻只允许一个选择表面展开', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="main-model-selector-menu"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-output-size-selector"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="composer-output-size-selector-menu"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="main-model-selector-menu"]')).toBeNull();
  });

  it('运行中禁用所有非 send 的 Composer 控件', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.submitJob.mockImplementation(() => new Promise<never>(() => {}));
    await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, 'running disable test');
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-send-button"]')!.click();
    });
    await flush();

    const isDisabled = (selector: string): boolean => {
      const el = container.querySelector<HTMLElement & { disabled?: boolean }>(selector);
      if (!el) return false;
      return Boolean(el.disabled) || el.hasAttribute('disabled');
    };
    expect(isDisabled('[data-testid="composer-add-image-button"]')).toBe(true);
    expect(isDisabled('[data-testid="main-model-selector"]')).toBe(true);
    expect(isDisabled('[data-testid="composer-capture-button"]')).toBe(true);
    expect(isDisabled('[data-testid="composer-output-size-selector"]')).toBe(true);
    expect(isDisabled('[data-testid="composer-prompt-optimize-button"]')).toBe(true);

    const send = container.querySelector<HTMLElement & { disabled?: boolean }>('[data-testid="composer-send-button"]')!;
    expect(Boolean(send.disabled)).toBe(true);
    expect(findIconInHost(send, '[data-icon-name="spinner"]')).not.toBeNull();
  });

  it('idle Send keeps the send glyph and matching accessible label', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, 'ready to send');
    });
    await flush();

    const send = container.querySelector<HTMLElement>('[data-testid="composer-send-button"]')!;
    expect(findIconInHost(send, '[data-icon-name="send"]')).not.toBeNull();
    expect(findIconInHost(send, '[data-icon="icon-send"]')).not.toBeNull();
    expect(findIconInHost(send, '[data-icon-name="spinner"]')).toBeNull();
    expect(send.getAttribute('aria-label')).toBe('发送');
    expect(send.getAttribute('title')).toBe('发送');
  });

  it('running Send surface labels the regenerate-like glyph as Regenerate', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.submitJob.mockImplementation(() => new Promise<never>(() => {}));
    await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, 'running label test');
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-send-button"]')!.click();
    });
    await flush();

    const send = container.querySelector<HTMLElement>('[data-testid="composer-send-button"]')!;
    expect(findIconInHost(send, '[data-icon-name="spinner"]')).not.toBeNull();
    expect(findIconInHost(send, '[data-icon="icon-spinner"]')).not.toBeNull();
    expect(send.getAttribute('aria-label')).toBe('重新生成');
    expect(send.getAttribute('title')).toBe('重新生成');
  });

  it('prompt optimization 调用 optimizePrompt 并回填结果', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    (services.services.commands as {
      listProviderProfiles: (profileId?: unknown) => Promise<{ ok: true; value: readonly typeof fakeOptimizerProfile[] }>;
    }).listProviderProfiles = vi.fn(async () => ({
      ok: true as const,
      value: [{ ...fakeOptimizerProfile, enabled: true }],
    }));
    await renderApp(container, services);

    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, 'a red square');
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-prompt-optimize-button"]')!.click();
    });
    await flush();

    expect(services.spies.optimizePrompt).toHaveBeenCalledWith({ prompt: 'a red square' });
    const textarea = container.querySelector<HTMLTextAreaElement>('.cmp-ta')!;
    expect(textarea.value).toBe('optimized prompt');
  });

  it('output-size 在发送后保留，而输入与附件清空', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-output-size-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      clickText(container, '[data-testid^="composer-output-size-selector-option-"]', '4K');
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从电脑上传');
    });
    await flush();
    expect(container.querySelector('.att-thumb')).not.toBeNull();

    await sendPrompt(container, 'persist selection test');

    expect(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!.value).toBe('');
    expect(container.querySelector('.att-thumb')).toBeNull();
    expect(container.querySelector('[data-testid="composer-output-size-selector"]')!.textContent).toContain('4K');
  });

  it('attachment 可通过移除按钮移除', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    const dispose = vi.fn();
    services.services.host.pickImageFile = vi.fn(async () => ({
      ...fakeHostImage,
      preview: {
        ...fakeHostImage.preview,
        dispose,
      },
    }));
    await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从电脑上传');
    });
    await flush();
    expect(container.querySelector('.att-thumb')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid^="attachment-remove-button-"]')!.click();
    });
    await flush();
    expect(container.querySelector('.att-thumb')).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('translates Chrome local file normalization failure into a user-facing toast', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.services.host.pickImageFile = vi.fn(async () => {
      throw new Error(
        'Local image requires provider input normalization from 1305x1305 to 1304x1304, but this runtime has no verified local file derivative path. Use Photoshop Capture or Choose Layer for normalized provider input.',
      );
    });
    await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从电脑上传');
    });
    await flush();

    expect(container.querySelector('[data-testid="toast"]')?.textContent).toContain(
      '这张图片尺寸当前不支持从电脑上传。请用 Capture / Layer，或先缩放后再上传。',
    );
  });

  it('切换 provider profile 会释放并清空旧 policy 下的附件', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const dispose = vi.fn();
    const services = createFakeServices({
      profiles: [
        fakeProfile,
        {
          ...fakeProfile,
          profileId: 'mock-profile-2',
          displayName: 'Mock Profile 2',
          config: {
            ...fakeProfile.config,
          },
        },
        fakeOptimizerProfile,
      ],
    });
    services.services.host.pickImageFile = vi.fn(async () => ({
      ...fakeHostImage,
      preview: {
        ...fakeHostImage.preview,
        dispose,
      },
    }));
    await renderApp(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从电脑上传');
    });
    await flush();
    expect(container.querySelector('.att-thumb')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="profile-menu-option-mock-profile-2"]')!.click();
    });
    await flush();

    expect(container.querySelector('.att-thumb')).toBeNull();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('attachment zone 在空状态也常驻，并将 add tile 固定为第一项', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    const attachRow = container.querySelector('.attach-row');
    expect(attachRow).not.toBeNull();
    expect(attachRow!.querySelector('[data-testid="composer-add-image-button"]')).not.toBeNull();
    expect(attachRow!.querySelectorAll('.att-thumb')).toHaveLength(0);
  });

  it('点击选择表面外部关闭菜单', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="main-model-selector-menu"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('.scroll')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="main-model-selector-menu"]')).toBeNull();
  });
});
