import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppShell } from '../src/shared/ui/app-shell';
import { createFakeServices } from './fakes';

let root: Root | undefined;

export async function cleanupMainPageRoot(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
}

export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

export async function renderMainPage(container: HTMLElement, services = createFakeServices()) {
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

export function changeTextarea(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

export async function sendPrompt(container: HTMLElement, prompt: string): Promise<void> {
  await act(async () => {
    changeTextarea(container.querySelector<HTMLTextAreaElement>('.cmp-ta')!, prompt);
  });
  await act(async () => {
    container.querySelector<HTMLElement>('[data-testid="composer-send-button"]')!.click();
  });
  await flush();
}

export function clickText(container: HTMLElement, selector: string, text: string): void {
  const element = Array.from(container.querySelectorAll<HTMLElement>(selector)).find((item) =>
    item.textContent?.includes(text),
  );
  if (!element) {
    throw new Error(`找不到包含文本的元素: ${text}`);
  }
  element.click();
}

export function findIconInHost(button: Element, selector: string): Element | null {
  const host = button.closest('.ui-icon-button-host');
  return host?.querySelector(selector) ?? null;
}
