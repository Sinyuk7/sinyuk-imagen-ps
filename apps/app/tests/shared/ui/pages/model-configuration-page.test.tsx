import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { listOfficialModelConfigPresets, type ApiFormat, type OfficialModelPreset, type UserModelConfig } from '@imagen-ps/application';
import { ModelConfigurationPage } from '../../../../src/shared/ui/pages/model-configuration-page';
import {
  buildOutputCapabilityEditorState,
  type OutputCapabilityModule,
} from '../../../../src/shared/ui/pages/model-configuration-page.helpers';
import { TestAppProviders } from '../../../helpers/render-helpers';
import { createFakeServices } from '../../../helpers/fakes';

let root: Root | undefined;

const simpleFlexibleExposure = {
  kind: 'flexible-pixels' as const,
  sizePresetIds: ['auto', '1k'],
  outputFormats: ['png'],
  allowInputDerivedExactSize: false,
};

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
  expect(buttons.every((button) => button.getAttribute('aria-checked') === 'true')).toBe(true);
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

  it('keeps create identity and request model synced to current preset', async () => {
    const { services } = createFakeServices();
    const container = await renderPage(services);
    await openCreateEditor(container);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.model-config-advanced-toggle')?.click();
    });
    await flush();
    expect(container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]')?.value).toBe('gpt-image-2');
    expect(container.querySelector<HTMLInputElement>('[data-testid="model-config-wire-model-id"]')?.value).toBe('gpt-image-2');

    await selectOption('model-config-preset-selector', 'gemini-image-split');
    expect(container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]')?.value).toBe('gemini-image-split');
    expect(container.querySelector<HTMLInputElement>('[data-testid="model-config-wire-model-id"]')?.value).toBe('gemini-image-split');
  });

  it('keeps create identity and request model synced when switching api format', async () => {
    const officialModelConfigPresets = await Promise.all([
      officialPreset('openai-images', 'gpt-image-2'),
      officialPreset('openai-chat-completions', 'openai/gpt-image-2'),
      officialPreset('gemini-generate-content', 'gemini-3.1-flash-image'),
    ]);
    const { services } = createFakeServices({ officialModelConfigPresets });
    const container = await renderPage(services);
    await openCreateEditor(container);

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.model-config-advanced-toggle')?.click();
    });
    await flush();

    await selectOption('model-config-api-format-selector', 'gemini-generate-content');
    expect(container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]')?.value).toBe('gemini-3.1-flash-image');
    expect(container.querySelector<HTMLInputElement>('[data-testid="model-config-wire-model-id"]')?.value).toBe('gemini-3.1-flash-image');
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

    expect(container.querySelector('[data-testid="model-config-section-title-shared"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config-shared-scope-shared"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config-shared-size-use-input-size"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config-shared-ratio-auto"]')).toBeNull();
    expect(container.querySelector('[data-testid="model-config-section-title-text_to_image"]')).toBeNull();
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

    expect(container.querySelector('[data-testid="model-config-section-title-text_to_image"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config-section-title-image_edit"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config-section-title-shared"]')).toBeNull();
  });

  it('returns from create editor to configuration list when opened from list page', async () => {
    const { services } = createFakeServices();
    const container = await renderPage(services);

    await openCreateEditor(container);

    expect(container.querySelector('[data-testid="model-config-wire-model-id"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="model-configuration-back-button"]')?.click();
    });
    await flush();

    expect(container.querySelector('[data-testid="model-configuration-add-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="model-config-wire-model-id"]')).toBeNull();
  });

  it('uses preset title with modelId-first meta for saved configs without extra edit button', async () => {
    const officialModelConfigPresets = await Promise.all([
      officialPreset('gemini-generate-content', 'gemini-3.1-flash-lite-image'),
    ]);
    const userModelConfigs: readonly UserModelConfig[] = [
      {
        apiFormat: 'gemini-generate-content',
        modelId: 'nano-banana-fast',
        baseModelId: 'gemini-3.1-flash-lite-image',
        wireModelId: 'nano-banana-fast-vip',
        requestStrategyId: 'gemini-generate-content-image-config',
        outputExposure: simpleFlexibleExposure,
        outputMatrix: [],
      },
    ];
    const { services } = createFakeServices({ userModelConfigs, officialModelConfigPresets });
    const container = await renderPage(services);

    const row = container.querySelector<HTMLElement>('[data-testid="model-config-row-gemini-generate-content-nano-banana-fast"]');
    expect(container.querySelector('[data-testid="model-config-edit-gemini-generate-content-nano-banana-fast"]')).toBeNull();
    expect(container.querySelector('[data-testid="model-config-avatar-gemini-generate-content-nano-banana-fast"]')?.textContent).toBe('NB');
    expect(row?.textContent).toContain('Nano Banana 2 Lite');
    expect(row?.textContent).toContain('nano-banana-fast');
    expect(row?.textContent).toContain('Gemini GenerateContent');
    expect(row?.textContent).not.toContain('nano-banana-fast-vip');

    await act(async () => {
      row?.click();
    });
    await flush();
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.model-config-advanced-toggle')?.click();
    });
    await flush();
    expect(container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]')?.value).toBe('nano-banana-fast');
    expect(container.querySelector<HTMLInputElement>('[data-testid="model-config-wire-model-id"]')?.value).toBe('nano-banana-fast-vip');
    expect(container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]')?.disabled).toBe(true);
    expect(container.querySelector<HTMLElement>('[data-testid="model-config-api-format-selector"]')?.hasAttribute('disabled')).toBe(true);
  });

  it('keeps same-preset configs distinguishable in model configuration list', async () => {
    const officialModelConfigPresets = await Promise.all([
      officialPreset('gemini-generate-content', 'gemini-3.1-flash-lite-image'),
    ]);
    const userModelConfigs: readonly UserModelConfig[] = [
      {
        apiFormat: 'gemini-generate-content',
        modelId: 'nano-banana-fast',
        baseModelId: 'gemini-3.1-flash-lite-image',
        wireModelId: 'nano-banana-fast-wire',
        requestStrategyId: 'gemini-generate-content-image-config',
        outputExposure: simpleFlexibleExposure,
        outputMatrix: [],
      },
      {
        apiFormat: 'gemini-generate-content',
        modelId: 'nano-banana-2-lite',
        baseModelId: 'gemini-3.1-flash-lite-image',
        wireModelId: 'nano-banana-2-lite-wire',
        requestStrategyId: 'gemini-generate-content-image-config',
        outputExposure: simpleFlexibleExposure,
        outputMatrix: [],
      },
    ];
    const { services } = createFakeServices({ userModelConfigs, officialModelConfigPresets });
    const container = await renderPage(services);

    const fastRow = container.querySelector<HTMLElement>('[data-testid="model-config-row-gemini-generate-content-nano-banana-fast"]');
    const liteRow = container.querySelector<HTMLElement>('[data-testid="model-config-row-gemini-generate-content-nano-banana-2-lite"]');

    expect(container.querySelector('[data-testid="model-config-avatar-gemini-generate-content-nano-banana-fast"]')?.textContent).toBe('NB');
    expect(container.querySelector('[data-testid="model-config-avatar-gemini-generate-content-nano-banana-2-lite"]')?.textContent).toBe('NB');
    expect(fastRow?.textContent).toContain('Nano Banana 2 Lite');
    expect(fastRow?.textContent).toContain('nano-banana-fast');
    expect(fastRow?.textContent).toContain('Gemini GenerateContent');
    expect(fastRow?.textContent).not.toContain('nano-banana-fast-wire');
    expect(liteRow?.textContent).toContain('Nano Banana 2 Lite');
    expect(liteRow?.textContent).toContain('nano-banana-2-lite');
    expect(liteRow?.textContent).toContain('Gemini GenerateContent');
    expect(liteRow?.textContent).not.toContain('nano-banana-2-lite-wire');
  });

  it('locks api format in edit mode', async () => {
    const userModelConfigs: readonly UserModelConfig[] = [
      {
        apiFormat: 'openai-images',
        modelId: 'saved-config',
        baseModelId: 'gpt-image-2',
        wireModelId: 'saved-config-vip',
        requestStrategyId: 'image-endpoint-default',
        outputExposure: simpleFlexibleExposure,
        outputMatrix: [],
      },
    ];
    const { services } = createFakeServices({ userModelConfigs });
    const container = await renderPage(services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="model-config-row-openai-images-saved-config"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector<HTMLElement>('[data-testid="model-config-api-format-selector"]')?.hasAttribute('disabled')).toBe(true);
  });

  it('shows delete action for existing config and removes it', async () => {
    const userModelConfigs: readonly UserModelConfig[] = [
      {
        apiFormat: 'openai-images',
        modelId: 'saved-config',
        baseModelId: 'gpt-image-2',
        wireModelId: 'saved-config',
        requestStrategyId: 'image-endpoint-default',
        outputExposure: simpleFlexibleExposure,
        outputMatrix: [],
      },
    ];
    const { services, spies } = createFakeServices({ userModelConfigs });
    const container = await renderPage(services);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="model-config-row-openai-images-saved-config"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="model-configuration-delete-button"]')).not.toBeNull();

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="model-configuration-delete-button"]')?.click();
    });
    await flush();
    await flush();

    expect(spies.deleteUserModelConfig).toHaveBeenCalledWith('openai-images', 'saved-config');
    expect(container.querySelector('[data-testid="model-configuration-add-button"]')).not.toBeNull();
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
      container.querySelector<HTMLButtonElement>('.model-config-advanced-toggle')?.click();
    });
    await flush();

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]')!, 'filtered-model');
    });
    await flush();

    await act(async () => {
      changeInput(container.querySelector<HTMLInputElement>('[data-testid="model-config-wire-model-id"]')!, 'gemini-image-split-vip');
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
    expect(input.wireModelId).toBe('gemini-image-split-vip');
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

    expect(container.querySelector('[data-testid="model-config-normalization-warning-shared"]')).not.toBeNull();
  });

  it('prefills create flow from profile-originated apiFormat with current preset identity', async () => {
    const officialModelConfigPresets = await Promise.all([
      officialPreset('openai-chat-completions', 'openai/gpt-image-2'),
    ]);
    const { services } = createFakeServices({ officialModelConfigPresets });
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

    await act(async () => {
      container.querySelector<HTMLButtonElement>('.model-config-advanced-toggle')?.click();
    });
    await flush();

    const modelIdInput = container.querySelector<HTMLInputElement>('[data-testid="model-config-model-id"]');
    const wireModelIdInput = container.querySelector<HTMLInputElement>('[data-testid="model-config-wire-model-id"]');
    expect(container.querySelector('[data-testid="model-config-save-button"]')).not.toBeNull();
    expect(modelIdInput?.value ?? '').toBe('openai/gpt-image-2');
    expect(wireModelIdInput?.value ?? '').toBe('openai/gpt-image-2');
  });
});
