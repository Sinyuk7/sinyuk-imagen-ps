import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { SettingsDetailPage } from '../src/shared/ui/pages/settings-detail-page';
import { fakeOptimizerProfile, createFakeServices } from './fakes';
import { TestAppProviders } from './render-helpers';
import type { UxpFlightRecorder } from '../src/host/uxp-log-sink';

let root: Root | undefined;

export async function cleanupSettingsDetailRoot(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  delete globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__;
  delete globalThis.__IMAGEN_PS_DIAGNOSTIC_DISABLE_UI_FLIGHT_RECORDER__;
}

export async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

export function changeInput(input: HTMLElement & { value?: string }, value: string): void {
  if (input instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
  } else {
    input.value = value;
  }
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

export function queryByTestId(container: HTMLElement, testId: string): HTMLElement & { value?: string } {
  const element = container.querySelector<HTMLElement & { value?: string }>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`找不到元素: ${testId}`);
  }
  return element;
}

export async function renderDetail(container: HTMLElement, onProfilesChanged = vi.fn(async () => undefined)) {
  const services = createFakeServices();
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <TestAppProviders services={services.services}>
        <SettingsDetailPage
          onNav={vi.fn()}
          profileId="mock-profile"
          onProfilesChanged={onProfilesChanged}
        />
      </TestAppProviders>,
    );
  });
  await flush();
  await flush();
  return { ...services, onProfilesChanged };
}

export async function renderOptimizerDetail(container: HTMLElement, onProfilesChanged = vi.fn(async () => undefined)) {
  const services = createFakeServices();
  services.spies.getProviderProfile.mockResolvedValue({
    ok: true as const,
    value: fakeOptimizerProfile,
  });
  services.spies.listProfileModels.mockResolvedValue({
    ok: true as const,
    value: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4.1-mini' }],
  });
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <TestAppProviders services={services.services}>
        <SettingsDetailPage
          onNav={vi.fn()}
          profileId="__prompt-optimizer__"
          onProfilesChanged={onProfilesChanged}
        />
      </TestAppProviders>,
    );
  });
  await flush();
  await flush();
  return { ...services, onProfilesChanged };
}

export function installFlightRecorder(): Array<{ readonly event: string; readonly attrs?: Record<string, unknown> }> {
  const records: Array<{ readonly event: string; readonly attrs?: Record<string, unknown> }> = [];
  const recorder: UxpFlightRecorder = {
    async checkpoint(event, attrs) {
      records.push({ event, attrs });
    },
    async fail(event, _error, attrs) {
      records.push({ event, attrs });
    },
  };
  globalThis.__IMAGEN_PS_UI_FLIGHT_RECORDER__ = recorder;
  return records;
}

export function buttonByText(container: HTMLElement, text: string): HTMLElement & { disabled?: boolean } {
  const button = Array.from(container.querySelectorAll<HTMLElement & { disabled?: boolean }>('button')).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`找不到按钮: ${text}`);
  }
  return button;
}

export async function switchToCustomModel(container: HTMLElement): Promise<void> {
  await act(async () => {
    const checkbox = container.querySelector<HTMLInputElement>('input[data-testid="provider-use-custom-model-checkbox"]');
    if (!checkbox) {
      throw new Error('找不到自定义 model id checkbox');
    }
    checkbox.click();
  });
  await flush();
}

export async function renderDetailWithRoot(
  container: HTMLElement,
  services: ReturnType<typeof createFakeServices>,
  profileId: string,
  onNav: ReturnType<typeof vi.fn>,
  onProfilesChanged: ReturnType<typeof vi.fn>,
): Promise<void> {
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <TestAppProviders services={services.services}>
        <SettingsDetailPage
          onNav={onNav}
          profileId={profileId}
          onProfilesChanged={onProfilesChanged}
        />
      </TestAppProviders>,
    );
  });
  await flush();
  await flush();
}
