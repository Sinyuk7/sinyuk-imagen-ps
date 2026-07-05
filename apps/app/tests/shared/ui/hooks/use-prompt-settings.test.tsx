import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFakeServices, fakeProfile } from '../../../helpers/fakes';
import { TestAppProviders } from '../../../helpers/render-helpers';
import {
  createPromptPresetDraft,
  countPromptPlaceholders,
  derivePromptOptimizationActivationState,
  hasExactlyOnePromptPlaceholder,
  promptPresetContentValid,
  usePromptSettings,
  type PromptSettingsState,
} from '../../../../src/shared/ui/hooks/use-prompt-settings';
import type { AppServices } from '../../../../src/app-services/app-services';

let root: Root | undefined;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
});

function flush(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function Probe({ services, onState }: {
  readonly services: AppServices;
  readonly onState: (state: PromptSettingsState) => void;
}) {
  const state = usePromptSettings(services);
  onState(state);
  return <div data-testid="state">{state.activationState}:{state.saveState}</div>;
}

async function renderProbe(services: AppServices): Promise<PromptSettingsState[]> {
  const states: PromptSettingsState[] = [];
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <TestAppProviders services={services}>
        <Probe services={services} onState={(state) => states.push(state)} />
      </TestAppProviders>,
    );
  });
  await act(async () => {
    await flush();
  });
  return states;
}

describe('prompt settings viewmodel', () => {
  it('validates lowercase prompt placeholder counts only', () => {
    expect(countPromptPlaceholders('no placeholder')).toBe(0);
    expect(countPromptPlaceholders('{prompt}')).toBe(1);
    expect(countPromptPlaceholders('{prompt} and {prompt}')).toBe(2);
    expect(hasExactlyOnePromptPlaceholder('{Prompt}')).toBe(false);
    expect(hasExactlyOnePromptPlaceholder('{prompt}')).toBe(true);
  });

  it('derives optimization activation separately from template validity', () => {
    expect(derivePromptOptimizationActivationState({
      optimization: { profileId: null, template: 'use {prompt}' },
      presets: { selectedId: null, items: [] },
    }, [fakeProfile])).toBe('no-profile');
    expect(derivePromptOptimizationActivationState({
      optimization: { profileId: fakeProfile.profileId, template: 'use {prompt}' },
      presets: { selectedId: null, items: [] },
    }, [fakeProfile])).toBe('active');
    expect(derivePromptOptimizationActivationState({
      optimization: { profileId: 'missing-profile', template: 'use {prompt}' },
      presets: { selectedId: null, items: [] },
    }, [fakeProfile])).toBe('missing-profile');
    expect(derivePromptOptimizationActivationState({
      optimization: { profileId: fakeProfile.profileId, template: 'use {Prompt}' },
      presets: { selectedId: null, items: [] },
    }, [fakeProfile])).toBe('invalid-template');
  });

  it('initializes missing root once and does not reseed empty preset lists', async () => {
    const { services } = createFakeServices({ promptSettings: null });
    const saveSpy = vi.spyOn(services.promptSettings, 'save');
    const states = await renderProbe(services);
    expect(states.at(-1)?.settings.presets.items).toHaveLength(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await states.at(-1)!.save({
        ...states.at(-1)!.settings,
        presets: { selectedId: null, items: [] },
      });
      await states.at(-1)!.reload();
    });

    expect(states.at(-1)?.settings.presets.items).toEqual([]);
    expect(saveSpy).toHaveBeenCalledTimes(2);
  });

  it('surfaces missing profile then persists optimization profileId as null', async () => {
    const { services } = createFakeServices({
      profiles: [fakeProfile],
      promptSettings: {
        optimization: { profileId: 'deleted-profile', template: '{prompt}' },
        presets: { selectedId: null, items: [] },
      },
    });
    const states = await renderProbe(services);

    expect(states.some((state) => state.activationState === 'missing-profile')).toBe(true);
    expect(states.at(-1)?.settings.optimization.profileId).toBeNull();
  });

  it('keeps invalid optimization and preset settings saveable while deriving preset effect state', async () => {
    const { services } = createFakeServices({
      promptSettings: {
        optimization: { profileId: null, template: 'invalid' },
        presets: {
          selectedId: 'preset-replace',
          items: [{ id: 'preset-replace', name: 'Replace', mode: 'replace', content: '{Prompt}' }],
        },
      },
    });
    const states = await renderProbe(services);

    expect(states.at(-1)?.templateValid).toBe(false);
    expect(states.at(-1)?.presetViews[0]?.contentValid).toBe(false);
    expect(states.at(-1)?.presetViews[0]?.effectState).toBe('invalid-content');
    expect(promptPresetContentValid('prepend', '{Prompt}')).toBe(true);
    expect(promptPresetContentValid('append', 'anything')).toBe(true);
    expect(promptPresetContentValid('replace', 'before {prompt} after')).toBe(true);

    await act(async () => {
      const draft = { ...createPromptPresetDraft(), id: 'new-preset', mode: 'replace' as const, content: 'still invalid' };
      await states.at(-1)!.upsertPreset(draft);
      await states.at(-1)!.selectPreset('new-preset');
    });

    expect(states.at(-1)?.saveState).toBe('saved');
    expect(states.at(-1)?.selectedPreset?.id).toBe('new-preset');
    expect(states.at(-1)?.selectedPreset?.content).toBe('still invalid');
  });

  it('clears selectedId only when deleting the selected preset and preserves selection across rename', async () => {
    const { services } = createFakeServices({
      promptSettings: {
        optimization: { profileId: null, template: '{prompt}' },
        presets: {
          selectedId: 'preset-a',
          items: [
            { id: 'preset-a', name: 'A', mode: 'append', content: 'a' },
            { id: 'preset-b', name: 'B', mode: 'append', content: 'b' },
          ],
        },
      },
    });
    const states = await renderProbe(services);

    await act(async () => {
      await states.at(-1)!.upsertPreset({ id: 'preset-a', name: 'Renamed', mode: 'append', content: 'a' });
    });
    expect(states.at(-1)?.settings.presets.selectedId).toBe('preset-a');

    await act(async () => {
      await states.at(-1)!.deletePreset('preset-b');
    });
    expect(states.at(-1)?.settings.presets.selectedId).toBe('preset-a');

    await act(async () => {
      await states.at(-1)!.deletePreset('preset-a');
    });
    expect(states.at(-1)?.settings.presets.selectedId).toBeNull();
  });
});
