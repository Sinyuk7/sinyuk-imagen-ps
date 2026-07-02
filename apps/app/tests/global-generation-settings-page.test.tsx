import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlobalGenerationSettingsPage } from '../src/shared/ui/pages/global-generation-settings-page';
import { TestAppProviders } from './render-helpers';
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
            onSave={onSave}
            onNav={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    expect(container.textContent).not.toContain('provider response text');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="global-settings-save-button"]')!.click();
    });

    expect(onSave).toHaveBeenCalledWith({
      outputSizePreset: '2k',
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
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="global-settings-save-button"]')!.click();
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
            onSave={vi.fn(async () => undefined)}
            onNav={vi.fn()}
          />
        </TestAppProviders>,
      );
    });

    expect(container.querySelector('[data-testid="global-settings-footer-statement"]')?.textContent).toContain('Imagen PS');
    expect(container.querySelector('.generation-settings-footer')).not.toBeNull();
  });
});
