import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import {
  providerUsesImageModelCatalog,
  reconcileDiscoveredCatalogModels,
  type ProviderModelInfo,
} from '@imagen-ps/providers';
import { getRuntimeLogger } from '../runtime.js';
import type {
  CommandResult,
  EndpointMeasurementResult,
  MeasureProfileEndpointsInput,
  MeasureProfileEndpointsResult,
} from './types.js';
import { resolveDraftProviderContext } from './draft-provider-config.js';
import { catalogProviderIdForApiFormat } from './api-format-profile.js';

type ResolvedConnection = {
  readonly selectionMode: 'manual' | 'auto';
  readonly selectedEndpointId?: string;
  readonly endpoints: readonly {
    readonly id: string;
    readonly url: string;
    readonly enabled: boolean;
  }[];
};

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function extractConnection(config: unknown): ResolvedConnection {
  const connection = (config as { readonly connection?: unknown }).connection;
  if (typeof connection !== 'object' || connection === null || Array.isArray(connection)) {
    throw new Error('Provider config did not resolve a canonical connection.');
  }
  return connection as ResolvedConnection;
}

function normalizeMeasuredModels(
  apiFormat: Parameters<typeof catalogProviderIdForApiFormat>[0],
  models: readonly ProviderModelInfo[],
): readonly ProviderModelInfo[] {
  const providerId = catalogProviderIdForApiFormat(apiFormat);
  if (!providerUsesImageModelCatalog(providerId)) {
    return models;
  }
  return reconcileDiscoveredCatalogModels({
    providerId,
    discoveredModels: models,
  });
}

function aggregateMeasuredModels(results: readonly EndpointMeasurementResult[]): readonly ProviderModelInfo[] {
  const seen = new Set<string>();
  const models: ProviderModelInfo[] = [];
  for (const result of results) {
    if (result.status !== 'success') {
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

function resolveAutoEndpointId(
  connection: ResolvedConnection,
  results: readonly EndpointMeasurementResult[],
  currentResolvedEndpointId: string | undefined,
): string | undefined {
  if (connection.selectionMode !== 'auto') {
    return undefined;
  }
  const successful = results.filter((result) => result.status === 'success');
  if (successful.length === 0) {
    return undefined;
  }
  const bestLatency = Math.min(...successful.map((result) => result.latencyMs ?? Number.POSITIVE_INFINITY));
  const winners = successful.filter((result) => (result.latencyMs ?? Number.POSITIVE_INFINITY) === bestLatency);
  if (currentResolvedEndpointId && winners.some((result) => result.endpointId === currentResolvedEndpointId)) {
    return currentResolvedEndpointId;
  }
  const winnerIds = new Set(winners.map((result) => result.endpointId));
  return connection.endpoints.find((endpoint) => winnerIds.has(endpoint.id))?.id;
}

function normalizeMeasurementResult(
  apiFormat: Parameters<typeof catalogProviderIdForApiFormat>[0],
  result: {
    readonly endpointId: string;
    readonly reachable: boolean;
    readonly checkedAt: number;
    readonly latencyMs?: number;
    readonly models?: readonly ProviderModelInfo[];
    readonly failureKind?: string;
    readonly httpStatus?: number;
    readonly errorMessage?: string;
  },
): EndpointMeasurementResult {
  const models = result.reachable
    ? normalizeMeasuredModels(apiFormat, result.models ?? [])
    : undefined;
  return {
    endpointId: result.endpointId,
    status: result.reachable ? 'success' : 'failed',
    checkedAt: result.checkedAt,
    ...(result.latencyMs !== undefined ? { latencyMs: result.latencyMs } : {}),
    ...(models ? { models, modelCount: models.length } : {}),
    ...(result.failureKind ? { failureKind: result.failureKind as EndpointMeasurementResult['failureKind'] } : {}),
    ...(typeof result.httpStatus === 'number' ? { httpStatus: result.httpStatus } : {}),
    ...(result.errorMessage ? { errorMessage: result.errorMessage } : {}),
  };
}

/**
 * 对 draft-aware endpoint 集合执行逐 endpoint 测速，不持久化 profile 变更。
 */
export async function measureProfileEndpoints(
  input: MeasureProfileEndpointsInput,
): Promise<CommandResult<MeasureProfileEndpointsResult>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: input.profileId ?? 'draft',
    ...(input.apiFormat ? { apiFormat: input.apiFormat } : {}),
  });
  const span = logger.startSpan('command.profile.endpoints.measure');

  try {
    const { provider, providerConfig, apiFormat } = await resolveDraftProviderContext(input);
    const connection = extractConnection(providerConfig);
    const enabledEndpoints = connection.endpoints.filter((endpoint) => endpoint.enabled);
    if (enabledEndpoints.length === 0) {
      span.fail({ message: 'Endpoint measurement requires at least one enabled endpoint.' });
      return {
        ok: false,
        error: createValidationError('Endpoint measurement requires at least one enabled endpoint.', {}),
      };
    }

    if (provider.describe().connectivity?.endpointMeasurement === 'unsupported' || typeof provider.measureEndpoints !== 'function') {
      span.finish({ count: enabledEndpoints.length, supported: false });
      return {
        ok: true,
        value: {
          supported: false,
          results: [],
          message: `Provider implementation for apiFormat "${apiFormat}" does not support endpoint measurement.`,
        },
      };
    }

    const measured = await provider.measureEndpoints(providerConfig as never, {
      signal: input.signal,
      timeoutMs: input.timeoutMs,
      maxConcurrency: input.maxConcurrency,
      logger: logger.child({
        package: 'providers',
        component: 'provider',
        provider_id: provider.id,
      }),
    });

    const results = measured.results.map((result) => normalizeMeasurementResult(apiFormat, result));
    const models = aggregateMeasuredModels(results);
    const resolvedEndpointId = resolveAutoEndpointId(connection, results, input.currentResolvedEndpointId);

    span.finish({
      count: results.length,
      successCount: results.filter((result) => result.status === 'success').length,
      modelCount: models.length,
      supported: measured.supported,
      ...(resolvedEndpointId ? { resolvedEndpointId } : {}),
    });
    return {
      ok: true,
      value: {
        supported: measured.supported,
        results,
        ...(models.length > 0 ? { models } : {}),
        ...(resolvedEndpointId ? { resolvedEndpointId } : {}),
        ...(measured.message ? { message: measured.message } : {}),
      },
    };
  } catch (error) {
    span.fail(error);
    return {
      ok: false,
      error: createProviderError(errorMessage(error, 'Endpoint measurement failed.'), {
        apiFormat: input.apiFormat,
        profileId: input.profileId,
      }),
    };
  }
}
