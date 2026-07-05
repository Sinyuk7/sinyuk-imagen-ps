import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useGenerationSettings } from '../src/shared/ui/hooks/use-generation-settings';
import { TestAppProviders } from './render-helpers';
import { createFakeServices } from './fakes';
import type { AppGenerationSettings } from '../src/shared/ports/app-generation-settings';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

describe('useGenerationSettings', () => {
  it('serializes realtime saves and persists the latest requested app-local input settings', async () => {
    const { services } = createFakeServices();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    let resolveFirstSave: (() => void) | null = null;
    const persisted: AppGenerationSettings[] = [];
    const originalSave = services.generationSettings.save.bind(services.generationSettings);
    const saveSpy = vi.fn(async (settings: AppGenerationSettings) => {
      persisted.push(settings);
      if (!resolveFirstSave) {
        await new Promise<void>((resolve) => {
          resolveFirstSave = resolve;
        });
      }
      await originalSave(settings);
    });
    services.generationSettings.save = saveSpy;

    function Harness() {
      const state = useGenerationSettings(services);
      return (
        <div>
          <button
            data-testid="save-jpeg"
            onClick={() => {
              void state.save({
                ...state.settings,
                providerInputSizePreset: '2k',
              });
            }}
          />
          <button
            data-testid="save-webp"
            onClick={() => {
              void state.save({
                ...state.settings,
                providerInputSizePreset: '4k',
              });
            }}
          />
          <div data-testid="settings-provider-input-size">{state.settings.providerInputSizePreset}</div>
          <div data-testid="save-state">{state.saveState}</div>
          <div data-testid="save-error">{state.error ?? ''}</div>
        </div>
      );
    }

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <Harness />
        </TestAppProviders>,
      );
    });

    expect(container.querySelector('[data-testid="settings-provider-input-size"]')?.textContent).toBe('1k');

    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="save-jpeg"]')!.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="save-webp"]')!.click();
    });

    expect(container.querySelector('[data-testid="settings-provider-input-size"]')?.textContent).toBe('4k');
    expect(container.querySelector('[data-testid="save-state"]')?.textContent).toBe('saving');
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(persisted[0]?.providerInputSizePreset).toBe('2k');

    await act(async () => {
      resolveFirstSave?.();
      await Promise.resolve();
    });

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect(persisted[1]?.providerInputSizePreset).toBe('4k');
    expect(container.querySelector('[data-testid="settings-provider-input-size"]')?.textContent).toBe('4k');
    expect(container.querySelector('[data-testid="save-error"]')?.textContent).toBe('');
  });
});
