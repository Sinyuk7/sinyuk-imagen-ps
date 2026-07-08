import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProviderProfile } from '@imagen-ps/application';
import { SettingsAddPage } from '../../../../src/shared/ui/pages/settings-add-page';
import { SettingsDetailPage } from '../../../../src/shared/ui/pages/settings-detail-page';
import { TestAppProviders } from '../../../helpers/render-helpers';
import { createFakeServices, fakeProfile } from '../../../helpers/fakes';
import { changeInput, flush, queryByTestId } from '../../../helpers/settings-detail-harness';

let root: Root | undefined;

async function cleanupRoot(): Promise<void> {
  if (root) {
    await act(async () => {
      root!.unmount();
    });
  }
  root = undefined;
  document.body.innerHTML = '';
}

async function renderAddPage(container: HTMLElement, options?: {
  readonly profiles?: readonly ProviderProfile[];
  readonly onProfileSaved?: ReturnType<typeof vi.fn>;
}) {
  const fake = createFakeServices({ profiles: options?.profiles });
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <TestAppProviders services={fake.services}>
        <SettingsAddPage
          onNav={vi.fn()}
          profiles={options?.profiles ?? []}
          onProfileSaved={options?.onProfileSaved ?? vi.fn(async () => undefined)}
          onOpenModelConfiguration={vi.fn()}
        />
      </TestAppProviders>,
    );
  });
  await flush();
  await flush();
  return fake;
}

async function renderDetailPage(container: HTMLElement, profile: ProviderProfile) {
  const fake = createFakeServices({ profiles: [profile] });
  const onNav = vi.fn();
  const onProfilesChanged = vi.fn(async () => undefined);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <TestAppProviders services={fake.services}>
        <SettingsDetailPage
          onNav={onNav}
          profileId={profile.profileId}
          onProfilesChanged={onProfilesChanged}
          onOpenModelConfiguration={vi.fn()}
        />
      </TestAppProviders>,
    );
  });
  await flush();
  await flush();
  return { fake, onNav, onProfilesChanged };
}

async function clickTestId(container: HTMLElement, testId: string): Promise<void> {
  await act(async () => {
    queryByTestId(container, testId).click();
  });
  await flush();
  await flush();
}

async function selectOption(container: HTMLElement, testId: string, optionId: string): Promise<void> {
  await clickTestId(container, testId);
  await act(async () => {
    document.body.querySelector<HTMLElement>(`[data-testid="${testId}-option-${optionId}"]`)?.click();
  });
  await flush();
  await flush();
}

async function inputTestId(container: HTMLElement, testId: string, value: string): Promise<void> {
  await act(async () => {
    changeInput(queryByTestId(container, testId), value);
  });
  await flush();
  await flush();
}

function optionIds(testId: string): readonly string[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(`[data-testid^="${testId}-option-"]`))
    .map((element) => element.dataset.testid?.slice(`${testId}-option-`.length) ?? '');
}

function createBillingTokenProfile(): ProviderProfile {
  return {
    ...fakeProfile,
    apiFormat: 'openai-chat-completions',
    displayName: 'Relay Billing',
    selectedModelIds: [],
    defaultModelId: undefined,
    config: {
      apiFormat: 'openai-chat-completions',
      displayName: 'Relay Billing',
      connection: {
        selectionMode: 'manual',
        selectedEndpointId: 'primary',
        endpoints: [{
          id: 'primary',
          url: 'https://relay.test/v1',
          enabled: true,
        }],
      },
      paths: {
        invoke: '/chat/completions',
      },
      billing: {
        source: 'billing-token',
        path: '/client/openapi/getCredits',
        userId: '10001',
        tokenSecretRef: 'secret:provider-profile:mock-profile:billingToken',
      },
    },
    secretRefs: {
      ...fakeProfile.secretRefs,
      billingToken: 'secret:provider-profile:mock-profile:billingToken',
    },
  };
}

describe('provider billing settings UI', () => {
  afterEach(async () => {
    await cleanupRoot();
  });

  it('shows only simplified billing modes on add page and validates current-api-key mode', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onProfileSaved = vi.fn(async () => undefined);
    const fake = await renderAddPage(container, { onProfileSaved });

    await inputTestId(container, 'provider-endpoint-detect-input', 'https://relay.test/v1/chat/completions');

    await clickTestId(container, 'provider-billing-mode-selector');
    expect(optionIds('provider-billing-mode-selector')).toEqual([
      'disabled',
      'profile-api-key',
      'billing-token',
    ]);

    await act(async () => {
      document.body.querySelector<HTMLElement>('[data-testid="provider-billing-mode-selector-option-profile-api-key"]')?.click();
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-testid="provider-billing-path-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-billing-access-token-input"]')).toBeNull();

    await clickTestId(container, 'provider-save-button');
    expect(document.body.textContent).toContain('查询路径必填，且必须以 / 开头。');
    expect(fake.spies.saveProviderProfile).not.toHaveBeenCalled();

    await inputTestId(container, 'provider-billing-path-input', '/client/openapi/getAPIKeyCredits');

    await clickTestId(container, 'provider-save-button');
    expect(document.body.textContent).toContain('当前 API Key 模式需要已保存或当前填写的 API Key。');
    expect(fake.spies.saveProviderProfile).not.toHaveBeenCalled();

    await inputTestId(container, 'provider-api-key-input', 'sk-live');

    await clickTestId(container, 'provider-save-button');

    expect(fake.spies.saveProviderProfile).toHaveBeenCalledTimes(1);
    expect(fake.spies.saveProviderProfile.mock.calls[0]?.[0]).toMatchObject({
      apiFormat: 'openai-chat-completions',
      secretValues: {
        apiKey: 'sk-live',
      },
      config: {
        billing: {
          source: 'profile-api-key',
          path: '/client/openapi/getAPIKeyCredits',
        },
      },
    });
    expect(onProfileSaved).toHaveBeenCalledTimes(1);
  });

  it('replaces saved billing token on detail page', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { fake, onProfilesChanged } = await renderDetailPage(container, createBillingTokenProfile());

    await flush();
    await flush();
    expect((queryByTestId(container, 'provider-save-button') as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('[data-testid="provider-billing-path-input"]')).not.toBeNull();
    expect((queryByTestId(container, 'provider-billing-user-id-input') as HTMLInputElement).value).toBe('10001');
    expect(container.querySelector('[data-testid="provider-billing-access-token-input"]')).toBeNull();

    await clickTestId(container, 'provider-billing-access-token-edit');
    await inputTestId(container, 'provider-billing-access-token-input', 'billing-next');

    await clickTestId(container, 'provider-save-button');

    expect(fake.spies.saveProviderProfile).toHaveBeenCalledTimes(1);
    expect(fake.spies.saveProviderProfile.mock.calls[0]?.[0]).toMatchObject({
      profileId: 'mock-profile',
      secretValues: {
        billingToken: 'billing-next',
      },
      config: {
        billing: {
          source: 'billing-token',
          path: '/client/openapi/getCredits',
          userId: '10001',
          tokenSecretRef: 'secret:pending:billingToken',
        },
      },
    });
    expect(onProfilesChanged).toHaveBeenCalledWith('mock-profile');
  });

  it('saves latest billing path when token edit already made form dirty', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const profile = createBillingTokenProfile();
    profile.config = {
      ...profile.config,
      billing: {
        ...(profile.config.billing as NonNullable<ProviderProfile['config']['billing']>),
        path: '/client/openapi/getAPIKeyCredits',
      },
    };
    const { fake } = await renderDetailPage(container, profile);

    await clickTestId(container, 'provider-billing-access-token-edit');
    await inputTestId(container, 'provider-billing-access-token-input', 'billing-next');

    await act(async () => {
      changeInput(queryByTestId(container, 'provider-billing-path-input'), '/client/openapi/getCredits');
      queryByTestId(container, 'provider-save-button').click();
    });
    await flush();
    await flush();

    expect(fake.spies.saveProviderProfile).toHaveBeenCalledTimes(1);
    expect(fake.spies.saveProviderProfile.mock.calls[0]?.[0]).toMatchObject({
      profileId: 'mock-profile',
      secretValues: {
        billingToken: 'billing-next',
      },
      config: {
        billing: {
          source: 'billing-token',
          path: '/client/openapi/getCredits',
          userId: '10001',
          tokenSecretRef: 'secret:pending:billingToken',
        },
      },
    });
  });

  it('removes saved billing token when detail page switches billing to disabled', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { fake } = await renderDetailPage(container, createBillingTokenProfile());

    await selectOption(container, 'provider-billing-mode-selector', 'disabled');
    expect(container.querySelector('[data-testid="provider-billing-path-input"]')).toBeNull();

    await clickTestId(container, 'provider-save-button');

    expect(fake.spies.saveProviderProfile).toHaveBeenCalledTimes(1);
    expect(fake.spies.saveProviderProfile.mock.calls[0]?.[0]).toMatchObject({
      profileId: 'mock-profile',
      removedSecretNames: ['billingToken'],
      config: {
        billing: {
          source: 'disabled',
        },
      },
    });
    expect(fake.spies.saveProviderProfile.mock.calls[0]?.[0]?.secretValues).toBeUndefined();
  });
});
