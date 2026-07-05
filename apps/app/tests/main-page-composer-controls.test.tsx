import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeProfile, createFakeServices, profileModelItem } from './fakes';
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

  it('IME composition Enter does not submit the prompt', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderMainPage(container);
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')!;

    await act(async () => {
      changeTextarea(textarea, '中文提示');
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
      Object.defineProperty(event, 'isComposing', { value: true });
      textarea.dispatchEvent(event);
    });
    await flush();

    expect(spies.submitJob).not.toHaveBeenCalled();
  });

  it('IME keyCode 229 Enter fallback does not submit the prompt', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderMainPage(container);
    const textarea = container.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')!;

    await act(async () => {
      changeTextarea(textarea, '中文提示');
      const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
      Object.defineProperty(event, 'keyCode', { value: 229 });
      textarea.dispatchEvent(event);
    });
    await flush();

    expect(spies.submitJob).not.toHaveBeenCalled();
  });

  it('selector 打开时会暂停 composer textarea 的原生命中，关闭后恢复', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container);
    const firstTextarea = container.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')!;

    expect(document.body.querySelector('[data-testid="composer-textarea-mirror"]')).toBeNull();
    expect(firstTextarea.style.visibility).toBe('');
    expect(firstTextarea.style.pointerEvents).toBe('');

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-output-size-selector"]')!.click();
    });
    await flush();

    const textarea = container.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')!;
    expect(document.body.querySelector('[data-testid="composer-textarea-mirror"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="composer-output-size-selector-popover"]')).not.toBeNull();

    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="composer-output-size-selector-underlay"]')!.click();
    });
    await flush();

    const restoredTextarea = container.querySelector<HTMLTextAreaElement>('[data-testid="composer-textarea"]')!;
    expect(document.body.querySelector('[data-testid="composer-textarea-mirror"]')).toBeNull();
    expect(restoredTextarea.dataset.nativeEditorSuspended).toBeUndefined();
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
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        selectedModelIds: ['mock-image-v1', 'gpt-image-2'],
        defaultModelId: 'mock-image-v1',
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [
        profileModelItem('mock-image-v1', { default: true }),
        profileModelItem('gpt-image-2'),
      ],
    });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="main-model-selector-option-gpt-image-2"]')!.click();
    });
    await flush();
    await flush();

    await flush();
    await flush();
    await sendPrompt(container, 'generate with selected model');

    expect(services.spies.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          providerOptions: { model: 'gpt-image-2' },
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
        selectedModelIds: ['gpt-image2', 'mock-image-v1'],
        defaultModelId: 'gpt-image2',
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [profileModelItem('gpt-image2', { default: true }), profileModelItem('mock-image-v1')],
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
        selectedModelIds: ['gpt-image2', 'mock-image-v1'],
        defaultModelId: 'mock-image-v1',
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [profileModelItem('gpt-image2'), profileModelItem('mock-image-v1', { default: true })],
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
        selectedModelIds: ['dall-e-3'],
        defaultModelId: 'dall-e-3',
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [profileModelItem('dall-e-3', { configured: false, default: true, configSource: undefined })],
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

  it('shows a singular readiness reason for empty prompt and model blockers', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderMainPage(container);

    expect(container.querySelector('[data-testid="composer-readiness-status"]')?.textContent).toContain('请输入提示词');

    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, 'has prompt');
    });
    await flush();

    expect(container.querySelector('[data-testid="composer-readiness-status"]')?.textContent).toContain('就绪');
  });

  it('keeps unconfigured discovered models out of the main selector', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        selectedModelIds: ['gpt-image-2', 'dall-e-3'],
        defaultModelId: 'gpt-image-2',
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [
        profileModelItem('gpt-image-2', { default: true }),
        profileModelItem('dall-e-3', { configured: false, configSource: undefined }),
      ],
    });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();

    expect(document.body.querySelector('[data-testid="main-model-selector-option-gpt-image-2"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="main-model-selector-option-dall-e-3"]')).toBeNull();
  });

  it('keeps unselected configured models out of the main selector', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        selectedModelIds: ['gpt-image-2'],
        defaultModelId: 'gpt-image-2',
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [
        profileModelItem('gpt-image-2', { default: true }),
        profileModelItem('dall-e-3', { selected: false }),
      ],
    });
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')!.click();
    });
    await flush();

    expect(document.body.querySelector('[data-testid="main-model-selector-option-gpt-image-2"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="main-model-selector-option-dall-e-3"]')).toBeNull();
  });

  it('does not block output-size selection from profile model list capability metadata', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices({
      profiles: [{
        ...fakeProfile,
        selectedModelIds: ['gpt-image-2'],
        defaultModelId: 'gpt-image-2',
      }],
    });
    services.spies.listProfileModels.mockResolvedValue({
      ok: true as const,
      value: [profileModelItem('gpt-image-2', { default: true })],
    });
    await renderMainPage(container, services);
    for (let index = 0; index < 6; index += 1) {
      await flush();
    }
    expect(Boolean(container.querySelector<HTMLButtonElement>('[data-testid="composer-output-size-selector"]')?.disabled)).toBe(false);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-output-size-selector"]')!.click();
    });
    await flush();

    expect(document.body.querySelector<HTMLButtonElement>('[data-testid="composer-output-size-selector-option-1k"]')?.textContent).toContain('1K');
    expect(document.body.querySelector<HTMLButtonElement>('[data-testid="composer-output-size-selector-option-2k"]')?.textContent).toBe('2K');
    await act(async () => {
      document.body.querySelector<HTMLButtonElement>('[data-testid="composer-output-size-selector-option-4k"]')?.click();
    });
    await flush();

    expect(iconSelectValue(container, '[data-testid="composer-output-size-selector"]')).toContain('4K');
    expect(container.querySelector('[data-testid="toast"]')?.textContent ?? '').not.toContain('此模型不支持 4K');
    expect(container.querySelector('[data-testid="composer-size-feedback"]')).toBeNull();
  });

  it('主输入区 provider 与 model 选择只展示常规 profile', async () => {
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
              selectedEndpointId: 'primary',
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
      ],
    }));
    await renderMainPage(container, services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="main-profile-selector"]')!.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="profile-menu-option-mock-profile"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="profile-menu-option-mock-profile"]')).not.toBeNull();
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
              selectedEndpointId: 'primary',
              endpoints: [{ id: 'primary', url: 'https://example.invalid/v1', enabled: true }],
            },
            apiKey: 'sk-test',
            defaultModel: 'mock-image-v1',
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
    expect(container.querySelector('[data-testid="profile-menu-option-image-endpoint"]')).toBeNull();
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

    // 左组：Prompt Optimizer + Billing
    expect(left!.querySelector('[data-testid="composer-prompt-optimize-button"]')).not.toBeNull();
    expect(left!.querySelector('[data-testid="main-billing-summary"]')).not.toBeNull();
    expect(left!.querySelector('[data-testid="composer-send-button"]')).toBeNull();
    expect(left!.querySelector('[data-testid="composer-add-image-button"]')).toBeNull();

    // 右组：Capture / Send
    expect(right!.querySelector('[data-testid="composer-capture-button"]')).not.toBeNull();
    expect(right!.querySelector('[data-testid="composer-send-button"]')).not.toBeNull();
    expect(right!.querySelector('[data-testid="composer-prompt-optimize-button"]')).toBeNull();
  });

  it('Composer 参数工具栏保持 Model 左侧、输出 matrix 控件右侧，不承载 optimizer', async () => {
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
    expect(iconSelectValue(toolbar, '[data-testid="main-model-selector"]')).toContain('gpt-image-2');
    expect(modelSelector.closest('.ui-overlay-icon-host')?.querySelector('[data-icon-name="algorithm"]')).not.toBeNull();
    expect(toolbar.querySelector('[data-testid="composer-capture-button"]')).toBeNull();
    expect(iconSelectValue(toolbar, '[data-testid="composer-output-size-selector"]')).toContain('AUTO');
    expect(toolbar.querySelector('[data-testid="composer-output-ratio-selector"]')).not.toBeNull();
    expect(toolbar.querySelector('[data-testid="composer-output-format-selector"]')).not.toBeNull();
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
    expect(send.getAttribute('aria-label')).toBe('就绪');
    expect(send.getAttribute('title')).toBe('就绪');
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
    expect(send.getAttribute('aria-label')).toBe('正在生成');
    expect(send.getAttribute('title')).toBe('正在生成');
  });

});
