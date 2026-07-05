import { getProviderProfileRepository, getRuntime, getSecretStorageAdapter } from '../runtime.js';
import type {
  MeasureProfileEndpointsInput,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileConfigValue,
  RefreshDraftProfileModelsInput,
  TestProviderProfileConnectionInput,
} from './types.js';
import { resolveSecretValue } from './secret-utils.js';
import {
  normalizeProfileApiConfig,
  providerImplementationIdForApiFormat,
  resolveProfileApiFormat,
} from './api-format-profile.js';
import { assertSupportedDraftDefaultModel } from './default-model-validation.js';

type DraftCommandInput = MeasureProfileEndpointsInput | TestProviderProfileConnectionInput | RefreshDraftProfileModelsInput;

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
  input: DraftCommandInput,
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

export async function resolveDraftProviderContext(input: DraftCommandInput): Promise<{
  readonly existing: ProviderProfile | undefined;
  readonly displayName: string;
  readonly provider: NonNullable<ReturnType<ReturnType<typeof getRuntime>['providerRegistry']['get']>>;
  readonly providerConfig: unknown;
  readonly apiFormat: ProviderProfile['apiFormat'];
  readonly implementationId: string;
}> {
  const existing = input.profileId ? await getProviderProfileRepository().get(input.profileId) : undefined;
  const mergedConfig = mergeDraftConfig(existing?.config, input.config);
  const apiFormat = resolveProfileApiFormat({
    profileId: input.profileId ?? 'draft',
    existing,
    incomingApiFormat: input.apiFormat,
    config: mergedConfig,
  });
  const implementationId = providerImplementationIdForApiFormat(apiFormat);
  const provider = getRuntime().providerRegistry.getByApiFormat(apiFormat);
  if (!provider) {
    throw new Error(`Provider implementation for apiFormat "${apiFormat}" not found.`);
  }
  const resolvedSecrets = await resolveDraftSecrets(existing, input);
  const displayName = input.displayName ?? existing?.displayName ?? provider.describe().displayName;
  const normalizedConfig = normalizeProfileApiConfig(apiFormat, mergedConfig);
  assertSupportedDraftDefaultModel({
    profileId: input.profileId ?? 'draft',
    apiFormat,
    config: normalizedConfig,
    descriptor: provider.describe(),
  });
  const providerConfig = provider.validateConfig({
    providerId: implementationId,
    displayName,
    apiFormat,
    family: provider.family,
    ...normalizedConfig,
    ...resolvedSecrets,
  });
  return { existing, displayName, provider, providerConfig, apiFormat, implementationId };
}
