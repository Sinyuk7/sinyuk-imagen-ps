/**
 * Provider billing contract.
 *
 * Billing query is provider-specific and intentionally separate from model
 * invocation compatibility.
 */

export type ProviderBalanceSummary =
  | {
      readonly kind: 'money';
      readonly remaining: string;
      readonly currency: string;
    }
  | {
      readonly kind: 'quota';
      readonly remaining?: string;
      readonly usedPercent?: number;
      readonly unit?: string;
    };

export type ProviderBalanceDetail =
  | {
      readonly kind: 'money';
      readonly label: string;
      readonly amount: string;
      readonly currency: string;
    }
  | {
      readonly kind: 'quota';
      readonly label: string;
      readonly value: string;
      readonly unit: string;
      readonly resetAt?: number;
    };

export interface ProviderBalanceSnapshot {
  readonly primary: ProviderBalanceSummary;
  readonly details?: readonly ProviderBalanceDetail[];
  readonly sourceCheckedAt?: number;
}

export interface ProviderBalanceQueryInput {
  readonly signal?: AbortSignal;
}

export interface ExactTaskCost {
  readonly amount: string;
  readonly currency: string;
  readonly completeness: 'complete' | 'partial';
}

export interface BalanceChange {
  readonly amount: string;
  readonly currency: string;
  readonly direction: 'decreased' | 'increased';
}

export const billingProtocolIds = [
  'credits-api-key-json-v1',
  'credits-token-json-v1',
  'new-api-user-bearer-v1',
] as const;

export type BillingProtocolId = (typeof billingProtocolIds)[number];

export type ProviderBillingSource = 'disabled' | 'profile-api-key' | 'billing-token';

export type ProviderBillingConfig =
  | { readonly source: 'disabled' }
  | {
      readonly source: 'profile-api-key';
      readonly path: string;
      readonly lastSuccessfulProtocolId?: BillingProtocolId;
    }
  | {
      readonly source: 'billing-token';
      readonly path: string;
      readonly tokenSecretRef: string;
      readonly userId?: string;
      readonly lastSuccessfulProtocolId?: BillingProtocolId;
    };

export interface ProviderBalanceQueryResult {
  readonly snapshot: ProviderBalanceSnapshot;
  readonly protocolId: BillingProtocolId;
}

export interface ProviderBillingCapability {
  readonly query?: 'supported' | 'unsupported';
}
