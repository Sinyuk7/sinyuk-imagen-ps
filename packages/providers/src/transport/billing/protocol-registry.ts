import type {
  BillingProtocolId,
  ProviderBalanceQueryResult,
  ProviderBalanceSnapshot,
  ProviderBillingConfig,
  ProviderBillingSource,
} from '../../contract/billing.js';
import {
  fetchProviderBalanceJson,
  parseCreditsBalanceResponse,
  parseNewApiBalanceResponse,
  resolveRootBillingUrl,
} from './query-balance.js';

type ActiveBillingConfig = Exclude<ProviderBillingConfig, { readonly source: 'disabled' }>;
type ActiveBillingSource = Exclude<ProviderBillingSource, 'disabled'>;

interface BillingProtocolContext {
  readonly endpointUrl: string;
  readonly billing: ActiveBillingConfig;
  readonly apiKey?: string;
  readonly signal?: AbortSignal;
}

interface BillingProtocolDefinition {
  readonly id: BillingProtocolId;
  readonly source: ActiveBillingSource;
  readonly execute: (context: BillingProtocolContext) => Promise<ProviderBalanceSnapshot>;
}

function assertApiKey(context: BillingProtocolContext): string {
  if (typeof context.apiKey === 'string' && context.apiKey.trim().length > 0) {
    return context.apiKey.trim();
  }
  throw new Error('Billing query with current API key requires a saved apiKey.');
}

function assertBillingToken(context: BillingProtocolContext): string {
  if (context.billing.source !== 'billing-token') {
    throw new Error('Billing token protocol requires billing-token source.');
  }
  if (context.billing.tokenSecretRef.trim().length > 0) {
    return context.billing.tokenSecretRef.trim();
  }
  throw new Error('Billing token protocol requires a saved billing token.');
}

function assertUserId(context: BillingProtocolContext): string {
  if (context.billing.source !== 'billing-token' || typeof context.billing.userId !== 'string' || context.billing.userId.trim().length === 0) {
    throw new Error('New API billing protocol requires userId.');
  }
  return context.billing.userId.trim();
}

const billingProtocolRegistry: readonly BillingProtocolDefinition[] = [
  {
    id: 'credits-api-key-json-v1',
    source: 'profile-api-key',
    async execute(context) {
      const json = await fetchProviderBalanceJson({
        url: resolveRootBillingUrl(context.endpointUrl, context.billing.path),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: assertApiKey(context) }),
        ...(context.signal ? { signal: context.signal } : {}),
      });
      return parseCreditsBalanceResponse(json);
    },
  },
  {
    id: 'credits-token-json-v1',
    source: 'billing-token',
    async execute(context) {
      const json = await fetchProviderBalanceJson({
        url: resolveRootBillingUrl(context.endpointUrl, context.billing.path),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: assertBillingToken(context) }),
        ...(context.signal ? { signal: context.signal } : {}),
      });
      return parseCreditsBalanceResponse(json);
    },
  },
  {
    id: 'new-api-user-bearer-v1',
    source: 'billing-token',
    async execute(context) {
      const json = await fetchProviderBalanceJson({
        url: resolveRootBillingUrl(context.endpointUrl, context.billing.path),
        method: 'GET',
        headers: {
          Authorization: `Bearer ${assertBillingToken(context)}`,
          'New-Api-User': assertUserId(context),
        },
        ...(context.signal ? { signal: context.signal } : {}),
      });
      return parseNewApiBalanceResponse(json);
    },
  },
] as const;

function billingProtocolCandidates(billing: ActiveBillingConfig): readonly BillingProtocolDefinition[] {
  const supported = billingProtocolRegistry.filter((definition) => definition.source === billing.source);
  if (!billing.lastSuccessfulProtocolId) {
    return supported;
  }
  const preferred = supported.find((definition) => definition.id === billing.lastSuccessfulProtocolId);
  if (!preferred) {
    return supported;
  }
  return [preferred, ...supported.filter((definition) => definition.id !== preferred.id)];
}

export async function executeBillingProtocolChain(context: BillingProtocolContext): Promise<ProviderBalanceQueryResult> {
  const attempts: string[] = [];
  for (const protocol of billingProtocolCandidates(context.billing)) {
    try {
      const snapshot = await protocol.execute(context);
      return { snapshot, protocolId: protocol.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      attempts.push(`${protocol.id}: ${message}`);
    }
  }
  throw new Error(attempts.length > 0
    ? `Billing query failed for all candidate protocols. ${attempts.join(' | ')}`
    : 'Billing query has no candidate protocols for the current source.');
}
