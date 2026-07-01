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
  it('keeps composer select positioning classes and opens each output selector menu', async () => {
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
              providerInputMaxSide: 2048,
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
});
