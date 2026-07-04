import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptSettingsPage } from '../src/shared/ui/pages/prompt-settings-page';
import { PromptPresetDetailPage } from '../src/shared/ui/pages/prompt-preset-detail-page';
import { createFakeServices, fakeProfile } from './fakes';
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

function queryByTestId(container: HTMLElement, testId: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!element) {
    throw new Error(`Missing element: ${testId}`);
  }
  return element;
}

describe('PromptSettingsPage', () => {
  it('keeps preset selection and editing as distinct interactions', async () => {
    const { services } = createFakeServices();
    const onSelectPreset = vi.fn(async () => undefined);
    const onOpenPreset = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <PromptSettingsPage
            onNav={() => undefined}
            settings={{
              optimization: { profileId: null, template: '{prompt}' },
              presets: {
                selectedId: null,
                items: [{ id: 'preset-a', name: 'A', mode: 'append', content: 'cinematic' }],
              },
            }}
            profiles={[fakeProfile]}
            loading={false}
            error={null}
            saveState="idle"
            templateValid
            activationState="no-profile"
            presetViews={[{
              preset: { id: 'preset-a', name: 'A', mode: 'append', content: 'cinematic' },
              selected: false,
              contentValid: true,
              effectState: 'none',
            }]}
            onSave={async () => undefined}
            onSelectPreset={onSelectPreset}
            onDeletePreset={async () => undefined}
            onOpenPreset={onOpenPreset}
          />
        </TestAppProviders>,
      );
    });

    await act(async () => {
      queryByTestId(container, 'prompt-preset-row-preset-a').click();
    });
    expect(onOpenPreset).toHaveBeenCalledWith('preset-a');
    expect(onSelectPreset).not.toHaveBeenCalled();

    await act(async () => {
      queryByTestId(container, 'prompt-preset-selector').click();
    });
    await act(async () => {
      queryByTestId(document.body, 'prompt-preset-selector-option-preset-a').click();
    });
    expect(onSelectPreset).toHaveBeenCalledWith('preset-a');
  });

  it('shows invalid reasons as text and allows saving invalid preset detail', async () => {
    const { services } = createFakeServices();
    const onSave = vi.fn(async () => undefined);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root!.render(
        <TestAppProviders services={services}>
          <PromptPresetDetailPage
            onNav={() => undefined}
            preset={{ id: 'preset-invalid', name: 'Invalid', mode: 'replace', content: '{Prompt}' }}
            onSave={onSave}
          />
        </TestAppProviders>,
      );
    });

    expect(queryByTestId(container, 'prompt-preset-content-status').textContent).toContain('必须恰好包含一个小写 {prompt}');
    const saveButton = queryByTestId(container, 'provider-save-button') as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);
    await act(async () => {
      saveButton.click();
    });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      id: 'preset-invalid',
      mode: 'replace',
      content: '{Prompt}',
    }));
  });
});
