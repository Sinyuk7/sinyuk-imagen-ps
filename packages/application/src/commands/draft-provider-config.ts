import { getProviderProfileRepository, getRuntime, getSecretStorageAdapter } from '../runtime.js';
import type {
  MeasureProfileEndpointsInput,
  ProviderProfile,
  ProviderProfileConfig,
  ProviderProfileConfigValue,
  TestProviderProfileConnectionInput,
} from './types.js';
import { resolveSecretValue } from './secret-utils.js';

type DraftCommandInput = MeasureProfileEndpointsInput | TestProviderProfileConnectionInput;

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
}> {
  const existing = input.profileId ? await getProviderProfileRepository().get(input.profileId) : undefined;
  const provider = getRuntime().providerRegistry.get(input.providerId);
  if (!provider) {
    throw new Error(`Provider implementation "${input.providerId}" not found.`);
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
  return { existing, displayName, provider, providerConfig };
}
