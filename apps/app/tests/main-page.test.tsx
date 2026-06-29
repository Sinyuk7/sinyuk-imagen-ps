import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../src/shared/ui/app-shell';
import { fakeAsset, fakeOptimizerProfile } from './fakes';
import { createFakeServices } from './fakes';

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

describe('MainPage contract', () => {
  it('无 attachment 时 image-edit send 在 hook 内阻止 provider 调用', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await sendPrompt(container, 'make an image');

    expect(spies.submitJob).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Image edit requires an attachment');
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
        images: [fakeAsset],
      }),
    });
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

    expect(spies.readLayerAsAsset).toHaveBeenCalledWith(1, { maxSide: 2048 });
    expect(spies.pickImageFile).not.toHaveBeenCalled();
    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-edit',
      input: expect.objectContaining({
        prompt: 'edit layer image',
        images: [fakeAsset],
      }),
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
    expect(spies.readLayerAsAsset).not.toHaveBeenCalled();
    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-edit',
      input: expect.objectContaining({
        prompt: 'edit captured image',
        images: [fakeAsset],
      }),
    });
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

    expect(spies.placeAssetOnCanvas).toHaveBeenCalledWith(fakeAsset, expect.objectContaining({
      kind: 'exact-frame',
      documentId: 42,
      placementRect: { left: 10, top: 20, right: 266, bottom: 276 },
    }));
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

    expect(spies.placeAssetOnCanvas).toHaveBeenCalledWith(fakeAsset, expect.objectContaining({
      kind: 'document-only',
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
            baseURL: 'https://mock.local',
            defaultModel: 'mock-image-v1',
            imageMaxSide: 2048,
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
            baseURL: 'https://openrouter.ai/api/v1',
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
            baseURL: 'https://example.invalid/v1',
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
            baseURL: 'https://openrouter.ai/api/v1',
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
    expect(selector.querySelector('sp-icon-chevron-down')).not.toBeNull();

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

  it('Composer 参数工具栏保持 Model 左侧、Ratio 右侧，不再承载 optimizer', async () => {
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

    expect(toolbar.querySelector('[data-testid="main-model-selector"]')!.textContent).toContain('mock-image-v1');
    expect(toolbar.querySelector('[data-testid="composer-capture-button"]')).toBeNull();
    expect(toolbar.querySelector('[data-testid="composer-aspect-ratio-selector"]')!.textContent).toContain('智能');
    expect(toolbar.querySelector('[data-testid="composer-prompt-optimize-button"]')).toBeNull();
  });

  it('aspect-ratio 选择器可打开、选择并关闭，Capture 不打开菜单', async () => {
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
      container.querySelector<HTMLElement>('[data-testid="composer-aspect-ratio-selector"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="composer-aspect-ratio-selector-menu"]')).not.toBeNull();
    await act(async () => {
      clickText(container, '[data-testid^="composer-aspect-ratio-selector-option-"]', '1:1');
    });
    await flush();
    expect(container.querySelector('[data-testid="composer-aspect-ratio-selector-menu"]')).toBeNull();
    expect(container.querySelector('[data-testid="composer-aspect-ratio-selector"]')!.textContent).toContain('1:1');
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
      container.querySelector<HTMLElement>('[data-testid="composer-aspect-ratio-selector"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="composer-aspect-ratio-selector-menu"]')).not.toBeNull();
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
    expect(isDisabled('[data-testid="composer-aspect-ratio-selector"]')).toBe(true);
    expect(isDisabled('[data-testid="composer-prompt-optimize-button"]')).toBe(true);

    const send = container.querySelector<HTMLElement & { disabled?: boolean }>('[data-testid="composer-send-button"]')!;
    expect(Boolean(send.disabled)).toBe(true);
    expect(send.querySelector('[data-icon-name="spinner"]')).not.toBeNull();
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
    expect(send.querySelector('[data-icon-name="send"]')).not.toBeNull();
    expect(send.querySelector('[data-icon="sp-icon-send"]')).not.toBeNull();
    expect(send.querySelector('[data-icon="sp-icon-refresh"]')).toBeNull();
    expect(send.getAttribute('aria-label')).toBe('发送');
    expect(send.textContent).toContain('发送');
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
    expect(send.querySelector('[data-icon-name="spinner"]')).not.toBeNull();
    expect(send.querySelector('[data-icon="sp-icon-refresh"]')).not.toBeNull();
    expect(send.getAttribute('aria-label')).toBe('重新生成');
    expect(send.textContent).toContain('重新生成');
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

  it('aspect-ratio 在发送后保留，而输入与附件清空', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-aspect-ratio-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      clickText(container, '[data-testid^="composer-aspect-ratio-selector-option-"]', '1:1');
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
    expect(container.querySelector('[data-testid="composer-aspect-ratio-selector"]')!.textContent).toContain('1:1');
  });

  it('attachment 可通过移除按钮移除', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

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
  });

  it('attachment zone 在空状态也常驻，并将 add tile 固定为第一项', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    const attachRow = container.querySelector('.attach-row');
    expect(attachRow).not.toBeNull();
    expect(attachRow!.firstElementChild?.getAttribute('data-testid')).toBe('composer-add-image-button');
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
