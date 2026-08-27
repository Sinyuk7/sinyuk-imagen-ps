import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { AppShell } from '../../src/shared/ui/app-shell';
import { createFakeServices } from '../helpers/fakes';

let root: Root | undefined;
type TextAreaControl = HTMLElement & { value: string };

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
    if (!vi.isFakeTimers()) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  });
}

export async function renderMainPage(
  container: HTMLElement,
  services = createFakeServices(),
  hostKind: 'photoshop-uxp' | 'chrome-browser' = 'photoshop-uxp',
) {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <AppShell
        host={{
          kind: hostKind,
          app: { stage: 'uxp-first-shell', host: hostKind, services: ['commands', 'host'] },
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

export function changeTextarea(textarea: TextAreaControl, value: string): void {
  textarea.value = value;
  textarea.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

export async function sendPrompt(container: HTMLElement, prompt: string): Promise<void> {
  await act(async () => {
    changeTextarea(container.querySelector<TextAreaControl>('[data-testid="composer-textarea"]')!, prompt);
  });
  await act(async () => {
    container.querySelector<HTMLElement>('[data-testid="composer-send-button"]')!.click();
  });
  await flush();
}

/** Main composer no longer infers a first model; test intent must select one. */
export async function selectMainModel(container: HTMLElement, modelId = 'gpt-image-2'): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLElement>('[data-testid="main-model-selector"]')?.click();
  });
  await flush();
  await act(async () => {
    document.body.querySelector<HTMLElement>(`[data-testid="main-model-selector-option-${modelId}"]`)?.click();
  });
  await flush();
  await flush();
}
