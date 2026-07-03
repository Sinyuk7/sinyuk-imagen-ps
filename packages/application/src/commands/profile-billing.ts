import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import type {
  BalanceChange,
  ExactTaskCost,
  ProviderBalanceSnapshot,
} from '@imagen-ps/providers';
import { getProviderConfigResolver, getProviderProfileRepository, getRuntime, getRuntimeLogger } from '../runtime.js';
import type {
  CommandResult,
  ProfileBalanceResult,
  ProfileBillingState,
  RefreshProfileBalanceInput,
  RefreshProfileBalanceResult,
} from './types.js';

type BillingCacheEntry = {
  readonly fingerprint: string;
  readonly state: ProfileBillingState;
};

type BillingCooldownReason = 'rate-limit' | 'auth-fail';

type BillingCooldownEntry = {
  readonly consecutiveAuthFails: number;
  readonly blockedUntil?: number;
  readonly reason?: BillingCooldownReason;
  readonly lastErrorMessage?: string;
};

const billingStateStore = new Map<string, BillingCacheEntry>();
const inflightRefreshes = new Map<string, Promise<RefreshProfileBalanceResult>>();
const scheduledRefreshes = new Map<string, ReturnType<typeof setTimeout>>();
const billingCooldownStore = new Map<string, BillingCooldownEntry>();

const BILLING_AUTH_FAIL_THRESHOLD = 3;
const BILLING_AUTH_FAIL_COOLDOWN_MS = 120_000;
const BILLING_RATE_LIMIT_COOLDOWN_MS = 120_000;

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function errorStatusCode(error: unknown): number | undefined {
  const statusCode = (error as { readonly statusCode?: unknown } | null | undefined)?.statusCode;
  return typeof statusCode === 'number' ? statusCode : undefined;
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableSerialize(entryValue)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function billingConfigFingerprint(config: Record<string, unknown>): string {
  const pick = {
    providerId: config.providerId,
    connection: config.connection,
    billing: config.billing,
  };
  return stableSerialize(pick);
}

function cloneBillingState(entry: ProfileBillingState): ProfileBillingState {
  return {
    ...(entry.balance ? { balance: entry.balance } : {}),
    ...(entry.lastExactTaskCost ? { lastExactTaskCost: entry.lastExactTaskCost } : {}),
    ...(entry.lastBalanceChange ? { lastBalanceChange: entry.lastBalanceChange } : {}),
    refreshState: entry.refreshState,
  };
}

function createProfileBalanceResult(
  profileId: string,
  providerId: string,
  checkedAt: number,
  snapshot: ProviderBalanceSnapshot,
): ProfileBalanceResult {
  return {
    profileId,
    providerId,
    checkedAt,
    snapshot,
  };
}

function getOrCreateBillingEntry(profileId: string, fingerprint: string): BillingCacheEntry {
  const existing = billingStateStore.get(profileId);
  if (existing && existing.fingerprint === fingerprint) {
    return existing;
  }
  const next: BillingCacheEntry = {
    fingerprint,
    state: { refreshState: 'idle' },
  };
  billingStateStore.set(profileId, next);
  return next;
}

function setBillingEntry(profileId: string, entry: BillingCacheEntry): void {
  billingStateStore.set(profileId, entry);
}

function deleteBillingCooldown(profileId: string): void {
  billingCooldownStore.delete(profileId);
}

function readBillingCooldown(profileId: string): BillingCooldownEntry {
  const current = billingCooldownStore.get(profileId);
  if (!current) {
    return { consecutiveAuthFails: 0 };
  }
  if (current.blockedUntil !== undefined && current.blockedUntil <= Date.now()) {
    billingCooldownStore.delete(profileId);
    return { consecutiveAuthFails: 0 };
  }
  return current;
}

function setBillingCooldown(profileId: string, entry: BillingCooldownEntry): void {
  if (entry.consecutiveAuthFails <= 0 && entry.blockedUntil === undefined) {
    billingCooldownStore.delete(profileId);
    return;
  }
  billingCooldownStore.set(profileId, entry);
}

function parseCooldownMsFromMessage(message: string): number | undefined {
  const secondMatch = message.match(/(?:wait|等待)\s*(\d+)\s*(?:seconds?|秒)/i);
  if (!secondMatch) {
    return undefined;
  }
  const seconds = Number(secondMatch[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

function isRateLimitBalanceError(error: unknown): boolean {
  const statusCode = errorStatusCode(error);
  if (statusCode === 429) {
    return true;
  }
  const message = errorMessage(error, '');
  return /\b429\b/.test(message) && /rate|limit|等待|wait/i.test(message);
}

function isAuthFailureBalanceError(error: unknown): boolean {
  if (isRateLimitBalanceError(error)) {
    return false;
  }
  const statusCode = errorStatusCode(error);
  if (statusCode === 401 || statusCode === 403) {
    return true;
  }
  const message = errorMessage(error, '').toLowerCase();
  return message.includes('unauthorized')
    || message.includes('invalid token')
    || message.includes('access token invalid')
    || message.includes('access token 无效')
    || message.includes('无权进行此操作')
    || message.includes('令牌无效');
}

function nextBillingCooldown(profileId: string, error: unknown): BillingCooldownEntry {
  const previous = readBillingCooldown(profileId);
  const message = errorMessage(error, 'Billing refresh failed.');
  if (isRateLimitBalanceError(error)) {
    const cooldownMs = parseCooldownMsFromMessage(message) ?? BILLING_RATE_LIMIT_COOLDOWN_MS;
    return {
      consecutiveAuthFails: 0,
      blockedUntil: Date.now() + cooldownMs,
      reason: 'rate-limit',
      lastErrorMessage: message,
    };
  }
  if (isAuthFailureBalanceError(error)) {
    const consecutiveAuthFails = previous.consecutiveAuthFails + 1;
    if (consecutiveAuthFails >= BILLING_AUTH_FAIL_THRESHOLD) {
      return {
        consecutiveAuthFails: 0,
        blockedUntil: Date.now() + BILLING_AUTH_FAIL_COOLDOWN_MS,
        reason: 'auth-fail',
        lastErrorMessage: message,
      };
    }
    return {
      consecutiveAuthFails,
      lastErrorMessage: message,
    };
  }
  return { consecutiveAuthFails: 0 };
}

function parseDecimal(value: string | undefined): number | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function detectBalanceChange(
  previous: ProviderBalanceSnapshot | undefined,
  next: ProviderBalanceSnapshot,
): BalanceChange | undefined {
  if (previous?.primary.kind !== 'money' || next.primary.kind !== 'money') {
    return undefined;
  }
  if (previous.primary.currency !== next.primary.currency) {
    return undefined;
  }
  const before = parseDecimal(previous.primary.remaining);
  const after = parseDecimal(next.primary.remaining);
  if (before === undefined || after === undefined || before === after) {
    return undefined;
  }
  return {
    amount: Math.abs(before - after).toFixed(6).replace(/\.?0+$/, ''),
    currency: next.primary.currency,
    direction: after < before ? 'decreased' : 'increased',
  };
}

async function performBalanceRefresh(
  input: RefreshProfileBalanceInput,
): Promise<RefreshProfileBalanceResult> {
  const profile = await getProviderProfileRepository().get(input.profileId);
  if (!profile) {
    throw createValidationError(`Provider profile "${input.profileId}" not found.`, { profileId: input.profileId });
  }

  const provider = getRuntime().providerRegistry.get(profile.providerId);
  if (!provider) {
    throw createValidationError(`Provider implementation "${profile.providerId}" not found.`, {
      profileId: input.profileId,
      providerId: profile.providerId,
    });
  }
  if (typeof provider.queryBalance !== 'function') {
    throw createValidationError(`Provider implementation "${profile.providerId}" does not support balance query.`, {
      profileId: input.profileId,
      providerId: profile.providerId,
    });
  }

  const resolved = await getProviderConfigResolver().resolve(input.profileId);
  const checkedAt = Date.now();
  const snapshot = await provider.queryBalance(resolved.providerConfig as never, {
    ...(input.signal ? { signal: input.signal } : {}),
  });
  const nextBalance = createProfileBalanceResult(input.profileId, profile.providerId, checkedAt, snapshot);
  const fingerprint = billingConfigFingerprint(profile.config as Record<string, unknown>);
  const previousState = getOrCreateBillingEntry(input.profileId, fingerprint).state;
  const nextState: ProfileBillingState = {
    balance: nextBalance,
    refreshState: 'idle',
    ...(previousState.lastExactTaskCost ? { lastExactTaskCost: previousState.lastExactTaskCost } : {}),
    ...(detectBalanceChange(previousState.balance?.snapshot, snapshot)
      ? { lastBalanceChange: detectBalanceChange(previousState.balance?.snapshot, snapshot)! }
      : previousState.lastBalanceChange
        ? { lastBalanceChange: previousState.lastBalanceChange }
        : {}),
  };
  setBillingEntry(input.profileId, { fingerprint, state: nextState });
  return {
    providerId: profile.providerId,
    profileId: input.profileId,
    checkedAt,
    snapshot,
    state: cloneBillingState(nextState),
  };
}

export async function refreshProfileBalance(
  input: RefreshProfileBalanceInput,
): Promise<CommandResult<RefreshProfileBalanceResult>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: input.profileId,
  });
  const span = logger.startSpan('command.profile.balance.refresh');

  try {
    const profile = await getProviderProfileRepository().get(input.profileId);
    if (!profile) {
      span.fail({ message: `Provider profile "${input.profileId}" not found.` });
      return {
        ok: false,
        error: createValidationError(`Provider profile "${input.profileId}" not found.`, { profileId: input.profileId }),
      };
    }

    const fingerprint = billingConfigFingerprint(profile.config as Record<string, unknown>);
    const cached = billingStateStore.get(input.profileId);
    if (cached && cached.fingerprint !== fingerprint) {
      billingStateStore.delete(input.profileId);
      deleteBillingCooldown(input.profileId);
    }

    const cooldown = readBillingCooldown(input.profileId);
    if (cooldown.blockedUntil !== undefined && cooldown.reason) {
      const warm = getOrCreateBillingEntry(input.profileId, fingerprint);
      setBillingEntry(input.profileId, {
        fingerprint,
        state: {
          ...warm.state,
          refreshState: 'error',
        },
      });
      const remainingMs = Math.max(0, cooldown.blockedUntil - Date.now());
      const seconds = Math.ceil(remainingMs / 1000);
      const detail =
        cooldown.reason === 'rate-limit'
          ? `Billing refresh is cooling down after a 429 response. Retry in about ${seconds}s.`
          : `Billing refresh is cooling down after repeated auth failures. Retry in about ${seconds}s.`;
      span.fail({
        message: detail,
        cooldown_reason: cooldown.reason,
        cooldown_remaining_ms: remainingMs,
      });
      return {
        ok: false,
        error: createProviderError(detail, {
          profileId: input.profileId,
          cooldownReason: cooldown.reason,
          retryAfterMs: remainingMs,
        }),
      };
    }

    const inflightKey = `${input.profileId}:${fingerprint}`;
    const current = inflightRefreshes.get(inflightKey);
    if (current) {
      const reused = await current;
      span.finish({ reused: true });
      return { ok: true, value: reused };
    }

    const warm = getOrCreateBillingEntry(input.profileId, fingerprint);
    setBillingEntry(input.profileId, {
      fingerprint,
      state: {
        ...warm.state,
        refreshState: 'refreshing',
      },
    });

    const task = performBalanceRefresh(input).finally(() => {
      inflightRefreshes.delete(inflightKey);
    });
    inflightRefreshes.set(inflightKey, task);
    const value = await task;
    deleteBillingCooldown(input.profileId);
    span.finish();
    return { ok: true, value };
  } catch (error) {
    const profile = await getProviderProfileRepository().get(input.profileId).catch(() => undefined);
    if (profile) {
      const fingerprint = billingConfigFingerprint(profile.config as Record<string, unknown>);
      const current = getOrCreateBillingEntry(input.profileId, fingerprint).state;
      setBillingEntry(input.profileId, {
        fingerprint,
        state: {
          ...current,
          refreshState: 'error',
        },
      });
      setBillingCooldown(input.profileId, nextBillingCooldown(input.profileId, error));
    }
    span.fail(error);
    return {
      ok: false,
      error: createProviderError(errorMessage(error, `Balance query failed for profile "${input.profileId}".`), {
        profileId: input.profileId,
      }),
    };
  }
}

export async function getProfileBillingState(profileId: string): Promise<CommandResult<ProfileBillingState>> {
  const profile = await getProviderProfileRepository().get(profileId);
  if (!profile) {
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }
  const fingerprint = billingConfigFingerprint(profile.config as Record<string, unknown>);
  const entry = getOrCreateBillingEntry(profileId, fingerprint);
  return { ok: true, value: cloneBillingState(entry.state) };
}

export async function scheduleProfileBalanceRefresh(
  profileId: string,
  input?: {
    readonly delayMs?: number;
    readonly signal?: AbortSignal;
  },
): Promise<void> {
  const existing = scheduledRefreshes.get(profileId);
  if (existing) {
    clearTimeout(existing);
  }
  const timer = setTimeout(() => {
    scheduledRefreshes.delete(profileId);
    void refreshProfileBalance({
      profileId,
      ...(input?.signal ? { signal: input.signal } : {}),
    });
  }, input?.delayMs ?? 350);
  scheduledRefreshes.set(profileId, timer);
}

export async function noteProfileTaskBilling(
  profileId: string,
  billing: {
    readonly exactTaskCost?: ExactTaskCost;
  },
): Promise<CommandResult<ProfileBillingState>> {
  const profile = await getProviderProfileRepository().get(profileId);
  if (!profile) {
    return {
      ok: false,
      error: createValidationError(`Provider profile "${profileId}" not found.`, { profileId }),
    };
  }
  const fingerprint = billingConfigFingerprint(profile.config as Record<string, unknown>);
  const current = getOrCreateBillingEntry(profileId, fingerprint);
  const nextState: ProfileBillingState = {
    ...current.state,
    ...(billing.exactTaskCost ? { lastExactTaskCost: billing.exactTaskCost } : {}),
  };
  setBillingEntry(profileId, { fingerprint, state: nextState });
  return { ok: true, value: cloneBillingState(nextState) };
}

export function invalidateProfileBillingState(profileId: string): void {
  billingStateStore.delete(profileId);
  deleteBillingCooldown(profileId);
  const scheduled = scheduledRefreshes.get(profileId);
  if (scheduled) {
    clearTimeout(scheduled);
    scheduledRefreshes.delete(profileId);
  }
}

export function _resetProfileBillingStateForTesting(): void {
  billingStateStore.clear();
  inflightRefreshes.clear();
  billingCooldownStore.clear();
  for (const timer of scheduledRefreshes.values()) {
    clearTimeout(timer);
  }
  scheduledRefreshes.clear();
}
