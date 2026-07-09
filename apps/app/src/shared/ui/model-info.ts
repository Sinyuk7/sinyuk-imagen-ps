import type { ProfileModelItem, ProviderModelInfo, UserModelConfig } from '@imagen-ps/application';

export interface UiModelInfo {
  readonly id: string;
  readonly displayName?: string;
  readonly wireModelId?: string;
  readonly discovered?: boolean;
  readonly configured?: boolean;
  readonly configSource?: ProfileModelItem['configSource'];
}

export function modelInfoFromProfileItem(item: ProfileModelItem): UiModelInfo {
  return {
    id: item.modelId,
    ...(item.displayName !== undefined ? { displayName: item.displayName } : {}),
    ...(item.wireModelId !== undefined ? { wireModelId: item.wireModelId } : {}),
    discovered: item.discovered,
    configured: item.configured,
    ...(item.configSource !== undefined ? { configSource: item.configSource } : {}),
  };
}

export function modelInfoFromDescriptor(model: ProviderModelInfo): UiModelInfo {
  return {
    id: model.id,
    displayName: model.displayName,
    wireModelId: model.id,
    configSource: 'catalog',
    configured: true,
  };
}

function firstNonEmpty(values: ReadonlyArray<string | undefined>): string | undefined {
  return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim();
}

export function capabilityPresetLabel(model: Pick<UiModelInfo, 'id' | 'displayName' | 'wireModelId'>): string {
  if (typeof model.displayName === 'string' && model.displayName.trim().length > 0) {
    return model.displayName;
  }
  if (typeof model.wireModelId === 'string' && model.wireModelId.trim().length > 0) {
    return model.wireModelId;
  }
  return model.id;
}

export function configurationInstanceLabel(model: Pick<UiModelInfo, 'id' | 'displayName' | 'wireModelId' | 'configSource'>): string {
  if (model.configSource === 'user') {
    return firstNonEmpty([model.id, model.wireModelId, model.displayName]) ?? model.id;
  }
  return capabilityPresetLabel(model);
}

export function modelDisplayName(model: UiModelInfo): string {
  return capabilityPresetLabel(model);
}

export function mainSelectableModels(models: readonly UiModelInfo[]): readonly UiModelInfo[] {
  return models.filter((model) => model.configured === true);
}

export interface ModelConfigListPresentation {
  readonly title: string;
  readonly metaPrimary: string;
}

export function modelConfigListPresentation(
  config: Pick<UserModelConfig, 'modelId' | 'wireModelId' | 'baseModelId'>,
  officialDisplayNames?: ReadonlyMap<string, string>,
): ModelConfigListPresentation {
  const displayName = officialDisplayNames?.get(config.baseModelId.trim());
  const title = firstNonEmpty([
    displayName,
    config.baseModelId,
    config.wireModelId,
    config.modelId,
  ]) ?? config.modelId;
  return {
    title,
    metaPrimary: firstNonEmpty([config.modelId, config.wireModelId, title]) ?? title,
  };
}

export function userConfiguredModelLabel(
  config: Pick<UserModelConfig, 'modelId' | 'wireModelId' | 'baseModelId'>,
): string {
  return firstNonEmpty([config.modelId, config.wireModelId, config.baseModelId]) ?? config.modelId;
}
