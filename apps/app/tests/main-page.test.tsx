import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from '../src/shared/ui/app-shell';
import { fakeAsset } from './fakes';
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
    container.querySelector<HTMLButtonElement>('.cmp-send')!.click();
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
  it('无 attachment 时 submitJob workflow 为 provider-generate', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await sendPrompt(container, 'make an image');

    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-generate',
      input: expect.objectContaining({
        profileId: 'mock-profile',
        prompt: 'make an image',
        providerOptions: { model: 'mock-image-v1' },
      }),
    });
    expect(spies.submitJob.mock.calls[0]?.[0].input).not.toHaveProperty('images');
  });

  it('file attachment 只能经 HostBridge 读取，并提交 provider-edit', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.cmp-add')!.click();
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
      container.querySelector<HTMLButtonElement>('.cmp-add')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从 PS 图层选择');
    });
    await act(async () => {
      clickText(container, '.layer-item', 'Layer 1');
    });
    await flush();
    await sendPrompt(container, 'edit layer image');

    expect(spies.readLayerAsAsset).toHaveBeenCalledWith(1);
    expect(spies.pickImageFile).not.toHaveBeenCalled();
    expect(spies.submitJob).toHaveBeenCalledWith({
      workflow: 'provider-edit',
      input: expect.objectContaining({
        prompt: 'edit layer image',
        images: [fakeAsset],
      }),
    });
  });

  it('preview writeback 只能经 host.placeAssetOnCanvas', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderApp(container);

    await sendPrompt(container, 'make an image');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.img-act')!.click();
    });

    expect(spies.placeAssetOnCanvas).toHaveBeenCalledWith(fakeAsset);
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

    await sendPrompt(container, 'generate with selected model');

    expect(services.spies.submitJob).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          providerOptions: { model: 'mock-image-v2' },
        }),
      }),
    );
  });

  it('Composer 底部控制行按左右分组结构契约', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    const left = container.querySelector('.cmp-left');
    const right = container.querySelector('.cmp-right');
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();

    // 左组：添加图片 / 模型 / 目标
    expect(left!.querySelector('[data-testid="composer-add-image-button"]')).not.toBeNull();
    expect(left!.querySelector('[data-testid="main-model-selector"]')).not.toBeNull();
    expect(left!.querySelector('[data-testid="composer-target-selector"]')).not.toBeNull();
    expect(left!.querySelector('[data-testid="composer-aspect-ratio-selector"]')).toBeNull();
    expect(left!.querySelector('[data-testid="composer-send-button"]')).toBeNull();

    // 右组：宽高比 / 优化提示词 / 发送
    expect(right!.querySelector('[data-testid="composer-aspect-ratio-selector"]')).not.toBeNull();
    expect(right!.querySelector('[data-testid="composer-prompt-optimize-button"]')).not.toBeNull();
    expect(right!.querySelector('[data-testid="composer-send-button"]')).not.toBeNull();
    expect(right!.querySelector('[data-testid="composer-target-selector"]')).toBeNull();
  });

  it('target 与 aspect-ratio 选择器可打开、选择并关闭', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-target-selector"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="composer-target-selector-menu"]')).not.toBeNull();
    await act(async () => {
      clickText(container, '[data-testid^="composer-target-selector-option-"]', '选区');
    });
    await flush();
    expect(container.querySelector('[data-testid="composer-target-selector-menu"]')).toBeNull();
    expect(container.querySelector('[data-testid="composer-target-selector"]')!.textContent).toContain('选区');

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
      container.querySelector<HTMLElement>('[data-testid="composer-target-selector"]')!.click();
    });
    await flush();
    expect(container.querySelector('[data-testid="composer-target-selector-menu"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="main-model-selector-menu"]')).toBeNull();
  });

  it('运行中禁用所有非 send 的 Composer 控件', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const services = createFakeServices();
    services.spies.submitJob.mockImplementation(() => new Promise<never>(() => {}));
    await renderApp(container, services);

    await act(async () => {
      changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, 'running disable test');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.cmp-send')!.click();
    });
    await flush();

    const isDisabled = (selector: string): boolean => {
      const el = container.querySelector<HTMLElement & { disabled?: boolean }>(selector);
      if (!el) return false;
      return Boolean(el.disabled) || el.hasAttribute('disabled');
    };
    expect(isDisabled('[data-testid="composer-add-image-button"]')).toBe(true);
    expect(isDisabled('[data-testid="main-model-selector"]')).toBe(true);
    expect(isDisabled('[data-testid="composer-target-selector"]')).toBe(true);
    expect(isDisabled('[data-testid="composer-aspect-ratio-selector"]')).toBe(true);
    expect(isDisabled('[data-testid="composer-prompt-optimize-button"]')).toBe(true);

    const send = container.querySelector<HTMLButtonElement>('[data-testid="composer-send-button"]')!;
    expect(send.disabled).toBe(true);
    expect(send.querySelector('[data-icon-name="spinner"]')).not.toBeNull();
  });

  it('prompt optimization 点击展示即将支持占位反馈', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-prompt-optimize-button"]')!.click();
    });
    await flush();

    const toast = container.querySelector<HTMLElement>('[data-testid="toast"]');
    expect(toast).not.toBeNull();
    expect(toast!.textContent).toContain('即将支持');
  });

  it('target 与 aspect-ratio 在发送后保留，而输入与附件清空', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-target-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      clickText(container, '[data-testid^="composer-target-selector-option-"]', '选区');
    });
    await flush();
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="composer-aspect-ratio-selector"]')!.click();
    });
    await flush();
    await act(async () => {
      clickText(container, '[data-testid^="composer-aspect-ratio-selector-option-"]', '1:1');
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.cmp-add')!.click();
    });
    await act(async () => {
      clickText(container, '.attach-opt', '从电脑上传');
    });
    await flush();
    expect(container.querySelector('.att-thumb')).not.toBeNull();

    await sendPrompt(container, 'persist selection test');

    expect(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!.value).toBe('');
    expect(container.querySelector('.att-thumb')).toBeNull();
    expect(container.querySelector('[data-testid="composer-target-selector"]')!.textContent).toContain('选区');
    expect(container.querySelector('[data-testid="composer-aspect-ratio-selector"]')!.textContent).toContain('1:1');
  });

  it('attachment 可通过移除按钮移除', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderApp(container);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.cmp-add')!.click();
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
