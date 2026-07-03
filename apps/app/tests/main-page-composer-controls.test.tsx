import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeOptimizerProfile, fakeProfile, createFakeServices } from './fakes';
import { changeTextarea, clickText, cleanupMainPageRoot, findIconInHost, flush, renderMainPage, sendPrompt } from './main-page-harness';

afterEach(async () => {
  await cleanupMainPageRoot();
});

function iconSelectValue(root: ParentNode, selector: string): string {
  return root.querySelector<HTMLElement>(selector)?.closest('.ui-overlay-icon-host')?.querySelector<HTMLElement>('.cmp-chip-overlay-value-icon')?.textContent ?? '';
}

describe('MainPage contract — composer controls', () => {
  it('/new 作为本地命令，不提交任务', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderMainPage(container);

    await sendPrompt(container, '/new');

    expect(spies.submitJob).not.toHaveBeenCalled();
  });

  it('运行中时空状态提示不再显示', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container);

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
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="main-model-selector-option-mock-image-v2"]')!.click();
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
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();

    expect(document.body.querySelector('[data-testid="main-model-selector-option-gpt-image2"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="main-model-selector-option-mock-image-v1"]')).not.toBeNull();
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
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="main-model-selector-option-gpt-image2"]')!.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();

    expect(document.body.querySelector('[data-testid="main-model-selector-option-gpt-image2"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="main-model-selector-option-mock-image-v1"]')).not.toBeNull();
  });

  it('prevents sending when the selected model is not currently selectable', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        config: {
          ...fakeProfile.config,
          defaultModel: 'dall-e-3',
        },
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [{ id: 'dall-e-3', supportStatus: 'saved-undiscovered' }],
    });
    await renderMainPage(container, services);

    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, 'do not send');
    });
    await flush();

    const send = container.querySelector<HTMLElement & { disabled?: boolean }>('[data-testid="composer-send-button"]')!;
    expect(Boolean(send.disabled)).toBe(true);

    await act(async () => {
      send.click();
    });
    await flush();

    expect(services.spies.submitJob).not.toHaveBeenCalled();
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
    await renderMainPage(container, services);

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
    await renderMainPage(container, createFakeServices({
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
    expect(findIconInHost(selector, '[data-icon-name="chevron-down"]')).toBeNull();

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
    await renderMainPage(container);

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
    await renderMainPage(container);

    const toolbar = container.querySelector<HTMLElement>('[data-testid="composer-toolbar"]')!;
    const toolbarStyle = getComputedStyle(toolbar);
    const toolbarLeftStyle = getComputedStyle(container.querySelector<HTMLElement>('.cmp-toolbar-left')!);
    const toolbarRightStyle = getComputedStyle(container.querySelector<HTMLElement>('.cmp-toolbar-right')!);
    expect(toolbarStyle.flexWrap).toBe('nowrap');
    expect(toolbarStyle.justifyContent).toBe('space-between');
    expect(toolbarLeftStyle.overflow).toBe('visible');
    expect(toolbarRightStyle.overflow).toBe('visible');

    const modelSelector = toolbar.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!;
    expect(iconSelectValue(toolbar, '[data-testid="main-model-selector"]')).toContain('mock-image-v1');
    expect(modelSelector.closest('.ui-overlay-icon-host')?.querySelector('[data-icon-name="algorithm"]')).not.toBeNull();
    expect(toolbar.querySelector('[data-testid="composer-capture-button"]')).toBeNull();
    expect(iconSelectValue(toolbar, '[data-testid="composer-output-size-selector"]')).toContain('2K');
    expect(toolbar.querySelector('[data-testid="composer-prompt-optimize-button"]')).toBeNull();
  });

  it('余额显示跟在 Prompt Optimizer 后面，provider 选择器保持独立居中', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container);

    const headerCenter = container.querySelector<HTMLElement>('.hdr-center-wrap')!;
    const provider = container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')!;
    const billing = container.querySelector<HTMLElement>('[data-testid="main-billing-summary"]')!;
    const actionLeft = container.querySelector<HTMLElement>('.cmp-action-left')!;

    expect(headerCenter.querySelector('[data-testid="main-billing-summary"]')).toBeNull();
    expect(actionLeft.querySelector('[data-testid="composer-prompt-optimize-button"]')).not.toBeNull();
    expect(actionLeft.lastElementChild).toBe(billing);
    expect(billing.className).toContain('cmp-balance-pill');
    expect(provider.closest('.hdr-center-wrap')).toBe(headerCenter);
  });

  it('output-size 选择器可打开、选择并关闭，Capture 不打开菜单', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderMainPage(container);

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
    expect(document.body.querySelector('[data-testid="composer-output-size-selector-menu"]')).not.toBeNull();
    await act(async () => {
      clickText(container, '[data-testid^="composer-output-size-selector-option-"]', '4K');
    });
    await flush();
    expect(document.body.querySelector('[data-testid="composer-output-size-selector-menu"]')).toBeNull();
    expect(iconSelectValue(container, '[data-testid="composer-output-size-selector"]')).toContain('4K');
  });

  it('同一时刻只允许一个选择表面展开', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();
    expect(document.body.querySelector('[data-testid="main-model-selector-menu"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-output-size-selector"]')!.click();
    });
    await flush();
    expect(document.body.querySelector('[data-testid="composer-output-size-selector-menu"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="main-model-selector-menu"]')).toBeNull();
  });

  it('运行中禁用所有非 send 的 Composer 控件', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.submitJob.mockImplementation(() => new Promise<never>(() => {}));
    await renderMainPage(container, services);

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
    await renderMainPage(container);

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
    await renderMainPage(container, services);

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
    await renderMainPage(container, services);

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
});
