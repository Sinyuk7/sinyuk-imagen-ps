import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { ProviderDescriptor } from '@imagen-ps/application';
import { SettingsAddPage } from '../src/shared/ui/pages/settings-add-page';
import { createFakeServices, fakeChatProvider, fakeProvider } from './fakes';
import { TestAppProviders } from './render-helpers';
import { installFlightRecorder } from './settings-detail-harness';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'x' }));
}

function byTestId<T extends HTMLElement>(container: HTMLElement, testId: string): T {
  const node = container.querySelector<T>(`[data-testid="${testId}"]`);
  if (!node) {
    throw new Error(`找不到元素: ${testId}`);
  }
  return node;
}

describe('SettingsAddPage gemini URL import', () => {
  it('imports extracted gemini model as custom input instead of treating it as a list selection', async () => {
    const records = installFlightRecorder();
    const { services, spies } = createFakeServices();
    const geminiProvider: ProviderDescriptor = {
      id: 'gemini-generate-content',
      family: 'gemini-generate-content',
      apiFormat: 'gemini-generate-content',
      displayName: 'Gemini Generate Content',
      operations: ['text_to_image', 'image_edit'],
      invokeMode: 'sync',
      defaultModels: [
        { id: 'gemini-3.1-flash-image', displayName: 'Gemini 3.1 Flash Image' },
        { id: 'gemini-3-pro-image', displayName: 'Gemini 3 Pro Image' },
      ],
      billing: {
        supportedModes: ['none'],
        defaultMode: 'none',
        query: 'unsupported',
      },
      connectivity: {
        endpointMeasurement: 'unsupported',
        connectionTest: 'unsupported',
      },
    };
    spies.listProviders.mockReturnValue([fakeProvider, fakeChatProvider, geminiProvider]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <SettingsAddPage onNav={() => undefined} profiles={[]} onProfileSaved={async () => undefined} />
        </TestAppProviders>,
      );
    });

    await act(async () => {
      setInputValue(
        byTestId<HTMLInputElement>(container, 'provider-endpoint-detect-input'),
        'https://grsai.dakka.com.cn/v1beta/models/nano-banana-fast:generateContent',
      );
    });

    expect((byTestId<HTMLInputElement>(container, 'provider-default-model-input')).value).toBe('nano-banana-fast');
    expect((byTestId<HTMLInputElement>(container, 'provider-alias-input')).value).toBe('grsai');
    expect(container.querySelector('[data-testid="provider-default-model-selector"]')).toBeNull();
    expect(container.textContent).toContain('当前 API 格式暂不支持远端模型发现。');
    expect(JSON.stringify(records)).toContain('uxp.ui.settings_add.endpoint_import');
  });
});
