import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  providerUsesImageModelCatalog,
  reconcileDiscoveredCatalogModels,
  type ProviderModelInfo,
} from '@imagen-ps/providers';
import { getProviderProfileRepository, getRuntime, getSecretStorageAdapter, getRuntimeLogger } from '../runtime.js';
import type {
  CommandResult,
  EndpointProbeFailureKind,
  EndpointProbeResult,
  ProbeProfileEndpointsInput,
  ProbeProfileEndpointsResult,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileConfigValue,
} from './types.js';
import { resolveSecretValue } from './secret-utils.js';

type EndpointConfigRecord = {
  readonly id: string;
  readonly url: string;
  readonly enabled: boolean;
};

type ResolvedConnection = {
  readonly selectionMode: 'manual' | 'auto';
  readonly failoverEnabled: boolean;
  readonly preferredEndpointId?: string;
  readonly endpoints: readonly EndpointConfigRecord[];
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function createAbortError(): JobErrorLike {
  return {
    category: 'validation',
    message: 'Endpoint probe was cancelled.',
  };
}

interface JobErrorLike {
  readonly category: string;
  readonly message: string;
}

function mergeDraftConfig(
  existing: ProviderProfileConfig | undefined,
  incoming: ProviderProfileConfig,
): ProviderProfileConfig {
  return {
    ...(existing ?? {}),
    ...incoming,
  } as Record<string, ProviderProfileConfigValue>;
}

async function resolveDraftSecrets(
  existing: ProviderProfile | undefined,
  input: ProbeProfileEndpointsInput,
): Promise<Record<string, string>> {
  const refs = { ...(existing?.secretRefs ?? {}), ...(input.secretRefs ?? {}) };
  const incomingSecretNames = new Set(Object.keys(input.secretValues ?? {}));
  for (const name of input.removedSecretNames ?? []) {
    if (!incomingSecretNames.has(name)) {
      delete refs[name];
    }
  }
  const resolved: Record<string, string> = {};
  for (const [name, ref] of Object.entries(refs)) {
    const value = await getSecretStorageAdapter().getSecret(ref);
    if (value !== undefined) {
      resolved[name] = resolveSecretValue(value);
    }
  }
  for (const [name, value] of Object.entries(input.secretValues ?? {})) {
    resolved[name] = resolveSecretValue(value);
  }
  return resolved;
}

function extractConnection(config: unknown): ResolvedConnection {
  const connection = (config as { readonly connection?: unknown }).connection;
  if (typeof connection !== 'object' || connection === null || Array.isArray(connection)) {
    throw new Error('Provider config did not resolve a canonical connection.');
  }
  const record = connection as {
    readonly selectionMode: 'manual' | 'auto';
    readonly failoverEnabled: boolean;
    readonly preferredEndpointId?: string;
    readonly endpoints: readonly EndpointConfigRecord[];
  };
  return record;
}

function perfNow(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
}

function classifyNetworkFailure(message: string): EndpointProbeFailureKind {
  const lower = message.toLowerCase();
  if (lower.includes('enotfound') || lower.includes('eai_again') || lower.includes('dns')) {
    return 'dns';
  }
  return 'connect';
}

function normalizeProbeFailure(
  endpointId: string,
  checkedAt: number,
  latencyMs: number,
  error: unknown,
): EndpointProbeResult {
  const details = error as { readonly kind?: string; readonly statusCode?: number; readonly message?: string };
  const message = errorMessage(error, 'Endpoint probe failed.');
  const statusCode = typeof details.statusCode === 'number' ? details.statusCode : undefined;
  switch (details.kind) {
    case 'auth_failed':
      return {
        endpointId,
        status: 'incompatible',
        latencyMs,
        checkedAt,
        failureKind: 'auth',
        ...(statusCode !== undefined ? { httpStatus: statusCode } : {}),
        errorMessage: message,
      };
    case 'rate_limited':
      return {
        endpointId,
        status: 'degraded',
        latencyMs,
        checkedAt,
        failureKind: 'rate-limit',
        ...(statusCode !== undefined ? { httpStatus: statusCode } : {}),
        errorMessage: message,
      };
    case 'invalid_response':
      return {
        endpointId,
        status: 'incompatible',
        latencyMs,
        checkedAt,
        failureKind: 'invalid-response',
        ...(statusCode !== undefined ? { httpStatus: statusCode } : {}),
        errorMessage: message,
      };
    case 'upstream_unavailable':
      return {
        endpointId,
        status: 'degraded',
        latencyMs,
        checkedAt,
        ...(statusCode !== undefined ? { httpStatus: statusCode } : {}),
        errorMessage: message,
      };
    case 'timeout':
      return {
        endpointId,
        status: 'unreachable',
        latencyMs,
        checkedAt,
        failureKind: 'timeout',
        errorMessage: message,
      };
    case 'network_error':
      return {
        endpointId,
        status: 'unreachable',
        latencyMs,
        checkedAt,
        failureKind: classifyNetworkFailure(message),
        errorMessage: message,
      };
    default:
      return {
        endpointId,
        status: 'incompatible',
        latencyMs,
        checkedAt,
        ...(statusCode !== undefined ? { httpStatus: statusCode } : {}),
        errorMessage: message,
      };
  }
}

function normalizeProbeModels(
  providerId: string,
  models: readonly ProviderModelInfo[],
): readonly ProviderModelInfo[] {
  if (!providerUsesImageModelCatalog(providerId)) {
    return models;
  }
  return reconcileDiscoveredCatalogModels({
    providerId,
    discoveredModels: models,
  });
}

function aggregateProbeModels(results: readonly EndpointProbeResult[]): readonly ProviderModelInfo[] {
  const seen = new Set<string>();
  const models: ProviderModelInfo[] = [];
  for (const result of results) {
    if (result.status !== 'healthy') {
      continue;
    }
    for (const model of result.models ?? []) {
      if (seen.has(model.id)) {
        continue;
      }
      seen.add(model.id);
      models.push(model);
    }
  }
  return models;
}

function withCancellationAndTimeout<T>(
  task: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number | undefined,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }
      signal?.removeEventListener('abort', onAbort);
    };

    const finish = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      fn();
    };

    const onAbort = () => finish(() => reject(createAbortError()));

    if (signal?.aborted) {
      onAbort();
      return;
    }

    if (signal) {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      timer = setTimeout(() => finish(() => reject(new Error('Endpoint probe timed out.'))), timeoutMs);
    }

    task.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

async function mapConcurrent<TInput, TOutput>(
  inputs: readonly TInput[],
  maxConcurrency: number,
  worker: (input: TInput, index: number) => Promise<TOutput>,
): Promise<readonly TOutput[]> {
  const results = new Array<TOutput>(inputs.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(maxConcurrency, inputs.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < inputs.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(inputs[currentIndex]!, currentIndex);
    }
  }));

  return results;
}

/**
 * 对 draft-aware endpoint 集合执行安全 probe，不持久化 profile 变更。
 */
export async function probeProfileEndpoints(
  input: ProbeProfileEndpointsInput,
): Promise<CommandResult<ProbeProfileEndpointsResult>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: input.profileId ?? 'draft',
    provider_id: input.providerId,
  });
  const span = logger.startSpan('command.profile.endpoints.probe');

  try {
    if (input.signal?.aborted) {
      throw createAbortError();
    }

    const existing = input.profileId ? await getProviderProfileRepository().get(input.profileId) : undefined;
    const provider = getRuntime().providerRegistry.get(input.providerId);
    if (!provider) {
      span.fail({ message: `Provider implementation "${input.providerId}" not found.` });
      return {
        ok: false,
        error: createValidationError(`Provider implementation "${input.providerId}" not found.`, {
          providerId: input.providerId,
        }),
      };
    }

    const resolvedSecrets = await resolveDraftSecrets(existing, input);
    const mergedConfig = mergeDraftConfig(existing?.config, input.config);
    const displayName = input.displayName ?? existing?.displayName ?? provider.describe().displayName;
    const providerConfig = provider.validateConfig({
      providerId: input.providerId,
      displayName,
      family: provider.family,
      ...mergedConfig,
      ...resolvedSecrets,
    });

    const connection = extractConnection(providerConfig);
    const enabledEndpoints = connection.endpoints.filter((endpoint) => endpoint.enabled);
    if (enabledEndpoints.length === 0) {
      span.fail({ message: 'Endpoint probe requires at least one enabled endpoint.' });
      return {
        ok: false,
        error: createValidationError('Endpoint probe requires at least one enabled endpoint.', {}),
      };
    }

    if (typeof provider.discoverModels !== 'function') {
      const checkedAt = Date.now();
      const results = enabledEndpoints.map((endpoint) => ({
        endpointId: endpoint.id,
        status: 'unsupported' as const,
        checkedAt,
        failureKind: 'unsupported-probe' as const,
        errorMessage: `Provider implementation "${input.providerId}" does not support a safe endpoint probe.`,
      }));
      span.finish({ count: results.length, supported: false });
      return { ok: true, value: { results } };
    }

    const results = await mapConcurrent(
      enabledEndpoints,
      input.maxConcurrency ?? 2,
      async (endpoint) => {
        if (input.signal?.aborted) {
          throw createAbortError();
        }
        const startedAt = perfNow();
        const checkedAt = Date.now();
        const endpointConfig = {
          ...providerConfig,
          ...(typeof input.timeoutMs === 'number' ? { timeoutMs: input.timeoutMs } : {}),
          connection: {
            selectionMode: 'manual' as const,
            failoverEnabled: false,
            preferredEndpointId: endpoint.id,
            endpoints: [endpoint],
          },
        };

        try {
          const discoveredModels = await withCancellationAndTimeout(
            provider.discoverModels!(endpointConfig as never),
            input.signal,
            input.timeoutMs,
          );
          const models = normalizeProbeModels(input.providerId, discoveredModels);
          return {
            endpointId: endpoint.id,
            status: 'healthy' as const,
            latencyMs: Math.max(1, Math.round(perfNow() - startedAt)),
            checkedAt,
            modelCount: models.length,
            models,
          } satisfies EndpointProbeResult;
        } catch (error) {
          if ((error as JobErrorLike).category === 'validation' && (error as JobErrorLike).message === createAbortError().message) {
            throw error;
          }
          const timeoutProbeError =
            error instanceof Error && error.message === 'Endpoint probe timed out.'
              ? { kind: 'timeout', message: error.message }
              : error;
          return normalizeProbeFailure(
            endpoint.id,
            checkedAt,
            Math.max(1, Math.round(perfNow() - startedAt)),
            timeoutProbeError,
          );
        }
      },
    );

    const suggestedEndpointId =
      connection.selectionMode === 'auto'
        ? [...results]
            .filter((result) => result.status === 'healthy')
            .sort((left, right) => (left.latencyMs ?? Number.POSITIVE_INFINITY) - (right.latencyMs ?? Number.POSITIVE_INFINITY))[0]
            ?.endpointId
        : undefined;
    const models = aggregateProbeModels(results);

    span.finish({
      count: results.length,
      healthyCount: results.filter((result) => result.status === 'healthy').length,
      modelCount: models.length,
      ...(suggestedEndpointId ? { suggestedEndpointId } : {}),
    });
    return {
      ok: true,
      value: {
        results,
        models,
        ...(suggestedEndpointId ? { suggestedEndpointId } : {}),
      },
    };
  } catch (error) {
    span.fail(error);
    if ((error as JobErrorLike).category === 'validation' && (error as JobErrorLike).message === createAbortError().message) {
      return { ok: false, error: createValidationError(createAbortError().message, {}) };
    }
    return {
      ok: false,
      error: createProviderError(errorMessage(error, 'Endpoint probe failed.'), {
        providerId: input.providerId,
        profileId: input.profileId,
      }),
    };
  }
}
