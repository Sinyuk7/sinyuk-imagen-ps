import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { AppShell } from '../src/ui/app-shell';
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
          services: services.services,
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
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
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
});
