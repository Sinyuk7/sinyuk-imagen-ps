import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderProfile } from '@imagen-ps/application';
import { ProfileModelsPage } from '../../../../src/shared/ui/pages/profile-models-page';
import { TestAppProviders } from '../../../helpers/render-helpers';
import { createFakeServices, fakeProfile, profileModelItem } from '../../../helpers/fakes';

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

async function renderPage(options?: {
  readonly services?: ReturnType<typeof createFakeServices>['services'];
  readonly profile?: ProviderProfile;
  readonly onBack?: () => void;
  readonly onCreate?: () => void;
  readonly onEdit?: (modelId: string) => void;
}): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(
      <TestAppProviders services={options?.services ?? createFakeServices().services} locale="en">
        <ProfileModelsPage
          profile={options?.profile ?? fakeProfile}
          onBack={options?.onBack ?? vi.fn()}
          onCreate={options?.onCreate ?? vi.fn()}
          onEdit={options?.onEdit ?? vi.fn()}
        />
      </TestAppProviders>,
    );
  });
  await flush();
  await flush();
  return container;
}

describe('ProfileModelsPage', () => {
  it('projects persisted configs and edits by modelId', async () => {
    const onEdit = vi.fn();
    const { services } = createFakeServices({
      profileModelItems: [profileModelItem('owned-model', {
        wireModelId: 'owned-model-wire',
        displayName: 'Owned model note',
        configSource: 'user',
      })],
    });
    const container = await renderPage({ services, onEdit });
    const row = container.querySelector<HTMLElement>('[data-testid="profile-model-row-owned-model"]');

    expect(row?.querySelector('.prov-name')?.textContent).toBe('owned-model-wire');
    expect(row?.querySelector('.model-config-meta-note')?.textContent).toBe('Owned model note');
    expect(container.querySelector('[data-testid="profile-models-refresh-button"]')).toBeNull();
    expect(container.querySelector('[data-testid^="profile-model-suggestion-row-"]')).toBeNull();

    await act(async () => row?.click());
    expect(onEdit).toHaveBeenCalledWith('owned-model');
  });

  it('renders empty-state guidance for profiles without models', async () => {
    const { services } = createFakeServices({ profileModelItems: [] });
    const container = await renderPage({ services });
    const empty = container.querySelector<HTMLElement>('[data-testid="profile-model-empty-notice"]');

    expect(empty?.getAttribute('aria-disabled')).toBe('true');
    expect(empty?.hasAttribute('tabindex')).toBe(false);
  });

  it('uses inert replacement rows while loading and after a load error', async () => {
    let resolveModels: ((value: { readonly ok: false; readonly error: { readonly category: string; readonly message: string } }) => void) | undefined;
    const base = createFakeServices({ profileModelItems: [] });
    const listProfileModels = vi.fn(() => new Promise<{ readonly ok: false; readonly error: { readonly category: string; readonly message: string } }>((resolve) => {
      resolveModels = resolve;
    }));
    const container = await renderPage({ services: { ...base.services, commands: { ...base.services.commands, listProfileModels } } });

    expect(container.querySelector('[data-testid="profile-model-list-loading"]')?.getAttribute('aria-disabled')).toBe('true');
    await act(async () => resolveModels?.({ ok: false, error: { category: 'provider', message: 'List failed' } }));
    await flush();
    expect(container.querySelector('[data-testid="profile-model-list-error"]')?.textContent).toContain('List failed');
  });

  it('exposes back and create callbacks', async () => {
    const onBack = vi.fn();
    const onCreate = vi.fn();
    const container = await renderPage({ onBack, onCreate });

    await act(async () => container.querySelector<HTMLElement>('[data-testid="profile-models-add-button"]')?.click());
    await act(async () => container.querySelector<HTMLElement>('[data-testid="profile-models-back-button"]')?.click());
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onBack).toHaveBeenCalledOnce();
  });
});
