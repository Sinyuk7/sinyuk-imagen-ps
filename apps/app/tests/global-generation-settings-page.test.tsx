import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalGenerationSettingsPage } from '../src/shared/ui/pages/global-generation-settings-page';
import { TestAppProviders } from './render-helpers';
import { createFakeServices } from './fakes';

let root: Root | undefined;

const textComposerContext = {
  kind: 'composer',
  model: undefined,
  operation: 'text-to-image',
} as const;

const imageEditOnly1kContext = {
  kind: 'composer',
  model: {
    id: 'image-edit-only-1k',
    configured: true,
    selected: true,
  },
  operation: 'image-edit',
} as const;

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
              outputSizePreset: '2k',
              outputFormat: 'png',
              aspectRatio: 'auto',
              providerInputSizePreset: '2k',
            }}
            loading={false}
            error={null}
            saveState="idle"
            outputSizeContext={textComposerContext}
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

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <GlobalGenerationSettingsPage
            settings={{
              outputSizePreset: '2k',
              outputFormat: 'png',
              aspectRatio: 'auto',
              providerInputSizePreset: '2k',
            }}
            loading={false}
            error={null}
            saveState="idle"
            outputSizeContext={textComposerContext}
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

    expect(onSave).toHaveBeenCalledWith({
      outputSizePreset: '2k',
      outputFormat: 'jpeg',
      aspectRatio: 'auto',
      providerInputSizePreset: '2k',
    });
  });

  it('saves output size changes when model config does not expose local size limits', async () => {
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
              outputSizePreset: '2k',
              outputFormat: 'png',
              aspectRatio: 'auto',
              providerInputSizePreset: '2k',
            }}
            loading={false}
            error={null}
            saveState="idle"
            outputSizeContext={imageEditOnly1kContext}
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
    expect(onSave).toHaveBeenCalledWith({
      outputSizePreset: '4k',
      outputFormat: 'png',
      aspectRatio: 'auto',
      providerInputSizePreset: '2k',
    });
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
              outputSizePreset: '2k',
              outputFormat: 'png',
              aspectRatio: 'auto',
              providerInputSizePreset: '1k',
            }}
            loading={false}
            error={null}
            saveState="idle"
            outputSizeContext={textComposerContext}
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
      outputSizePreset: '2k',
      outputFormat: 'png',
      aspectRatio: 'auto',
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
              outputSizePreset: '2k',
              outputFormat: 'png',
              aspectRatio: 'auto',
              providerInputSizePreset: '1k',
            }}
            loading={false}
            error={null}
            saveState="idle"
            outputSizeContext={textComposerContext}
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
              outputSizePreset: '2k',
              outputFormat: 'png',
              aspectRatio: 'auto',
              providerInputSizePreset: '1k',
            }}
            loading={false}
            error={null}
            saveState="saved"
            outputSizeContext={textComposerContext}
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
              outputSizePreset: '2k',
              outputFormat: 'png',
              aspectRatio: 'auto',
              providerInputSizePreset: '1k',
            }}
            loading={false}
            error="save failed"
            saveState="error"
            outputSizeContext={textComposerContext}
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
