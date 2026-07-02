import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import type { ProviderConnectionConfig, ProviderEndpointConfig } from '../../contract/config.js';
import type { Logger } from '@imagen-ps/foundation';
import type { RetryOptions, RetryPolicy } from './retry.js';
import { isRetryableTransportError, retryAfterMs } from './retry.js';

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

const endpointRuntimeHealth = new Map<string, EndpointRuntimeHealth>();

export function resetEndpointRuntimeHealthForTesting(): void {
  endpointRuntimeHealth.clear();
}

function connectionFingerprint(connection: ProviderConnectionConfig): string {
  return JSON.stringify({
    selectionMode: connection.selectionMode,
    failoverEnabled: connection.failoverEnabled,
    preferredEndpointId: connection.preferredEndpointId,
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

function endpointHealth(connection: ProviderConnectionConfig, endpoint: ProviderEndpointConfig): EndpointRuntimeHealth {
  const key = runtimeHealthKey(connection, endpoint);
  const existing = endpointRuntimeHealth.get(key);
  if (existing) {
    return existing;
  }
  const created: EndpointRuntimeHealth = { consecutiveFailures: 0 };
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

function endpointOrder(connection: ProviderConnectionConfig): readonly ProviderEndpointConfig[] {
  const enabled = connection.endpoints.filter((endpoint) => endpoint.enabled);
  if (connection.selectionMode === 'manual') {
    const preferred = enabled.find((endpoint) => endpoint.id === connection.preferredEndpointId);
    const rest = enabled.filter((endpoint) => endpoint.id !== connection.preferredEndpointId);
    return preferred ? [preferred, ...rest] : enabled;
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
  const candidates = options.failoverEnabled === false ? orderedEndpoints.slice(0, 1) : orderedEndpoints;
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
        const failoverEnabled = options.failoverEnabled ?? options.connection.failoverEnabled;
        const retryable = shouldRetryCurrentEndpoint(error, endpointAttempt, options.retryPolicy, options.retryOptions);
        const failover = shouldFailover(error, failoverEnabled);
        lastError = error;
        health.consecutiveFailures += 1;
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
