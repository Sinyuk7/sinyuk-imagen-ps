import { createValidationError } from '@imagen-ps/core-engine';
import { implementationIdForApiFormat } from '@imagen-ps/providers';
import type {
  ApiFormat,
  ProviderDescriptor,
  ProviderImplementationId,
  ProviderOperation,
} from '@imagen-ps/providers';
import { getProviderProfileRepository, getRuntime } from '../runtime.js';
import { continueProviderProfileSetup, saveProviderProfile } from './provider-profiles.js';
import type { CommandResult, ProviderProfile, ProviderProfileConfig } from './types.js';

/** UI 可见的 Provider 身份；产品文案与图标仍由 app 持有。 */
export interface ProviderSurfaceIdentity {
  readonly apiFormat: ApiFormat;
  readonly implementationId: ProviderImplementationId;
}

/** UI 可消费的无 secret、无 transport 细节 Provider 投影。 */
export interface ProviderSurfaceProjection {
  readonly identity: ProviderSurfaceIdentity;
  readonly operations: readonly ProviderOperation[];
  readonly defaultModelId: string;
  readonly modelIds: readonly string[];
  readonly canTestConnection: boolean;
}

/** 专用 Profile 页面提交给 Application 的最小输入。 */
export interface SaveProviderSurfaceProfileInput {
  readonly implementationId: ProviderImplementationId;
  readonly profileId: string;
  readonly displayName: string;
  readonly apiKey?: string;
  readonly removeSavedApiKey?: boolean;
  /** GRSAI 余额查询 Token；只写入 SecretStorage。 */
  readonly billingToken?: string;
  readonly removeSavedBillingToken?: boolean;
}

/** 将 Provider descriptor 投影为不泄露 wire/transport 配置的 UI surface。 */
export function projectProviderSurface(descriptor: ProviderDescriptor): ProviderSurfaceProjection | undefined {
  if (!descriptor.apiFormat || !descriptor.profileTemplate) {
    return undefined;
  }
  const implementationId = implementationIdForApiFormat(descriptor.apiFormat);
  if (descriptor.id !== implementationId) {
    return undefined;
  }
  return {
    identity: {
      apiFormat: descriptor.apiFormat,
      implementationId,
    },
    operations: [...descriptor.operations],
    defaultModelId: descriptor.profileTemplate.defaultModelId,
    modelIds: descriptor.defaultModelTemplates.map((template) => template.modelId),
    canTestConnection: descriptor.connectivity?.connectionTest === 'supported',
  };
}

function profileConfigFromDescriptor(descriptor: ProviderDescriptor, billingTokenPresent = false): ProviderProfileConfig {
  const template = descriptor.profileTemplate;
  if (!template) {
    throw new Error(`Provider "${descriptor.id}" does not define a profile template.`);
  }
  return {
    connection: {
      selectionMode: 'manual',
      selectedEndpointId: 'primary',
      endpoints: [{ id: 'primary', url: template.endpointUrl, enabled: true }],
    },
    paths: template.paths as unknown as ProviderProfileConfig[string],
    authMode: template.authMode,
    ...(descriptor.apiFormat === 'grsai'
      ? {
          billing: billingTokenPresent
            ? { source: 'billing-token', path: '/client/openapi/getCredits', tokenSecretRef: '' }
            : { source: 'profile-api-key', path: '/client/openapi/getAPIKeyCredits' },
        }
      : { billing: { source: 'disabled' } }),
    defaultModel: template.defaultModelId,
  };
}

/** 使用 Provider-owned template 创建或更新专用 Profile。 */
export async function saveProviderSurfaceProfile(
  input: SaveProviderSurfaceProfileInput,
): Promise<CommandResult<ProviderProfile>> {
  const provider = getRuntime().providerRegistry.get(input.implementationId);
  const descriptor = provider?.describe();
  if (!provider || !descriptor?.apiFormat || !descriptor.profileTemplate) {
    return {
      ok: false,
      error: createValidationError(`Provider surface "${input.implementationId}" is unavailable.`, {
        implementationId: input.implementationId,
      }),
    };
  }

  const existing = await getProviderProfileRepository().get(input.profileId);
  const apiKey = input.apiKey?.trim();
  const billingToken = input.billingToken?.trim();
  if (!existing && !apiKey) {
    return {
      ok: false,
      error: createValidationError('Provider Profile requires an API Key.', {
        implementationId: input.implementationId,
        profileId: input.profileId,
      }),
    };
  }

  const profileInput = {
    profileId: input.profileId,
    apiFormat: descriptor.apiFormat,
    displayName: input.displayName,
    config: profileConfigFromDescriptor(
      descriptor,
      Boolean(billingToken || (existing?.secretRefs?.billingToken && !input.removeSavedBillingToken)),
    ),
    ...((apiKey || billingToken) ? { secretValues: { ...(apiKey ? { apiKey } : {}), ...(billingToken ? { billingToken } : {}) } } : {}),
    ...((input.removeSavedApiKey || input.removeSavedBillingToken)
      ? { removedSecretNames: [ ...(input.removeSavedApiKey ? ['apiKey'] : []), ...(input.removeSavedBillingToken ? ['billingToken'] : []) ] }
      : {}),
  } as const;

  if (existing) {
    return saveProviderProfile(profileInput);
  }

  const created = await continueProviderProfileSetup({ profile: profileInput });
  if (!created.ok) {
    return created;
  }
  return { ok: true, value: created.value.profile };
}
