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
  ProviderProfileConnectionTestResult,
  TestProviderProfileConnectionInput,
} from './types.js';
import { resolveDraftProviderContext } from './draft-provider-config.js';

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function normalizeModels(
  providerId: string,
  models: readonly ProviderModelInfo[] | undefined,
): readonly ProviderModelInfo[] | undefined {
  if (!models) {
    return undefined;
  }
  if (!providerUsesImageModelCatalog(providerId)) {
    return models;
  }
  return reconcileDiscoveredCatalogModels({
    providerId,
    discoveredModels: models,
  });
}

/**
 * 对 draft-aware provider config 执行 provider 级连接测试。
 */
export async function testProviderProfileConnection(
  input: TestProviderProfileConnectionInput,
): Promise<CommandResult<ProviderProfileConnectionTestResult>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: input.profileId ?? 'draft',
    provider_id: input.providerId,
  });
  const span = logger.startSpan('command.profile.connection_test');

  try {
    const { provider, providerConfig } = await resolveDraftProviderContext(input);

    if (provider.describe().connectivity?.connectionTest === 'unsupported' || typeof provider.testConnection !== 'function') {
      span.finish({ supported: false });
      return {
        ok: true,
        value: {
          supported: false,
          message: `Provider implementation "${input.providerId}" does not support connection testing.`,
        },
      };
    }

    const tested = await provider.testConnection(
      providerConfig as never,
      logger.child({
        package: 'providers',
        component: 'provider',
        provider_id: input.providerId,
      }),
    );
    const models = normalizeModels(input.providerId, tested.models);
    const selectableCount = tested.modelCount ?? models?.filter(
      (model) => model.supportStatus === undefined || model.supportStatus === 'selectable',
    ).length;

    span.finish({
      supported: tested.supported,
      reachable: tested.reachable,
      ...(selectableCount !== undefined ? { modelCount: selectableCount } : {}),
    });
    return {
      ok: true,
      value: {
        supported: tested.supported,
        ...(tested.reachable !== undefined ? { reachable: tested.reachable } : {}),
        ...(selectableCount !== undefined ? { modelCount: selectableCount } : {}),
        ...(models ? { models } : {}),
        ...(tested.message ? { message: tested.message } : {}),
      },
    };
  } catch (error) {
    const message = errorMessage(error, 'Provider connection test failed.');
    span.fail(error);
    if (message.includes('Provider implementation "') && message.includes('" not found.')) {
      return {
        ok: false,
        error: createValidationError(message, { providerId: input.providerId }),
      };
    }
    return {
      ok: false,
      error: createProviderError(message, {
        providerId: input.providerId,
        profileId: input.profileId,
      }),
    };
  }
}
