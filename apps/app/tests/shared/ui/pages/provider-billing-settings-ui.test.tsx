import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProfileBillingState, ProviderProfile } from '@imagen-ps/application';
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

async function renderDetailPage(
  container: HTMLElement,
  profile: ProviderProfile,
  options?: {
    readonly billingState?: ProfileBillingState;
  },
) {
  const fake = createFakeServices({ profiles: [profile] });
  if (options?.billingState) {
    fake.spies.getProfileBillingState.mockResolvedValue({ ok: true as const, value: options.billingState });
  }
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

async function mouseDownClickTestId(container: HTMLElement, testId: string): Promise<void> {
  await act(async () => {
    const element = queryByTestId(container, testId);
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    element.click();
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

function createCreditsBillingState(): ProfileBillingState {
  return {
    refreshState: 'idle',
    balance: {
      profileId: 'mock-profile',
      apiFormat: 'openai-chat-completions',
      checkedAt: Date.parse('2026-07-09T02:03:04.000Z'),
      snapshot: {
        primary: {
          kind: 'quota',
          remaining: '749400',
          unit: 'credits',
          usedPercent: 25,
        },
      },
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
    expect(container.querySelector('[data-testid="provider-billing-access-token-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="provider-billing-access-token-edit"]')).toBeNull();
    expect(document.body.textContent).toContain('仅用于查询余额，已安全保存。');

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

  it('renders billing balance summary as compact accent inline status on detail page', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await renderDetailPage(container, createBillingTokenProfile(), { billingState: createCreditsBillingState() });

    const summary = queryByTestId(container, 'provider-billing-summary');
    const text = summary.textContent?.replace(/\s+/g, ' ').trim();

    expect(text).toContain('当前余额');
    expect(text).toContain('749.4K');
    expect(text).toContain('credits');
    expect(text).toContain('25% used');
    expect(summary.getAttribute('aria-label')).toBe('当前余额: 749.4K credits · 25% used');
    expect(summary.querySelector('.billing-inline-summary-primary-accent')?.textContent).toBe('749.4K');
  });

  it('cancels saved billing token removal when a replacement is entered', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const { fake } = await renderDetailPage(container, createBillingTokenProfile());

    await clickTestId(container, 'provider-billing-access-token-clear');
    expect(document.body.textContent).toContain('保存后移除。');

    await inputTestId(container, 'provider-billing-access-token-input', 'billing-next');
    expect(document.body.textContent).not.toContain('保存后移除。');

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
    expect(fake.spies.saveProviderProfile.mock.calls[0]?.[0]?.removedSecretNames).toBeUndefined();
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

  it('reads latest visible billing path from DOM at save time even if input event was missed', async () => {
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

    await inputTestId(container, 'provider-billing-access-token-input', 'billing-next');

    await act(async () => {
      const input = queryByTestId(container, 'provider-billing-path-input') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '/client/openapi/getCredits');
    });
    await flush();
    await mouseDownClickTestId(container, 'provider-save-button');

    expect(fake.spies.saveProviderProfile).toHaveBeenCalledTimes(1);
    expect(fake.spies.saveProviderProfile.mock.calls[0]?.[0]).toMatchObject({
      profileId: 'mock-profile',
      config: {
        billing: {
          source: 'billing-token',
          path: '/client/openapi/getCredits',
        },
      },
    });
  });

  it('reads latest visible billing path from DOM on add page save mousedown even if input event was missed', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onProfileSaved = vi.fn(async () => undefined);
    const fake = await renderAddPage(container, { onProfileSaved });

    await inputTestId(container, 'provider-endpoint-detect-input', 'https://relay.test/v1/chat/completions');
    await selectOption(container, 'provider-billing-mode-selector', 'billing-token');
    await inputTestId(container, 'provider-billing-access-token-input', 'billing-next');

    await act(async () => {
      const input = queryByTestId(container, 'provider-billing-path-input') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, '/client/openapi/getCredits');
    });
    await flush();
    await mouseDownClickTestId(container, 'provider-save-button');

    expect(fake.spies.saveProviderProfile).toHaveBeenCalledTimes(1);
    expect(fake.spies.saveProviderProfile.mock.calls[0]?.[0]).toMatchObject({
      apiFormat: 'openai-chat-completions',
      secretValues: {
        billingToken: 'billing-next',
      },
      config: {
        billing: {
          source: 'billing-token',
          path: '/client/openapi/getCredits',
        },
      },
    });
    expect(onProfileSaved).toHaveBeenCalledTimes(1);
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
