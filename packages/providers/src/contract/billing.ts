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

export type ProviderBillingMode =
  | { readonly mode: 'none' }
  | { readonly mode: 'official' }
  | {
      readonly mode: 'new-api';
      readonly userId: string;
      readonly accessTokenSecretRef: string;
    };

export interface ProviderBillingCapability {
  readonly supportedModes: readonly ProviderBillingMode['mode'][];
  readonly defaultMode?: ProviderBillingMode['mode'];
}
