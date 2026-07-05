import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalGenerationSettingsPage } from '../../../../src/shared/ui/pages/global-generation-settings-page';
import type { ModelGenerationSettingsController } from '../../../../src/shared/ui/hooks/use-model-generation-settings';
import { TestAppProviders } from '../../../helpers/render-helpers';
import { createFakeServices } from '../../../helpers/fakes';

let root: Root | undefined;

function createModelGenerationSettingsController(overrides: Partial<ModelGenerationSettingsController> = {}): ModelGenerationSettingsController {
  const selection = {
    cellId: 'text_to_image:auto:auto:png',
    imageSize: 'auto',
    ratio: 'auto',
    outputFormat: 'png',
  } as const;
  return {
    context: {
      profileId: 'mock-profile',
      apiFormat: 'openai-images',
      modelId: 'gpt-image-2',
      operation: 'text-to-image',
    },
    settings: null,
    loading: false,
    error: null,
    saveState: 'idle',
    imageSizeOptions: [
      { id: 'auto', label: 'Auto' },
      { id: '1k', label: '1K' },
      { id: '2k', label: '2K' },
      { id: '4k', label: '4K' },
    ],
    ratioOptions: [{ id: 'auto', label: 'Auto' }],
    outputFormatOptions: [
      { id: 'png', label: 'PNG' },
      { id: 'jpeg', label: 'JPEG' },
    ],
    selection,
    requestOutput: { kind: 'image-endpoint', size: 'auto', outputFormat: 'png' },
    ready: true,
    validationMessage: null,
    saveSelection: vi.fn(async () => true),
    selectImageSize: vi.fn(async () => true),
    selectRatio: vi.fn(async () => true),
    selectOutputFormat: vi.fn(async () => true),
    reload: vi.fn(async () => undefined),
    ...overrides,
  };
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

describe('GlobalGenerationSettingsPage', () => {
  it('keeps composer select positioning classes and opens each generation selector menu', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.appendChild(container);
    document.body.appendChild(panel);
    root = createRoot(container);

    Object.defineProperty(panel, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        top: 0,
        left: 0,
        right: 320,
        bottom: 600,
        width: 320,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      }),
    });

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <GlobalGenerationSettingsPage
            settings={{
              providerInputSizePreset: '2k',
            }}
            loading={false}
            error={null}
            saveState="idle"
            modelGenerationSettings={createModelGenerationSettingsController()}
            onSave={vi.fn(async () => undefined)}
            onNav={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    const selectors = [
      'global-output-size-selector',
      'global-output-format-selector',
      'global-aspect-ratio-selector',
      'provider-input-size-selector',
    ] as const;

    for (const testId of selectors) {
      const trigger = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      expect(trigger).not.toBeNull();
      expect(trigger?.closest('.cmp-select.settings-select')).not.toBeNull();
      expect(trigger?.closest('.settings-page')).not.toBeNull();

      Object.defineProperty(trigger!, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          top: 120,
          left: 24,
          right: 112,
          bottom: 148,
          width: 88,
          height: 28,
          x: 24,
          y: 120,
          toJSON: () => undefined,
        }),
      });

      await act(async () => {
        trigger!.click();
      });

      const menu = panel.querySelector<HTMLElement>(`[data-testid="${testId}-menu"]`);
      expect(menu).not.toBeNull();

      await act(async () => {
        container.querySelector<HTMLElement>('.page')!.click();
      });
    }
  });

  it('does not expose a provider response text toggle and saves generation settings only', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onSave = vi.fn(async () => undefined);
    const modelGenerationSettings = createModelGenerationSettingsController();

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <GlobalGenerationSettingsPage
            settings={{
              providerInputSizePreset: '2k',
            }}
            loading={false}
            error={null}
            saveState="idle"
            modelGenerationSettings={modelGenerationSettings}
            onSave={onSave}
            onNav={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    expect(container.textContent).not.toContain('provider response text');
    expect(container.querySelector('.settings-page .btn-save')).toBeNull();
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="global-output-format-selector"]')!.click();
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="global-output-format-selector-option-jpeg"]')!.click();
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(modelGenerationSettings.selectOutputFormat).toHaveBeenCalledWith('jpeg');
  });

  it('saves output size changes when model config does not expose local size limits', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onSave = vi.fn(async () => undefined);
    const modelGenerationSettings = createModelGenerationSettingsController();

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <GlobalGenerationSettingsPage
            settings={{
              providerInputSizePreset: '2k',
            }}
            loading={false}
            error={null}
            saveState="idle"
            modelGenerationSettings={modelGenerationSettings}
            onSave={onSave}
            onNav={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="global-output-size-selector"]')!.click();
    });
    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="global-output-size-selector-option-4k"]')!.click();
    });

    expect(container.querySelector('[data-testid="toast"]')?.textContent ?? '').not.toContain('此模型不支持 4K');
    expect(onSave).not.toHaveBeenCalled();
    expect(modelGenerationSettings.selectImageSize).toHaveBeenCalledWith('4k');
  });

  it('saves the provider input size preset label from the selector', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const onSave = vi.fn(async () => undefined);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <GlobalGenerationSettingsPage
            settings={{
              providerInputSizePreset: '1k',
            }}
            loading={false}
            error={null}
            saveState="idle"
            modelGenerationSettings={createModelGenerationSettingsController()}
            onSave={onSave}
            onNav={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    expect(container.querySelector('[data-testid="provider-input-max-side-input"]')).toBeNull();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-input-size-selector"]')!.click();
    });
    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="provider-input-size-selector-option-4k"]')!.click();
    });

    expect(onSave).toHaveBeenCalledWith({
      providerInputSizePreset: '4k',
    });
  });

  it('shows copyable log and generated image paths', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <GlobalGenerationSettingsPage
            settings={{
              providerInputSizePreset: '1k',
            }}
            loading={false}
            error={null}
            saveState="idle"
            modelGenerationSettings={createModelGenerationSettingsController()}
            onSave={vi.fn(async () => undefined)}
            onNav={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    expect(container.querySelector('[data-testid="global-settings-log-path"]')?.textContent).toContain('/fake/data/logs/2026-07-02/imagen.jsonl');
    expect(container.querySelector('[data-testid="global-settings-generated-image-path"]')?.textContent).toContain('/fake/data/uxp-asset-*');
    expect(container.querySelector('[data-testid="global-settings-copy-log-path"]')?.className).toContain('field-input-action');
    expect(container.querySelector('[data-testid="global-settings-copy-generated-image-path"]')?.className).toContain('field-input-action');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="global-settings-copy-log-path"]')!.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="global-settings-copy-generated-image-path"]')!.click();
    });

    expect(writeText).toHaveBeenCalledWith('/fake/data/logs/2026-07-02/imagen.jsonl');
    expect(writeText).toHaveBeenCalledWith('/fake/data/uxp-asset-*');
  });

  it('renders footer statement', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <GlobalGenerationSettingsPage
            settings={{
              providerInputSizePreset: '1k',
            }}
            loading={false}
            error={null}
            saveState="saved"
            modelGenerationSettings={createModelGenerationSettingsController()}
            onSave={vi.fn(async () => undefined)}
            onNav={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    expect(container.querySelector('[data-testid="global-settings-footer-statement"]')?.textContent).toContain('Imagen PS');
    expect(container.querySelector('.generation-settings-footer')).toBeNull();
    expect(container.querySelector('[data-testid="global-settings-save-status"]')?.textContent).toContain('已保存');
  });

  it('renders storage and error states as settings notices instead of raw text blocks', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <GlobalGenerationSettingsPage
            settings={{
              providerInputSizePreset: '1k',
            }}
            loading={false}
            error="save failed"
            saveState="error"
            modelGenerationSettings={createModelGenerationSettingsController()}
            onSave={vi.fn(async () => undefined)}
            onNav={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    expect(container.querySelector('[data-testid="global-settings-error-notice"] .status-notice.error')).not.toBeNull();
    expect(container.querySelector('[data-testid="global-settings-save-status"]')?.textContent).toContain('save failed');
    const storageHint = container.querySelectorAll('.generation-settings-section-hint')[1];
    expect(storageHint?.textContent ?? '').toContain('运行路径与生成图片保存位置。');
  });
});
