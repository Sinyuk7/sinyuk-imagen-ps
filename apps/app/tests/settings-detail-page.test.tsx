import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SettingsDetailPage } from '../src/ui/pages/settings-detail-page';
import { createFakeServices } from './fakes';
import { TestAppProviders } from './render-helpers';

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

function changeInput(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

async function renderDetail(container: HTMLElement, onProfilesChanged = vi.fn(async () => undefined)) {
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

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((item) =>
    item.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`找不到按钮: ${text}`);
  }
  return button;
}

describe('SettingsDetailPage contract', () => {
  it('saves edited provider profile through profile commands', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies, onProfilesChanged } = await renderDetail(container);
    const inputs = Array.from(container.querySelectorAll<HTMLInputElement>('.field-input'));

    await act(async () => {
      changeInput(inputs[0]!, 'Renamed Mock');
      changeInput(inputs[1]!, 'https://mock.changed');
      changeInput(inputs[3]!, 'mock-image-v2');
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    expect(spies.saveProviderProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'mock-profile',
        providerId: 'mock',
        displayName: 'Renamed Mock',
        enabled: true,
        config: expect.objectContaining({
          baseURL: 'https://mock.changed',
          defaultModel: 'mock-image-v2',
        }),
      }),
    );
    expect(onProfilesChanged).toHaveBeenCalledWith('mock-profile');
  });

  it('deletes provider profile through profile commands', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onNav = vi.fn();
    const onProfilesChanged = vi.fn(async () => undefined);
    const services = createFakeServices();
    root = createRoot(container);
    await act(async () => {
      root!.render(
        <TestAppProviders services={services.services}>
          <SettingsDetailPage
            onNav={onNav}
            profileId="mock-profile"
            onProfilesChanged={onProfilesChanged}
          />
        </TestAppProviders>,
      );
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-del')!.click();
    });

    expect(services.spies.deleteProviderProfile).toHaveBeenCalledWith('mock-profile');
    expect(onProfilesChanged).toHaveBeenCalledWith(null);
    expect(onNav).toHaveBeenCalledWith('settings');
  });

  it('tests provider profile and refreshes models through profile commands', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    await act(async () => {
      buttonByText(container, '测试连接').click();
    });
    await flush();

    expect(spies.saveProviderProfile).toHaveBeenCalled();
    expect(spies.testProviderProfile).toHaveBeenCalledWith('mock-profile', { connect: true });
    expect(container.textContent).toContain('连接成功');

    await act(async () => {
      buttonByText(container, '刷新模型列表').click();
    });
    await flush();

    expect(spies.refreshProfileModels).toHaveBeenCalledWith('mock-profile');
  });

  it('shows copyable connection errors instead of a saved status while testing', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);
    spies.testProviderProfile.mockResolvedValueOnce({
      ok: true,
      value: {
        profileId: 'mock-profile',
        providerId: 'image-endpoint',
        family: 'image-endpoint',
        valid: true,
        connectivity: {
          reachable: false,
          errorMessage: "Cannot read properties of undefined (reading 'addEventListener')",
        },
      },
    });

    await act(async () => {
      buttonByText(container, '测试连接').click();
    });
    await flush();

    expect(container.textContent).toContain("连接失败: Cannot read properties of undefined (reading 'addEventListener')");
    expect(container.textContent).not.toContain('已保存');
    expect(container.querySelector('.status-notice.error')).not.toBeNull();
    expect(container.querySelector('.status-copy')).not.toBeNull();
  });

  it('keeps the test button disabled until the connection test finishes', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);
    let resolveTest: ((value: Awaited<ReturnType<typeof spies.testProviderProfile>>) => void) | undefined;
    spies.testProviderProfile.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveTest = resolve;
        }),
    );

    await act(async () => {
      buttonByText(container, '测试连接').click();
      await Promise.resolve();
    });

    expect(buttonByText(container, '测试中...').disabled).toBe(true);

    await act(async () => {
      resolveTest?.({
        ok: true,
        value: {
          profileId: 'mock-profile',
          providerId: 'mock',
          family: 'image-endpoint',
          valid: true,
          connectivity: { reachable: true, modelCount: 1, models: [{ id: 'mock-image-v1' }] },
        },
      });
    });
    await flush();

    expect(buttonByText(container, '测试连接').disabled).toBe(false);
    expect(container.textContent).toContain('连接成功');
  });

  it('does not send secretValues when API key field is left blank', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { spies } = await renderDetail(container);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.btn-save')!.click();
    });

    const input = spies.saveProviderProfile.mock.calls[0]?.[0];
    expect(input).toBeDefined();
    expect(input).not.toHaveProperty('secretValues');
    expect(input).not.toHaveProperty('apiKey');
  });
});
