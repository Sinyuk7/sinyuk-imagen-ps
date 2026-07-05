import { createValidationError } from '@imagen-ps/core-engine';
import {
  listLocalCatalogModels,
  type ProviderDescriptor,
  type ProviderModelInfo,
} from '@imagen-ps/providers';
import type { ProviderProfile } from './types.js';

function configuredDefaultModelValue(config: Readonly<Record<string, unknown>>): string {
  const value = config.defaultModel;
  return typeof value === 'string' ? value.trim() : '';
}

function isCatalogDescriptor(descriptor: Pick<ProviderDescriptor, 'id'>): descriptor is Pick<ProviderDescriptor, 'id'> & {
  readonly id: 'image-endpoint' | 'chat-image' | 'gemini-generate-content';
} {
  return descriptor.id === 'image-endpoint'
    || descriptor.id === 'chat-image'
    || descriptor.id === 'gemini-generate-content';
}

function supportedModelIdsForProfile(
  _profile: Pick<ProviderProfile, 'selectedModelIds'>,
  descriptor: Pick<ProviderDescriptor, 'id'>,
  descriptorDefaults: readonly ProviderModelInfo[],
): ReadonlySet<string> {
  if (isCatalogDescriptor(descriptor)) {
    return new Set(listLocalCatalogModels(descriptor.id).map((model) => model.id));
  }
  return new Set(descriptorDefaults.map((model) => model.id));
}

function supportedModelIdsForDraft(args: {
  readonly descriptor: Pick<ProviderDescriptor, 'id' | 'defaultModels'>;
}): ReadonlySet<string> {
  if (isCatalogDescriptor(args.descriptor)) {
    return new Set(listLocalCatalogModels(args.descriptor.id).map((model) => model.id));
  }
  return new Set((args.descriptor.defaultModels ?? []).map((model) => model.id));
}

function invalidDefaultModelError(args: {
  readonly profileId: string;
  readonly apiFormat: ProviderProfile['apiFormat'];
  readonly defaultModel: string;
}): ReturnType<typeof createValidationError> {
  return createValidationError(
    `Provider profile "${args.profileId}" defaultModel "${args.defaultModel}" is not supported for apiFormat "${args.apiFormat}".`,
    {
      profileId: args.profileId,
      apiFormat: args.apiFormat,
      defaultModel: args.defaultModel,
    },
  );
}

/**
 * 校验已保存 profile 的 defaultModel 必须命中当前允许列表。
 */
export function assertSupportedProfileDefaultModel(args: {
  readonly profile: Pick<ProviderProfile, 'profileId' | 'apiFormat' | 'config' | 'selectedModelIds'>;
  readonly descriptor: Pick<ProviderDescriptor, 'id' | 'defaultModels'>;
  readonly descriptorDefaults: readonly ProviderModelInfo[];
}): void {
  const defaultModel = configuredDefaultModelValue(args.profile.config);
  if (defaultModel.length === 0) {
    return;
  }
  const supportedIds = supportedModelIdsForProfile(args.profile, args.descriptor, args.descriptorDefaults);
  if (supportedIds.has(defaultModel)) {
    return;
  }
  throw invalidDefaultModelError({
    profileId: args.profile.profileId,
    apiFormat: args.profile.apiFormat,
    defaultModel,
  });
}

/**
 * 校验 draft/save 输入里的 defaultModel 必须命中当前允许列表。
 */
export function assertSupportedDraftDefaultModel(args: {
  readonly profileId: string;
  readonly apiFormat: ProviderProfile['apiFormat'];
  readonly config: Readonly<Record<string, unknown>>;
  readonly descriptor: Pick<ProviderDescriptor, 'id' | 'defaultModels'>;
}): void {
  const defaultModel = configuredDefaultModelValue(args.config);
  if (defaultModel.length === 0) {
    return;
  }
  const supportedIds = supportedModelIdsForDraft({
    descriptor: args.descriptor,
  });
  if (supportedIds.has(defaultModel)) {
    return;
  }
  throw invalidDefaultModelError({
    profileId: args.profileId,
    apiFormat: args.apiFormat,
    defaultModel,
  });
}
