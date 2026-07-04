import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import {
  providerConnectionAllowsFailover,
  type ProviderConnectionConfig,
  type ProviderEndpointConfig,
} from '../../contract/config.js';
import type { ImageEditCodec } from '../../contract/provider.js';
import type { Logger } from '@imagen-ps/foundation';
import type { RetryOptions, RetryPolicy } from './retry.js';
import type { ProviderInvokeError } from './error-map.js';
import { isRetryableTransportError, retryAfterMs } from './retry.js';
import { classifyImageEditRequestShapeRejection } from './request-shape-classifier.js';

export interface EndpointAttemptRecord {
  readonly endpointId: string;
  readonly endpointUrl: string;
  readonly attemptIndex: number;
  readonly outcome: 'success' | 'failure' | 'skipped_cooldown';
  readonly kind?: string;
  readonly statusCode?: number;
}

export interface EndpointRuntimeHealth {
  consecutiveFailures: number;
  openUntil?: number;
  lastSuccessAt?: number;
  lastTouchedAt: number;
}

export interface ExecuteWithEndpointFailoverOptions<T> {
  readonly connection: ProviderConnectionConfig;
  readonly logger?: Logger;
  readonly signal?: AbortSignal;
  readonly failoverEnabled?: boolean;
  readonly maxAttempts?: number;
  readonly deadlineMs?: number;
  readonly cooldownMs?: number;
  readonly retryPolicy?: RetryPolicy;
  readonly retryOptions?: RetryOptions;
  readonly execute: (endpoint: ProviderEndpointConfig, signal?: AbortSignal) => Promise<T>;
}

export interface ExecuteWithEndpointFailoverResult<T> {
  readonly selectedEndpointId: string;
  readonly value: T;
  readonly diagnostics: readonly ProviderDiagnostic[];
  readonly attempts: readonly EndpointAttemptRecord[];
}

export interface AttemptCandidate {
  readonly endpointId: string;
  readonly codecId: ImageEditCodec;
  readonly reason: 'initial' | 'codec-fallback' | 'endpoint-failover';
}

export type ResolvedAttemptPlan =
  | { readonly mode: 'single-attempt'; readonly candidates: readonly [AttemptCandidate] }
  | { readonly mode: 'codec-fallback'; readonly candidates: readonly AttemptCandidate[] }
  | { readonly mode: 'endpoint-failover'; readonly candidates: readonly AttemptCandidate[] };

export interface DispatchBudget {
  readonly maxSameEndpointRetries: number;
  readonly maxCodecFallbacks: number;
  readonly maxEndpointFailovers: number;
  readonly maxTotalDispatches: number;
}

export interface AttemptLedger {
  consume(kind: 'initial' | 'retry' | 'codec-fallback' | 'endpoint-failover'): void;
  readonly exhausted: boolean;
  readonly totalUsed: number;
  readonly sameEndpointRetriesUsed: number;
}

export interface DecideInput {
  readonly failure: ProviderInvokeError;
  readonly plan: ResolvedAttemptPlan;
  readonly planIndex: number;
  readonly capability: {
    readonly idempotencySupported: boolean;
    readonly idempotencyScope?: 'same-endpoint' | 'shared-domain' | 'unknown';
  };
  readonly budget: DispatchBudget;
  readonly ledger: AttemptLedger;
  readonly retryPolicy: RetryPolicy;
  readonly currentCodec?: ImageEditCodec;
  readonly alternateCodec?: ImageEditCodec;
}

export type NextAction =
  | { readonly type: 'stop'; readonly reason: string }
  | { readonly type: 'retry-same-endpoint'; readonly delayMs?: number }
  | { readonly type: 'try-next-codec' }
  | { readonly type: 'try-next-endpoint' };

export interface ExecuteAttemptPlanOptions<T> {
  readonly plan: ResolvedAttemptPlan;
  readonly budget: DispatchBudget;
  readonly ledger: AttemptLedger;
  readonly capability: DecideInput['capability'];
  readonly retryPolicy: RetryPolicy;
  readonly logger?: Logger;
  readonly execute: (candidate: AttemptCandidate, attemptIndex: number) => Promise<T>;
}

export interface ExecuteAttemptPlanResult<T> {
  readonly selectedEndpointId: string;
  readonly candidate: AttemptCandidate;
  readonly value: T;
  readonly diagnostics: readonly ProviderDiagnostic[];
  readonly attempts: readonly EndpointAttemptRecord[];
}

const endpointRuntimeHealth = new Map<string, EndpointRuntimeHealth>();
const RUNTIME_HEALTH_STALE_MS = 10 * 60 * 1000;

export function resetEndpointRuntimeHealthForTesting(): void {
  endpointRuntimeHealth.clear();
}

export function endpointRuntimeHealthSizeForTesting(): number {
  return endpointRuntimeHealth.size;
}

function connectionFingerprint(connection: ProviderConnectionConfig): string {
  return JSON.stringify({
    selectionMode: connection.selectionMode,
    selectedEndpointId: connection.selectedEndpointId,
    endpoints: connection.endpoints.map((endpoint) => ({
      id: endpoint.id,
      url: endpoint.url,
      enabled: endpoint.enabled,
    })),
  });
}

function runtimeHealthKey(connection: ProviderConnectionConfig, endpoint: ProviderEndpointConfig): string {
  return `${connectionFingerprint(connection)}::${endpoint.id}`;
}

function cleanupEndpointRuntimeHealth(connection: ProviderConnectionConfig): void {
  const activeKeys = new Set(connection.endpoints.map((endpoint) => runtimeHealthKey(connection, endpoint)));
  const now = currentTime();
  for (const [key, health] of endpointRuntimeHealth.entries()) {
    if (activeKeys.has(key)) {
      continue;
    }
    const cooledDown = (health.openUntil ?? 0) <= now;
    if (cooledDown && now - health.lastTouchedAt >= RUNTIME_HEALTH_STALE_MS) {
      endpointRuntimeHealth.delete(key);
    }
  }
}

function endpointHealth(connection: ProviderConnectionConfig, endpoint: ProviderEndpointConfig): EndpointRuntimeHealth {
  cleanupEndpointRuntimeHealth(connection);
  const key = runtimeHealthKey(connection, endpoint);
  const existing = endpointRuntimeHealth.get(key);
  if (existing) {
    existing.lastTouchedAt = currentTime();
    return existing;
  }
  const created: EndpointRuntimeHealth = { consecutiveFailures: 0, lastTouchedAt: currentTime() };
  endpointRuntimeHealth.set(key, created);
  return created;
}

function currentTime(): number {
  return Date.now();
}

function createProviderDiagnostic(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ProviderDiagnostic {
  return {
    code,
    message,
    level: 'info',
    ...(details ? { details } : {}),
  };
}

class DispatchAttemptLedger implements AttemptLedger {
  private usedInitial = 0;
  private usedRetries = 0;
  private usedCodecFallbacks = 0;
  private usedEndpointFailovers = 0;

  constructor(private readonly budget: DispatchBudget) {}

  consume(kind: 'initial' | 'retry' | 'codec-fallback' | 'endpoint-failover'): void {
    if (this.exhausted) {
      throw new Error('Dispatch budget exhausted before HTTP dispatch.');
    }
    if (kind === 'initial') {
      this.usedInitial += 1;
      return;
    }
    if (kind === 'retry') {
      this.usedRetries += 1;
      return;
    }
    if (kind === 'codec-fallback') {
      this.usedCodecFallbacks += 1;
      return;
    }
    this.usedEndpointFailovers += 1;
  }

  get exhausted(): boolean {
    return this.totalUsed >= this.budget.maxTotalDispatches ||
      this.usedRetries > this.budget.maxSameEndpointRetries ||
      this.usedCodecFallbacks > this.budget.maxCodecFallbacks ||
      this.usedEndpointFailovers > this.budget.maxEndpointFailovers;
  }

  get totalUsed(): number {
    return this.usedInitial + this.usedRetries + this.usedCodecFallbacks + this.usedEndpointFailovers;
  }

  get sameEndpointRetriesUsed(): number {
    return this.usedRetries;
  }
}

function endpointOrder(connection: ProviderConnectionConfig): readonly ProviderEndpointConfig[] {
  const enabled = connection.endpoints.filter((endpoint) => endpoint.enabled);
  if (connection.selectionMode === 'manual') {
    const selected = enabled.find((endpoint) => endpoint.id === connection.selectedEndpointId);
    const rest = enabled.filter((endpoint) => endpoint.id !== connection.selectedEndpointId);
    return selected ? [selected, ...rest] : enabled;
  }

  return [...enabled].sort((left, right) => {
    const leftHealth = endpointHealth(connection, left);
    const rightHealth = endpointHealth(connection, right);
    const leftOpen = (leftHealth.openUntil ?? 0) > currentTime() ? 1 : 0;
    const rightOpen = (rightHealth.openUntil ?? 0) > currentTime() ? 1 : 0;
    if (leftOpen !== rightOpen) {
      return leftOpen - rightOpen;
    }
    const leftSuccess = leftHealth.lastSuccessAt ?? 0;
    const rightSuccess = rightHealth.lastSuccessAt ?? 0;
    if (leftSuccess !== rightSuccess) {
      return rightSuccess - leftSuccess;
    }
    return leftHealth.consecutiveFailures - rightHealth.consecutiveFailures;
  });
}

export function resolveAttemptPlan(args: {
  readonly endpoints: readonly ProviderEndpointConfig[];
  readonly failoverEnabled: boolean;
  readonly compatibleCodecs: readonly ImageEditCodec[];
}): ResolvedAttemptPlan {
  const firstEndpoint = args.endpoints[0];
  const firstCodec = args.compatibleCodecs[0];
  if (!firstEndpoint || !firstCodec) {
    throw new Error('Attempt plan requires at least one enabled endpoint and one compatible codec.');
  }

  if (args.failoverEnabled && args.endpoints.length > 1) {
    return {
      mode: 'endpoint-failover',
      candidates: args.endpoints.map((endpoint, index) => ({
        endpointId: endpoint.id,
        codecId: firstCodec,
        reason: index === 0 ? 'initial' : 'endpoint-failover',
      })),
    };
  }

  if (args.compatibleCodecs.length > 1) {
    return {
      mode: 'codec-fallback',
      candidates: args.compatibleCodecs.map((codec, index) => ({
        endpointId: firstEndpoint.id,
        codecId: codec,
        reason: index === 0 ? 'initial' : 'codec-fallback',
      })),
    };
  }

  return {
    mode: 'single-attempt',
    candidates: [{
      endpointId: firstEndpoint.id,
      codecId: firstCodec,
      reason: 'initial',
    }],
  };
}

export function deriveDispatchBudget(plan: ResolvedAttemptPlan, retryPolicy: RetryPolicy): DispatchBudget {
  return {
    maxSameEndpointRetries: Math.max(0, retryPolicy.maxRetries),
    maxCodecFallbacks: plan.mode === 'codec-fallback' ? Math.max(0, plan.candidates.length - 1) : 0,
    maxEndpointFailovers: plan.mode === 'endpoint-failover' ? Math.max(0, plan.candidates.length - 1) : 0,
    maxTotalDispatches: plan.candidates.length + Math.max(0, retryPolicy.maxRetries),
  };
}

export function createAttemptLedger(budget: DispatchBudget): AttemptLedger {
  return new DispatchAttemptLedger(budget);
}

export function decideNextAction(input: DecideInput): NextAction {
  if (input.ledger.exhausted) {
    return { type: 'stop', reason: 'budget_exhausted' };
  }

  if (input.failure.kind === 'rate_limited') {
    return input.ledger.sameEndpointRetriesUsed < input.budget.maxSameEndpointRetries
      ? { type: 'retry-same-endpoint' }
      : { type: 'stop', reason: 'rate_limited_retry_exhausted' };
  }

  if (input.failure.recovery?.executionState === 'unknown') {
    return { type: 'stop', reason: 'unknown_execution_state' };
  }

  if (
    input.plan.mode === 'codec-fallback' &&
    input.alternateCodec !== undefined &&
    input.currentCodec !== undefined &&
    input.planIndex < input.plan.candidates.length - 1
  ) {
    const rejection = classifyImageEditRequestShapeRejection(input.failure, {
      currentCodec: input.currentCodec,
      alternateCodec: input.alternateCodec,
    });
    if (rejection.eligible) {
      return { type: 'try-next-codec' };
    }
  }

  if (
    input.plan.mode === 'endpoint-failover' &&
    input.planIndex < input.plan.candidates.length - 1 &&
    input.capability.idempotencySupported === true &&
    input.capability.idempotencyScope === 'shared-domain'
  ) {
    return { type: 'try-next-endpoint' };
  }

  return { type: 'stop', reason: 'no_recovery_path' };
}

export async function executeAttemptPlan<T>(
  options: ExecuteAttemptPlanOptions<T>,
): Promise<ExecuteAttemptPlanResult<T>> {
  const diagnostics: ProviderDiagnostic[] = [];
  const attempts: EndpointAttemptRecord[] = [];
  let lastError: ProviderInvokeError | undefined;

  for (let index = 0; index < options.plan.candidates.length; index += 1) {
    const candidate = options.plan.candidates[index];
    try {
      const value = await options.execute(candidate, index + 1);
      attempts.push({
        endpointId: candidate.endpointId,
        endpointUrl: candidate.endpointId,
        attemptIndex: index + 1,
        outcome: 'success',
      });
      return {
        selectedEndpointId: candidate.endpointId,
        candidate,
        value,
        diagnostics,
        attempts,
      };
    } catch (error) {
      const failure = error as ProviderInvokeError;
      lastError = failure;
      attempts.push({
        endpointId: candidate.endpointId,
        endpointUrl: candidate.endpointId,
        attemptIndex: index + 1,
        outcome: 'failure',
        ...(failure.kind ? { kind: failure.kind } : {}),
        ...(typeof failure.statusCode === 'number' ? { statusCode: failure.statusCode } : {}),
      });

      const alternateCodec = options.plan.mode === 'codec-fallback' && index + 1 < options.plan.candidates.length
        ? options.plan.candidates[index + 1]?.codecId
        : undefined;
      const nextAction = decideNextAction({
        failure,
        plan: options.plan,
        planIndex: index,
        capability: options.capability,
        budget: options.budget,
        ledger: options.ledger,
        retryPolicy: options.retryPolicy,
        currentCodec: candidate.codecId,
        alternateCodec,
      });

      if (nextAction.type === 'try-next-codec' || nextAction.type === 'try-next-endpoint') {
        diagnostics.push(createProviderDiagnostic(
          nextAction.type === 'try-next-codec' ? 'image-edit.codec_fallback' : 'image-edit.endpoint_failover',
          `Continuing image-edit attempt plan after ${failure.kind}.`,
          {
            endpointId: candidate.endpointId,
            codecId: candidate.codecId,
            nextAction: nextAction.type,
          },
        ));
        continue;
      }

      const stopReason = nextAction.type === 'stop'
        ? nextAction.reason
        : 'retry_same_endpoint_owned_by_transport';

      diagnostics.push(createProviderDiagnostic(
        'image-edit.recovery_suppressed',
        `Stopping image-edit attempt plan after ${failure.kind}.`,
        {
          endpointId: candidate.endpointId,
          codecId: candidate.codecId,
          reason: stopReason,
          statusCode: failure.statusCode,
        },
      ));
      options.logger?.log('warn', 'image-edit.recovery_suppressed', {
        endpointId: candidate.endpointId,
        codecId: candidate.codecId,
        reason: stopReason,
        statusCode: failure.statusCode,
      });
      throw failure;
    }
  }

  throw lastError ?? new Error('Attempt plan exhausted without a result.');
}

function shouldFailover(error: unknown, failoverEnabled: boolean): boolean {
  if (!failoverEnabled) {
    return false;
  }
  const record = error as { readonly kind?: string; readonly statusCode?: number };
  if (
    record.kind === 'auth_failed' ||
    record.kind === 'rate_limited' ||
    record.kind === 'timeout' ||
    record.kind === 'invalid_response' ||
    record.kind === 'request_invalid'
  ) {
    return false;
  }
  if (record.kind === 'network_error' || record.kind === 'upstream_unavailable') {
    return true;
  }
  if (record.kind === 'unknown_provider_error') {
    return record.statusCode === 404 || record.statusCode === 408 || record.statusCode === 500 || record.statusCode === 529;
  }
  return false;
}

function shouldRetryCurrentEndpoint(
  error: unknown,
  attemptOnEndpoint: number,
  policy: RetryPolicy | undefined,
  opts: RetryOptions | undefined,
): boolean {
  const maxRetries = Math.max(0, policy?.maxRetries ?? 0);
  if (attemptOnEndpoint > maxRetries) {
    return false;
  }
  const kind = typeof error === 'object' && error !== null && 'kind' in error
    ? (error as { readonly kind?: string }).kind
    : undefined;
  if (kind !== 'rate_limited') {
    return false;
  }
  return isRetryableTransportError(error, opts);
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const activeSignal = signal;
    const timer = setTimeout(() => {
      activeSignal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      activeSignal?.removeEventListener('abort', onAbort);
      reject(activeSignal?.reason ?? new Error('Request was aborted.'));
    };
    activeSignal?.addEventListener('abort', onAbort, { once: true });
  });
}

function createDeadlineSignal(signal: AbortSignal | undefined, deadlineMs: number | undefined): AbortSignal | undefined {
  if (deadlineMs === undefined) {
    return signal;
  }
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function') {
    const timeout = AbortSignal.timeout(deadlineMs);
    if (signal) {
      try {
        return AbortSignal.any([signal, timeout]);
      } catch {
        return timeout;
      }
    }
    return timeout;
  }
  return signal;
}

/**
 * Shared endpoint failover executor.
 *
 * shared executor 统一 endpoint ordering / endpoint-local retry / cooldown /
 * failover / global budget / attempt diagnostics。
 */
export async function executeWithEndpointFailover<T>(
  options: ExecuteWithEndpointFailoverOptions<T>,
): Promise<ExecuteWithEndpointFailoverResult<T>> {
  const diagnostics: ProviderDiagnostic[] = [];
  const attempts: EndpointAttemptRecord[] = [];
  const cooldownMs = options.cooldownMs ?? 30_000;
  const orderedEndpoints = endpointOrder(options.connection);
  const candidates = options.failoverEnabled === false
    ? orderedEndpoints.slice(0, 1)
    : providerConnectionAllowsFailover(options.connection)
      ? orderedEndpoints
      : orderedEndpoints.slice(0, 1);
  const maxAttempts = Math.max(1, options.maxAttempts ?? candidates.length);
  const startedAt = currentTime();
  let lastError: unknown;
  let stopAfterCurrentEndpoint = false;

  for (const endpoint of candidates) {
    if (stopAfterCurrentEndpoint) {
      break;
    }
    if (attempts.length >= maxAttempts || (options.deadlineMs !== undefined && currentTime() - startedAt >= options.deadlineMs)) {
      break;
    }
    const health = endpointHealth(options.connection, endpoint);
    if ((health.openUntil ?? 0) > currentTime()) {
      attempts.push({
        endpointId: endpoint.id,
        endpointUrl: endpoint.url,
        attemptIndex: attempts.length + 1,
        outcome: 'skipped_cooldown',
      });
      diagnostics.push(createProviderDiagnostic(
        'endpoint.cooldown_skip',
        `Skipping endpoint "${endpoint.id}" during cooldown.`,
        { endpointId: endpoint.id, endpointUrl: endpoint.url, openUntil: health.openUntil },
      ));
      continue;
    }

    let endpointAttempt = 0;
    while (attempts.length < maxAttempts) {
      if (options.deadlineMs !== undefined && currentTime() - startedAt >= options.deadlineMs) {
        break;
      }
      endpointAttempt += 1;
      const remainingDeadline = options.deadlineMs !== undefined
        ? Math.max(1, options.deadlineMs - (currentTime() - startedAt))
        : undefined;
      const effectiveSignal = createDeadlineSignal(options.signal, remainingDeadline);
      diagnostics.push(createProviderDiagnostic(
        'endpoint.attempt',
        `Attempting endpoint "${endpoint.id}".`,
        {
          endpointId: endpoint.id,
          endpointUrl: endpoint.url,
          attemptIndex: attempts.length + 1,
          endpointAttempt,
        },
      ));

      try {
        const value = await options.execute(endpoint, effectiveSignal);
        health.consecutiveFailures = 0;
        health.openUntil = undefined;
        health.lastSuccessAt = currentTime();
        health.lastTouchedAt = currentTime();
        attempts.push({
          endpointId: endpoint.id,
          endpointUrl: endpoint.url,
          attemptIndex: attempts.length + 1,
          outcome: 'success',
        });
        diagnostics.push(createProviderDiagnostic(
          'endpoint.selected',
          `Selected endpoint "${endpoint.id}".`,
          { endpointId: endpoint.id, endpointUrl: endpoint.url, endpointAttempt },
        ));
        return {
          selectedEndpointId: endpoint.id,
          value,
          diagnostics,
          attempts,
        };
      } catch (error) {
        const record = error as { readonly kind?: string; readonly statusCode?: number };
        const failoverEnabled = options.failoverEnabled ?? providerConnectionAllowsFailover(options.connection);
        const retryable = shouldRetryCurrentEndpoint(error, endpointAttempt, options.retryPolicy, options.retryOptions);
        const failover = shouldFailover(error, failoverEnabled);
        lastError = error;
        health.consecutiveFailures += 1;
        health.lastTouchedAt = currentTime();
        if (failover) {
          health.openUntil = currentTime() + cooldownMs;
        }
        attempts.push({
          endpointId: endpoint.id,
          endpointUrl: endpoint.url,
          attemptIndex: attempts.length + 1,
          outcome: 'failure',
          ...(record.kind ? { kind: record.kind } : {}),
          ...(typeof record.statusCode === 'number' ? { statusCode: record.statusCode } : {}),
        });
        diagnostics.push(createProviderDiagnostic(
          retryable ? 'endpoint.retry' : failover ? 'endpoint.failover' : 'endpoint.failure',
          `Endpoint "${endpoint.id}" failed.`,
          {
            endpointId: endpoint.id,
            endpointUrl: endpoint.url,
            endpointAttempt,
            ...(record.kind ? { kind: record.kind } : {}),
            ...(typeof record.statusCode === 'number' ? { statusCode: record.statusCode } : {}),
          },
        ));
        if (retryable && attempts.length < maxAttempts) {
          const waitMs = retryAfterMs(error) ?? (options.retryPolicy
            ? options.retryPolicy.baseDelayMs * Math.pow(options.retryPolicy.factor, Math.max(0, endpointAttempt - 1))
            : 0);
          if (waitMs > 0) {
            diagnostics.push(createProviderDiagnostic(
              'endpoint.retry_wait',
              `Retrying endpoint "${endpoint.id}" after backoff.`,
              { endpointId: endpoint.id, waitMs, endpointAttempt },
            ));
            await sleep(waitMs, effectiveSignal);
          }
          continue;
        }
        if (!failover) {
          stopAfterCurrentEndpoint = true;
          break;
        }
        break;
      }
    }
  }

  throw lastError ?? new Error('No endpoint candidates were available.');
}
