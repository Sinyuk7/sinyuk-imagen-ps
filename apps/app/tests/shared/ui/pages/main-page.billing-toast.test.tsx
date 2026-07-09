import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConversationRound } from '../../../../src/shared/ui/hooks/use-conversation';
import { useAppServices } from '../../../../src/app-services/app-services-context';
import { formatBillingPrimary } from '../../../../src/shared/domain/mappers';
import { useTaskBillingToast } from '../../../../src/shared/ui/hooks/use-task-billing-toast';
import { useProfileBilling } from '../../../../src/shared/ui/hooks/use-profile-billing';
import { descriptorForApiFormat, providerSupportsBalanceQuery, useProviderCatalog } from '../../../../src/shared/ui/hooks/use-provider-settings';
import { useToast } from '../../../../src/shared/ui/components/toast-host';
import { useI18n } from '../../../../src/shared/ui/i18n/i18n-context';
import type { ProfileModelItem, ProfileBillingState, ProviderProfile } from '@imagen-ps/application';
import { createFakeServices, fakeProfile } from '../../../helpers/fakes';
import { cleanupMainPageRoot, flush, renderMainPage, sendPrompt } from '../../../helpers/main-page-harness';
import { TestAppProviders } from '../../../helpers/render-helpers';

const billingProfile: ProviderProfile = {
  ...fakeProfile,
  profileId: 'billing-profile',
  apiFormat: 'openai-chat-completions',
  displayName: 'Billing Profile',
  config: {
    apiFormat: 'openai-chat-completions',
    displayName: 'Billing Profile',
    connection: {
      selectionMode: 'manual',
      selectedEndpointId: 'primary',
      endpoints: [{
        id: 'primary',
        url: 'https://billing.test/v1',
        enabled: true,
      }],
    },
    paths: {
      invoke: '/chat/completions',
    },
    billing: {
      source: 'profile-api-key',
      path: '/client/openapi/getCredits',
    },
  },
};

const billingModels: readonly ProfileModelItem[] = [{
  modelId: 'gpt-4o-image',
  wireModelId: 'gpt-4o-image',
  discovered: true,
  configured: true,
  configSource: 'catalog',
}];

function cloneBillingState(state: ProfileBillingState): ProfileBillingState {
  return {
    ...state,
    ...(state.balance ? { balance: { ...state.balance, snapshot: state.balance.snapshot } } : {}),
    ...(state.lastExactTaskCost ? { lastExactTaskCost: { ...state.lastExactTaskCost } } : {}),
    ...(state.lastBalanceChange ? { lastBalanceChange: { ...state.lastBalanceChange } } : {}),
  };
}

function createRound(overrides: Partial<ConversationRound>): ConversationRound {
  return {
    id: 'round-1',
    time: '16:11',
    prompt: 'silhouette of a cat',
    status: 'running',
    providerName: 'Billing Profile',
    apiFormat: 'openai-chat-completions',
    profileId: 'billing-profile',
    modelId: 'gpt-4o-image',
    elapsedSeconds: 0,
    previews: [],
    attachments: [],
    placementIntent: { kind: 'unbound', reason: 'no-photoshop-source' },
    ...overrides,
  };
}

function BillingToastProbe({
  rounds,
  profiles,
}: {
  readonly rounds: readonly ConversationRound[];
  readonly profiles: readonly ProviderProfile[];
}) {
  const services = useAppServices();
  const providers = useProviderCatalog(services);
  const { show } = useToast();
  const { messages } = useI18n();
  useTaskBillingToast({
    services,
    rounds,
    profiles,
    providers,
    show,
    messages,
  });
  return null;
}

function BillingSummaryProbe({
  rounds,
  profiles,
  profileId,
}: {
  readonly rounds: readonly ConversationRound[];
  readonly profiles: readonly ProviderProfile[];
  readonly profileId: string;
}) {
  const services = useAppServices();
  const providers = useProviderCatalog(services);
  const selectedProfile = profiles.find((profile) => profile.profileId === profileId);
  const selectedDescriptor = selectedProfile ? descriptorForApiFormat(providers, selectedProfile.apiFormat) : undefined;
  const billing = useProfileBilling(
    services,
    profileId,
    providerSupportsBalanceQuery(selectedDescriptor, selectedProfile ?? null),
  );
  const { show } = useToast();
  const { messages } = useI18n();
  useTaskBillingToast({
    services,
    rounds,
    profiles,
    providers,
    show,
    messages,
    onObservedState: (observedProfileId, state) => {
      if (observedProfileId !== profileId) {
        return;
      }
      billing.applyObservedState(state);
    },
  });
  return <div data-testid="billing-summary-probe">{formatBillingPrimary(billing.billing) ?? 'unknown'}</div>;
}

describe('billing toast feedback', () => {
  let probeRoot: Root | undefined;

  afterEach(async () => {
    vi.useRealTimers();
    if (probeRoot) {
      await act(async () => {
        probeRoot?.unmount();
      });
    }
    probeRoot = undefined;
    await cleanupMainPageRoot();
    document.body.innerHTML = '';
  });

  it('shows a toast when a running round reaches terminal state with fresh exact cost', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({
      profiles: [billingProfile],
      profileModelItems: billingModels,
    });
    let billingState: ProfileBillingState = {
      refreshState: 'idle',
      balance: {
        profileId: 'billing-profile',
        apiFormat: 'openai-chat-completions',
        checkedAt: 1,
        snapshot: {
          primary: {
            kind: 'money',
            remaining: '12.00',
            currency: 'USD',
          },
        },
      },
    };
    const commands = fake.services.commands as {
      getProfileBillingState: typeof fake.services.commands.getProfileBillingState;
    };
    commands.getProfileBillingState = vi.fn(async () => ({ ok: true as const, value: cloneBillingState(billingState) }));

    probeRoot = createRoot(container);
    await act(async () => {
      probeRoot!.render(
        <TestAppProviders services={fake.services}>
          <BillingToastProbe rounds={[createRound({ status: 'running' })]} profiles={[billingProfile]} />
        </TestAppProviders>,
      );
    });

    billingState = {
      ...billingState,
      refreshState: 'refreshing',
      lastExactTaskCost: {
        amount: '0.02',
        currency: 'USD',
        completeness: 'complete',
      },
      lastExactTaskCostObservedAt: 2,
    };

    await act(async () => {
      probeRoot!.render(
        <TestAppProviders services={fake.services}>
          <BillingToastProbe rounds={[createRound({ status: 'ok', elapsedLabel: '20s' })]} profiles={[billingProfile]} />
        </TestAppProviders>,
      );
      await Promise.resolve();
    });

    const toast = document.body.querySelector<HTMLElement>('[data-testid="toast"]');
    expect(toast?.textContent ?? '').toContain('Billing Profile');
    expect(toast?.textContent ?? '').toContain('费用: 0.02 USD');
  });

  it('shows a toast for quota balance changes when exact cost is absent', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({
      profiles: [billingProfile],
      profileModelItems: billingModels,
    });
    let phase: 'idle' | 'refreshing' | 'updated' = 'idle';
    const commands = fake.services.commands as {
      getProfileBillingState: typeof fake.services.commands.getProfileBillingState;
    };
    commands.getProfileBillingState = vi.fn(async () => {
      const state: ProfileBillingState = phase === 'updated'
        ? {
            refreshState: 'idle',
            balance: {
              profileId: 'billing-profile',
              apiFormat: 'openai-chat-completions',
              checkedAt: 220,
              snapshot: {
                primary: {
                  kind: 'quota',
                  remaining: '8',
                  unit: 'credits',
                },
              },
            },
            lastBalanceChange: {
              amount: '2',
              unit: 'credits',
              direction: 'decreased',
            },
            lastBalanceChangeObservedAt: 220,
          }
        : {
            refreshState: phase === 'refreshing' ? 'refreshing' : 'idle',
            balance: {
              profileId: 'billing-profile',
              apiFormat: 'openai-chat-completions',
              checkedAt: 100,
              snapshot: {
                primary: {
                  kind: 'quota',
                  remaining: '10',
                  unit: 'credits',
                },
              },
            },
          };
      return { ok: true as const, value: cloneBillingState(state) };
    });

    probeRoot = createRoot(container);
    await act(async () => {
      probeRoot!.render(
        <TestAppProviders services={fake.services}>
          <BillingToastProbe rounds={[createRound({ status: 'running' })]} profiles={[billingProfile]} />
        </TestAppProviders>,
      );
    });

    phase = 'refreshing';
    window.setTimeout(() => {
      phase = 'updated';
    }, 120);
    await act(async () => {
      probeRoot!.render(
        <TestAppProviders services={fake.services}>
          <BillingToastProbe rounds={[createRound({ status: 'ok', elapsedLabel: '20s' })]} profiles={[billingProfile]} />
        </TestAppProviders>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    const toast = document.body.querySelector<HTMLElement>('[data-testid="toast"]');
    expect(toast?.textContent ?? '').toContain('Billing Profile');
    expect(toast?.textContent ?? '').toContain('余额变化: -2 credits');
  });

  it('disposes pending toast observation on unmount', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({
      profiles: [billingProfile],
      profileModelItems: billingModels,
    });
    let phase: 'idle' | 'refreshing' | 'updated' = 'idle';
    const commands = fake.services.commands as {
      getProfileBillingState: typeof fake.services.commands.getProfileBillingState;
    };
    commands.getProfileBillingState = vi.fn(async () => {
      const state: ProfileBillingState = phase === 'updated'
        ? {
            refreshState: 'idle',
            lastBalanceChange: {
              amount: '1',
              unit: 'USD',
              direction: 'decreased',
            },
            lastBalanceChangeObservedAt: 220,
          }
        : { refreshState: phase === 'refreshing' ? 'refreshing' : 'idle' };
      return { ok: true as const, value: cloneBillingState(state) };
    });

    probeRoot = createRoot(container);
    await act(async () => {
      probeRoot!.render(
        <TestAppProviders services={fake.services}>
          <BillingToastProbe rounds={[createRound({ status: 'running' })]} profiles={[billingProfile]} />
        </TestAppProviders>,
      );
    });

    phase = 'refreshing';
    window.setTimeout(() => {
      phase = 'updated';
    }, 120);
    await act(async () => {
      probeRoot!.render(
        <TestAppProviders services={fake.services}>
          <BillingToastProbe rounds={[createRound({ status: 'ok', elapsedLabel: '20s' })]} profiles={[billingProfile]} />
        </TestAppProviders>,
      );
      await Promise.resolve();
    });

    await act(async () => {
      probeRoot?.unmount();
    });
    probeRoot = undefined;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });

    expect(document.body.querySelector('[data-testid="toast"]')).toBeNull();
  });

  it('syncs selected-profile billing summary after terminal refresh', async () => {
    vi.useFakeTimers();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({
      profiles: [billingProfile],
      profileModelItems: billingModels,
      activeImageProfileId: 'billing-profile',
    });
    let phase: 'initial' | 'refreshing' | 'updated' = 'initial';
    const commands = fake.services.commands as {
      getProfileBillingState: typeof fake.services.commands.getProfileBillingState;
    };
    commands.getProfileBillingState = vi.fn(async () => {
      const state: ProfileBillingState = phase === 'updated'
        ? {
            refreshState: 'idle',
            balance: {
              profileId: 'billing-profile',
              apiFormat: 'openai-chat-completions',
              checkedAt: 220,
              snapshot: {
                primary: {
                  kind: 'money',
                  remaining: '17.5',
                  currency: 'USD',
                },
              },
            },
            lastBalanceChange: {
              amount: '2.5',
              unit: 'USD',
              direction: 'decreased',
            },
            lastBalanceChangeObservedAt: 220,
          }
        : {
            refreshState: phase === 'refreshing' ? 'refreshing' : 'idle',
            balance: {
              profileId: 'billing-profile',
              apiFormat: 'openai-chat-completions',
              checkedAt: 100,
              snapshot: {
                primary: {
                  kind: 'money',
                  remaining: '20',
                  currency: 'USD',
                },
              },
            },
          };
      return { ok: true as const, value: cloneBillingState(state) };
    });

    probeRoot = createRoot(container);
    await act(async () => {
      probeRoot!.render(
        <TestAppProviders services={fake.services}>
          <BillingSummaryProbe
            rounds={[createRound({ status: 'running' })]}
            profiles={[billingProfile]}
            profileId="billing-profile"
          />
        </TestAppProviders>,
      );
    });
    expect(container.querySelector<HTMLElement>('[data-testid="billing-summary-probe"]')?.textContent ?? '').toContain('20');

    phase = 'refreshing';
    window.setTimeout(() => {
      phase = 'updated';
    }, 120);
    await act(async () => {
      probeRoot!.render(
        <TestAppProviders services={fake.services}>
          <BillingSummaryProbe
            rounds={[createRound({ status: 'ok', elapsedLabel: '20s' })]}
            profiles={[billingProfile]}
            profileId="billing-profile"
          />
        </TestAppProviders>,
      );
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120);
    });
    await flush();

    expect(container.querySelector<HTMLElement>('[data-testid="billing-summary-probe"]')?.textContent ?? '').toContain('17.5');
  });

  it('does not render round billing footer metadata on MainPage results', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const fake = createFakeServices({ activeImageProfileId: 'mock-profile' });

    await renderMainPage(container, fake);
    await sendPrompt(container, 'silhouette of a cat');
    await flush();
    await flush();

    expect(container.querySelector('[data-testid^="round-billing-meta-"]')).toBeNull();
  });
});
