import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeOutputAsset, createFakeServices } from './fakes';
import { cleanupMainPageRoot, clickText, flush, renderMainPage, sendPrompt } from './main-page-harness';

afterEach(async () => {
  await cleanupMainPageRoot();
});

describe('MainPage contract — result rendering', () => {
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
    const { spies } = await renderMainPage(container, services);

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
    expect(providerIdentityHost.querySelector('[data-model-avatar-icon="default"]')).not.toBeNull();
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
    await renderMainPage(container);

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

  it('下载按钮保存当前选中的原始结果图，而不是首图或缩略图', async () => {
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
        id: 'job-download-1',
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
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-capture-button"]')!.click();
    });
    await flush();
    await sendPrompt(container, 'download selected result');

    const previewCount = container.querySelector<HTMLElement>('[data-testid^="result-preview-count-"]')!;
    const roundId = previewCount.dataset.testid?.replace('result-preview-count-', '') ?? '';
    await act(async () => {
      container.querySelector<HTMLButtonElement>(`[data-testid="result-preview-next-${roundId}"]`)!.click();
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>(`[data-testid="result-download-button-${roundId}"]`)!.click();
    });
    await flush();

    expect(services.spies.saveAssetToFile).toHaveBeenCalledWith(expect.objectContaining({
      type: 'image',
      name: 'result-2.png',
      mimeType: 'image/png',
      data: 'ZmFrZS1pbWFnZS0y',
    }), { suggestedName: expect.stringMatching(/^imagen_\d{8}-\d{6}_Mock-Profile_download-selected-result_2\.png$/) });
    expect(services.spies.saveAssetToFile.mock.calls[0]?.[0]).not.toMatchObject({
      storedRef: fakeOutputAsset.storedRef,
    });
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
    await renderMainPage(container, services);

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
    await renderMainPage(container, services);

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
    expect(container.querySelector('.err-category')?.textContent).toContain('认证失败');
    expect(container.querySelector<HTMLElement>('[data-testid^="error-primary-action-button-"]')?.textContent).toContain('打开 Provider 设置');
  });

  it('uses copy details as the primary action for unknown errors and keeps fill composer as a secondary action', async () => {
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
        id: 'job-failed-unknown',
        status: 'failed',
        input: {},
        output: undefined,
        error: {
          category: 'provider',
          message: 'provider: expected io.Reader for image edits mode, got *ali.AliImageRequest (request id: 20260704005518866266746fBZYb0GG)',
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    await renderMainPage(container, services);

    await sendPrompt(container, 'failed unknown request');

    expect(container.querySelector('.err-category')?.textContent).toContain('未知');
    expect(container.querySelector<HTMLElement>('[data-testid^="error-primary-action-button-"]')?.textContent).toContain('复制详情');
    expect(container.querySelectorAll<HTMLElement>('[data-testid^="error-fill-composer-button-"]')).toHaveLength(1);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid^="error-primary-action-button-"]')!.click();
    });

    expect(writeText).toHaveBeenCalledWith(
      [
        'Provider: Mock Profile',
        'Category: 未知',
        'Message: expected io.Reader for image edits mode, got *ali.AliImageRequest',
        'Detail: provider: expected io.Reader for image edits mode, got *ali.AliImageRequest (request id: 20260704005518866266746fBZYb0GG)',
        'Request ID: 20260704005518866266746fBZYb0GG',
      ].join('\n'),
    );
  });

  it('failed-round Retry fills the composer without submitting or switching settings', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.submitJob.mockResolvedValueOnce({
      ok: true as const,
      value: {
        id: 'job-failed-fill',
        status: 'failed',
        input: {},
        output: undefined,
        error: {
          category: 'provider',
          message: 'provider temporarily unavailable',
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    await renderMainPage(container, services);

    await sendPrompt(container, 'draft from failed round');
    expect(services.spies.submitJob).toHaveBeenCalledTimes(1);
    expect(container.querySelector<HTMLElement>('[data-testid^="error-primary-action-button-"]')?.textContent).toContain('填入输入框');
    expect(container.querySelector('[data-testid^="error-fill-composer-button-"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid^="error-primary-action-button-"]')!.click();
    });
    await flush();

    expect(services.spies.submitJob).toHaveBeenCalledTimes(1);
    expect(services.services.commands.retryJob).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLTextAreaElement>('.cmp-ta')?.value).toBe('draft from failed round');
  });

  it('replaces the current draft attachments when filling from a failed image-edit round', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.submitJob.mockResolvedValueOnce({
      ok: true as const,
      value: {
        id: 'job-failed-edit-fill',
        status: 'failed',
        input: {},
        output: undefined,
        error: {
          category: 'provider',
          message: 'provider edit failed',
        },
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await flush();
    await act(async () => {
      clickText(container, '.attach-opt', '从电脑上传');
    });
    await flush();
    await sendPrompt(container, 'failed image edit draft');

    expect(container.querySelectorAll('.att-thumb')).toHaveLength(0);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-add-image-button"]')!.click();
    });
    await flush();
    await act(async () => {
      clickText(container, '.attach-opt', '从电脑上传');
    });
    await flush();

    expect(container.querySelectorAll('.att-thumb')).toHaveLength(1);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid^="error-fill-composer-button-"]')!.click();
    });
    await flush();

    expect(container.querySelector<HTMLTextAreaElement>('.cmp-ta')?.value).toBe('failed image edit draft');
    expect(container.querySelectorAll('.att-thumb')).toHaveLength(1);
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
    await renderMainPage(container, services);

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
    await renderMainPage(container, services);

    await sendPrompt(container, 'image text hidden');

    expect(container.querySelector('[data-testid^="result-response-text-"]')?.textContent).toContain('hidden supplemental text');
    expect(container.querySelector('[data-testid^="result-preview-"]')).not.toBeNull();
    expect(container.querySelector('[data-testid^="result-download-button-"]')).not.toBeNull();
  });

  it('renders image results with supplemental text as media cards, not text-only cards', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.submitJob.mockResolvedValue({
      ok: true as const,
      value: {
        id: 'job-inline-image-fixed',
        status: 'completed',
        input: {},
        output: {
          image: {
            assets: [fakeOutputAsset],
            text: 'Generated successfully',
            metadata: { size: '1024x1024', outputFormat: 'png' },
          },
        },
        error: undefined,
        createdAt: '2026-06-15T00:00:00.000Z',
        updatedAt: '2026-06-15T00:00:01.000Z',
      },
    });
    await renderMainPage(container, services);

    await sendPrompt(container, 'inline markdown image fixed');

    expect(container.querySelector('.prov-card-text-only')).toBeNull();
    expect(container.querySelector('[data-testid^="result-preview-"]')).not.toBeNull();
    expect(container.querySelector('[data-testid^="result-response-text-"]')?.textContent).toContain('Generated successfully');
    expect(container.querySelector('[data-testid^="result-response-text-"]')?.textContent).not.toContain('data:image');
    expect(container.textContent).not.toContain('文本结果');
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
    await renderMainPage(container, services);

    await sendPrompt(container, 'text only');

    expect(container.querySelector('[data-testid^="result-response-text-"]')?.textContent).toContain('text-only result');
    expect(container.textContent).toContain('文本结果');
    expect(container.querySelector('[data-testid^="result-preview-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="result-download-button-"]')).toBeNull();
    expect(container.querySelector('[data-testid^="result-place-button-"]')).toBeNull();
  });
});
