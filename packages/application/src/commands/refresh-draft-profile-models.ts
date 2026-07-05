import { createProviderError, createValidationError } from '@imagen-ps/core-engine';
import { generateTraceId } from '@imagen-ps/foundation';
import { getRuntimeLogger, getUserModelConfigRepository } from '../runtime.js';
import type {
  CommandResult,
  ProfileModelItem,
  RefreshDraftProfileModelsInput,
} from './types.js';
import { resolveDraftProviderContext } from './draft-provider-config.js';
import { catalogProviderIdForApiFormat } from './api-format-profile.js';
import {
  listLocalCatalogModels,
  providerUsesImageModelCatalog,
} from '@imagen-ps/providers';
import { reconcileProfileModels } from './profile-models.js';

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null && typeof (error as { readonly message?: unknown }).message === 'string') {
    return (error as { readonly message: string }).message;
  }
  return fallback;
}

function isValidationFailure(error: unknown): boolean {
  if (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as { readonly category?: unknown }).category === 'string' &&
    (error as { readonly category: string }).category === 'validation'
  ) {
    return true;
  }
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === 'ProviderValidationError') {
    return true;
  }
  return error.message.includes('Provider implementation for apiFormat "') && error.message.includes('" not found.');
}

function officialCatalogIds(apiFormat: Parameters<typeof catalogProviderIdForApiFormat>[0]): ReadonlySet<string> {
  const catalogProviderId = catalogProviderIdForApiFormat(apiFormat);
  if (!providerUsesImageModelCatalog(catalogProviderId)) {
    return new Set();
  }
  return new Set(listLocalCatalogModels(catalogProviderId).map((model) => model.id));
}

/**
 * 对 draft-aware provider config 执行 model discovery，但不持久化缓存。
 */
export async function refreshDraftProfileModels(
  input: RefreshDraftProfileModelsInput,
): Promise<CommandResult<readonly ProfileModelItem[]>> {
  const logger = getRuntimeLogger().child({
    trace_id: generateTraceId(),
    package: 'application',
    component: 'command',
    profile_id: input.profileId ?? 'draft',
    ...(input.apiFormat ? { apiFormat: input.apiFormat } : {}),
  });
  const span = logger.startSpan('command.model.refresh_draft');

  try {
    const { existing, provider, providerConfig, apiFormat } = await resolveDraftProviderContext(input);
    if (typeof provider.discoverModels !== 'function') {
      span.fail({ message: `Provider implementation for apiFormat "${apiFormat}" does not support model discovery.` });
      return {
        ok: false,
        error: createValidationError(
          `Provider implementation for apiFormat "${apiFormat}" does not support model discovery.`,
          { profileId: input.profileId, apiFormat },
        ),
      };
    }

    const discovered = await provider.discoverModels(
      providerConfig as never,
      logger.child({
        package: 'providers',
        component: 'provider',
        provider_id: provider.id,
      }),
    );
    const selectedModelIds = input.selectedModelIds ?? existing?.selectedModelIds ?? [];
    const userConfigs = await getUserModelConfigRepository().list(apiFormat);
    const items = reconcileProfileModels({
      discoveredModelIds: discovered.map((model) => model.id),
      userModelConfigs: userConfigs,
      officialCatalogModelIds: officialCatalogIds(apiFormat),
      selectedModelIds,
      defaultModelId: input.defaultModelId ?? existing?.defaultModelId,
    });
    span.finish({ discoveredCount: discovered.length, returnedCount: items.length });
    return { ok: true, value: items };
  } catch (error) {
    span.fail(error);
    const message = errorMessage(error, 'Model discovery failed for draft profile.');
    if (isValidationFailure(error)) {
      return {
        ok: false,
        error: createValidationError(message, {
          profileId: input.profileId,
          apiFormat: input.apiFormat,
        }),
      };
    }
    return {
      ok: false,
      error: createProviderError(message, {
        profileId: input.profileId,
        apiFormat: input.apiFormat,
      }),
    };
  }
}
