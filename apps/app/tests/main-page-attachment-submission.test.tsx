import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeHostImage, fakeOptimizerProfile, fakeProviderInputAsset, fakeProfile, createFakeServices } from './fakes';
import { changeTextarea, clickText, cleanupMainPageRoot, findIconInHost, flush, renderMainPage, sendPrompt } from './main-page-harness';

afterEach(async () => {
  await cleanupMainPageRoot();
});

describe('MainPage contract — attachment & submission', () => {
  it('无 attachment 时提交 provider-generate', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderMainPage(container);

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
    const { spies } = await renderMainPage(container);

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
    const { spies } = await renderMainPage(container, services);

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
    const { spies } = await renderMainPage(container, services);

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
    await renderMainPage(container);

    const addButton = container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]');
    expect(addButton).not.toBeNull();
    expect(findIconInHost(addButton!, '.cmp-add-icon-bg')).toBeNull();
  });

  it('upload option shows the Chrome local file limitation before picker selection', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container);

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
    const { spies } = await renderMainPage(container);

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
    const { spies } = await renderMainPage(container);

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
    const { spies } = await renderMainPage(container);

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
    const { spies } = await renderMainPage(container, services);

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

  it('output-size 在发送后保留，而输入与附件清空', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container);

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
    await renderMainPage(container, services);

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
    await renderMainPage(container, services);

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
    await renderMainPage(container, services);

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
    await renderMainPage(container);

    const attachRow = container.querySelector('.attach-row');
    expect(attachRow).not.toBeNull();
    expect(attachRow!.querySelector('[data-testid="composer-add-image-button"]')).not.toBeNull();
    expect(attachRow!.querySelectorAll('.att-thumb')).toHaveLength(0);
  });

  it('点击选择表面外部关闭菜单', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container);

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
