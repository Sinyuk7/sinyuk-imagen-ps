import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { listOfficialModelConfigPresets, type ApiFormat, type OfficialModelPreset } from '@imagen-ps/application';
import { ModelConfigurationPage } from '../../../../src/shared/ui/pages/model-configuration-page';
import {
  buildOutputCapabilityEditorState,
  type OutputCapabilityModule,
} from '../../../../src/shared/ui/pages/model-configuration-page.helpers';
import { TestAppProviders } from '../../../helpers/render-helpers';
import { createFakeServices } from '../../../helpers/fakes';

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

async function renderPage(services: ReturnType<typeof createFakeServices>['services']): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);

  await act(async () => {
    root!.render(
      <TestAppProviders services={services} locale="en">
        <div className="panel">
          <ModelConfigurationPage onNav={() => undefined} />
        </div>
      </TestAppProviders>,
    );
  });
  await flush();
  return container;
}

async function openCreateEditor(container: HTMLElement): Promise<void> {
  await act(async () => {
    container.querySelector<HTMLButtonElement>('[data-testid="model-configuration-add-button"]')?.click();
  });
  await flush();
  await flush();
}

async function selectOption(testId: string, optionId: string): Promise<void> {
  await act(async () => {
    document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`)?.click();
  });
  await flush();
  await act(async () => {
    document.body.querySelector<HTMLElement>(`[data-testid="${testId}-option-${optionId}"]`)?.click();
  });
  await flush();
  await flush();
}

function dimensionButtons(
  container: HTMLElement,
  module: OutputCapabilityModule,
  dimension: 'format' | 'ratio' | 'size',
): readonly HTMLButtonElement[] {
  const prefix = `model-config-${module.id}-${dimension}-`;
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[data-testid]'))
    .filter((button) => button.dataset.testid?.startsWith(prefix));
}

function expectDimensionControls(
  container: HTMLElement,
  module: OutputCapabilityModule,
  dimension: 'format' | 'ratio' | 'size',
  expectedIds: readonly string[],
): void {
  const buttons = dimensionButtons(container, module, dimension);
  const ids = buttons.map((button) => button.dataset.testid?.slice(`model-config-${module.id}-${dimension}-`.length));
  expect([...ids].sort()).toEqual([...expectedIds].sort());
  expect(buttons.every((button) => button.getAttribute('aria-pressed') === 'true')).toBe(true);
}

async function officialPreset(apiFormat: ApiFormat, modelId: string): Promise<OfficialModelPreset> {
  const result = await listOfficialModelConfigPresets(apiFormat);
  if (!result.ok) {
    throw new Error(result.error.message);
  }
  const preset = result.value.find((item) => item.modelId === modelId);
  if (!preset) {
    throw new Error(`Missing official preset ${apiFormat}:${modelId}`);
  }
  return preset;
}

describe('ModelConfigurationPage', () => {
  it('renders matrix-derived controls when switching api format and preset', async () => {
    const officialModelConfigPresets = await Promise.all([
      officialPreset('openai-images', 'gpt-image-2'),
      officialPreset('openai-chat-completions', 'openai/gpt-image-2'),
      officialPreset('gemini-generate-content', 'gemini-3.1-flash-image'),
    ]);
    const { services } = createFakeServices({
      officialModelConfigPresets,
      userModelConfigs: [],
    });
    const container = await renderPage(services);
    await openCreateEditor(container);

    for (const entry of [
      { apiFormat: 'openai-images', modelId: 'gpt-image-2' },
      { apiFormat: 'openai-chat-completions', modelId: 'openai/gpt-image-2' },
      { apiFormat: 'gemini-generate-content', modelId: 'gemini-3.1-flash-image' },
    ] as const) {
      await selectOption('model-config-api-format-selector', entry.apiFormat);
      await selectOption('model-config-preset-selector', entry.modelId);

      const selectedPreset = officialModelConfigPresets.find((item) => item.apiFormat === entry.apiFormat && item.modelId === entry.modelId)!;
      const editorState = buildOutputCapabilityEditorState(selectedPreset);

      for (const module of editorState.modules) {
        expectDimensionControls(container, module, 'format', module.outputFormats.map((item) => item.id));
        expectDimensionControls(container, module, 'size', module.imageSizes.map((item) => item.id));
        if (module.archetype === 'size-aspect-ratio-format') {
          expectDimensionControls(container, module, 'ratio', module.ratios.map((item) => item.id));
        } else {
          expect(dimensionButtons(container, module, 'ratio')).toHaveLength(0);
        }
      }
    }
  });

  it('shows one shared output capabilities section when operations are equal', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services} locale="en">
          <div className="panel">
            <ModelConfigurationPage onNav={() => undefined} />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-configuration-add-button"]')?.click();
    });
    await flush();
    await flush();

    expect(container.textContent).toContain('Output capabilities');
    expect(container.textContent).toContain('Text + Edit');
    expect(container.textContent).toContain('Use Input Size');
    expect(container.textContent).not.toContain('Aspect ratio');
    expect(container.textContent).not.toContain('Text to Image');
  });

  it('shows separate text and edit sections when preset operations differ', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services} locale="en">
          <div className="panel">
            <ModelConfigurationPage onNav={() => undefined} />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-configuration-add-button"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="model-config-preset-selector"]')?.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="model-config-preset-selector-option-gemini-image-split"]')?.click();
    });
    await flush();
    await flush();

    expect(container.textContent).toContain('Text to Image');
    expect(container.textContent).toContain('Edit Image');
  });

  it('saves ratio-resolution exposure when one ratio is deselected', async () => {
    const { services, spies } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services} locale="en">
          <div className="panel">
            <ModelConfigurationPage onNav={() => undefined} />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-configuration-add-button"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="model-config-preset-selector"]')?.click();
    });
    await flush();
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="model-config-preset-selector-option-gemini-image-split"]')?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]')!, 'filtered-model');
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-config-text_to_image-ratio-16:9"]')?.click();
    });
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-config-save-button"]')?.click();
    });
    await flush();
    await flush();

    expect(spies.saveUserModelConfig).toHaveBeenCalled();
    const input = spies.saveUserModelConfig.mock.calls.at(-1)?.[0];
    expect(input.outputExposure.kind).toBe('ratio-resolution');
    expect(input.outputExposure.kind === 'ratio-resolution' ? input.outputExposure.aspectRatios : []).not.toContain('16:9');
    expect('outputMatrix' in input).toBe(false);
  });

  it('shows a normalization warning for legacy hole subsets', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services} locale="en">
          <div className="panel">
            <ModelConfigurationPage
              onNav={() => undefined}
              initialEditorState={{ apiFormat: 'openai-images', modelId: 'gpt-image-2' }}
            />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();
    await flush();

    expect(container.textContent).toContain('Saving will normalize it to shared format, ratio, and resolution rules.');
  });

  it('prefills create flow from profile-originated apiFormat without auto-filling model id', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services} locale="en">
          <div className="panel">
            <ModelConfigurationPage
              onNav={() => undefined}
              initialEditorState={{ source: 'profile-add', apiFormat: 'openai-chat-completions', modelId: null }}
            />
          </div>
        </TestAppProviders>,
      );
    });
    await flush();
    await flush();

    const modelIdInput = container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]');
    expect(container.querySelector('[data-testid="model-config-save-button"]')).not.toBeNull();
    expect(modelIdInput?.value ?? '').toBe('');
  });
});
