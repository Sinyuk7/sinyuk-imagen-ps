import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderProfile } from '@imagen-ps/application';
import { ProfileModelsPage } from '../../../../src/shared/ui/pages/profile-models-page';
import { TestAppProviders } from '../../../helpers/render-helpers';
import { createFakeServices, fakeProfile, profileModelItem } from '../../../helpers/fakes';

let root: Root | undefined;

interface DiscoveredModel {
  readonly id: string;
}

afterEach(async () => {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  document.body.innerHTML = '';
});

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function renderPage(options?: {
  readonly services?: ReturnType<typeof createFakeServices>['services'];
  readonly profile?: ProviderProfile;
  readonly onBack?: () => void;
  readonly onChanged?: () => Promise<void>;
  readonly onCreate?: () => void;
  readonly onEdit?: (modelId: string) => void;
  readonly onSuggestion?: (modelId: string) => void;
}): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const services = options?.services ?? createFakeServices().services;

  await act(async () => {
    root!.render(
      <TestAppProviders services={services} locale="en">
        <div className="panel">
          <ProfileModelsPage
            profile={options?.profile ?? fakeProfile}
            onBack={options?.onBack ?? vi.fn()}
            onChanged={options?.onChanged ?? vi.fn(async () => undefined)}
            onCreate={options?.onCreate ?? vi.fn()}
            onEdit={options?.onEdit ?? vi.fn()}
            onSuggestion={options?.onSuggestion ?? vi.fn()}
          />
        </div>
      </TestAppProviders>,
    );
  });
  await flush();
  await flush();
  return container;
}

function discovered(id: string): DiscoveredModel {
  return { id };
}

describe('ProfileModelsPage', () => {
  it('renders owned configs first and edits by modelId', async () => {
    const onEdit = vi.fn();
    const { services } = createFakeServices({
      profileModelItems: [
        profileModelItem('owned-model', {
          wireModelId: 'owned-model-wire',
          default: true,
          selected: true,
          configSource: 'user',
        }),
      ],
    });
    const container = await renderPage({
      services,
      profile: { ...fakeProfile, defaultModelId: 'owned-model' },
      onEdit,
    });

    const row = container.querySelector<HTMLElement>('[data-testid="profile-model-row-owned-model"]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('owned-model');
    expect(row?.textContent).toContain('Default');

    await act(async () => {
      row?.click();
    });
    await flush();

    expect(onEdit).toHaveBeenCalledWith('owned-model');
  });

  it('sets a configured model as explicit default', async () => {
    const onChanged = vi.fn(async () => undefined);
    const { services, spies } = createFakeServices({
      profileModelItems: [
        profileModelItem('first-model', { default: true, selected: true }),
        profileModelItem('second-model', { default: false, selected: false }),
      ],
    });
    const container = await renderPage({
      services,
      profile: { ...fakeProfile, defaultModelId: 'first-model' },
      onChanged,
    });

    const setDefaultButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Set default'));
    expect(setDefaultButton).not.toBeUndefined();

    await act(async () => {
      setDefaultButton?.click();
    });
    await flush();
    await flush();

    expect(spies.saveProviderProfile).toHaveBeenCalledWith({
      profileId: fakeProfile.profileId,
      apiFormat: fakeProfile.apiFormat,
      defaultModelId: 'second-model',
    });
    expect(onChanged).toHaveBeenCalled();
  });

  it('keeps discovery suggestions runtime-only until explicit editor save', async () => {
    const onSuggestion = vi.fn();
    const base = createFakeServices({
      profileModelItems: [profileModelItem('owned-model')],
    });
    const refreshProfileModels = vi.fn(async () => ({
      ok: true as const,
      value: [
        discovered('suggestion-a'),
        discovered('owned-model'),
        discovered('suggestion-a'),
        discovered('suggestion-b'),
      ],
    }));
    const services = {
      ...base.services,
      commands: {
        ...base.services.commands,
        refreshProfileModels,
      },
    };
    const container = await renderPage({ services, onSuggestion });

    await act(async () => {
      Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
        .find((button) => button.textContent?.includes('Refresh models'))?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="profile-model-suggestion-row-suggestion-a"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="profile-model-suggestion-row-suggestion-b"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="profile-model-suggestion-row-owned-model"]')).toBeNull();
    expect(Array.from(container.querySelectorAll<HTMLElement>('[data-testid^="profile-model-suggestion-row-"]'))
      .map((row) => row.dataset.testid)).toEqual([
      'profile-model-suggestion-row-suggestion-a',
      'profile-model-suggestion-row-suggestion-b',
    ]);
    expect(base.spies.saveUserModelConfig).not.toHaveBeenCalled();

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="profile-model-suggestion-row-suggestion-a"]')?.click();
    });
    await flush();

    expect(onSuggestion).toHaveBeenCalledWith('suggestion-a');
    expect(base.spies.saveUserModelConfig).not.toHaveBeenCalled();
  });

  it('keeps existing suggestions when refresh fails', async () => {
    const base = createFakeServices({ profileModelItems: [] });
    const refreshProfileModels = vi.fn()
      .mockResolvedValueOnce({ ok: true as const, value: [discovered('suggestion-a')] })
      .mockResolvedValueOnce({
        ok: false as const,
        error: { category: 'provider', message: 'Discovery failed' },
      });
    const services = {
      ...base.services,
      commands: {
        ...base.services.commands,
        refreshProfileModels,
      },
    };
    const container = await renderPage({ services });
    const refreshButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Refresh models'));

    await act(async () => {
      refreshButton?.click();
    });
    await flush();
    await flush();
    expect(container.querySelector('[data-testid="profile-model-suggestion-row-suggestion-a"]')).not.toBeNull();

    await act(async () => {
      refreshButton?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="profile-model-suggestion-row-suggestion-a"]')).not.toBeNull();
    expect(container.textContent).toContain('Discovery failed');
  });

  it('disables repeated discovery while refresh is pending', async () => {
    let resolveRefresh: ((value: { readonly ok: true; readonly value: readonly DiscoveredModel[] }) => void) | undefined;
    const base = createFakeServices({ profileModelItems: [] });
    const refreshProfileModels = vi.fn(() => new Promise<{ readonly ok: true; readonly value: readonly DiscoveredModel[] }>((resolve) => {
      resolveRefresh = resolve;
    }));
    const services = {
      ...base.services,
      commands: {
        ...base.services.commands,
        refreshProfileModels,
      },
    };
    const container = await renderPage({ services });
    const refreshButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.includes('Refresh models'));

    await act(async () => {
      refreshButton?.click();
    });
    await flush();

    expect(refreshButton?.disabled).toBe(true);
    expect(refreshProfileModels).toHaveBeenCalledTimes(1);

    await act(async () => {
      refreshButton?.click();
    });
    await flush();
    expect(refreshProfileModels).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRefresh?.({ ok: true, value: [discovered('suggestion-a')] });
    });
    await flush();
    await flush();
    expect(container.querySelector('[data-testid="profile-model-suggestion-row-suggestion-a"]')).not.toBeNull();
  });

  it('exposes back and create callbacks', async () => {
    const onBack = vi.fn();
    const onCreate = vi.fn();
    const container = await renderPage({ onBack, onCreate });

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="profile-models-add-button"]')?.click();
    });
    await flush();
    expect(onCreate).toHaveBeenCalledTimes(1);

    await act(async () => {
      container.querySelector<HTMLElement>('[data-testid="profile-models-back-button"]')?.click();
    });
    await flush();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
