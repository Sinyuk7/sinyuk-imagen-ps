import type { ProfileModelItem, ProviderModelInfo, UserModelConfig } from '@imagen-ps/application';

export interface UiModelInfo {
  readonly id: string;
  readonly displayName?: string;
  readonly wireModelId?: string;
  readonly discovered?: boolean;
  readonly configured?: boolean;
  readonly selected?: boolean;
  readonly default?: boolean;
  readonly configSource?: ProfileModelItem['configSource'];
}

export function modelInfoFromProfileItem(item: ProfileModelItem): UiModelInfo {
  return {
    id: item.modelId,
    ...(item.displayName !== undefined ? { displayName: item.displayName } : {}),
    ...(item.wireModelId !== undefined ? { wireModelId: item.wireModelId } : {}),
    discovered: item.discovered,
    configured: item.configured,
    selected: item.selected,
    default: item.default,
    ...(item.configSource !== undefined ? { configSource: item.configSource } : {}),
  };
}

export function modelInfoFromDescriptor(model: ProviderModelInfo): UiModelInfo {
  return {
    id: model.id,
    displayName: model.displayName,
    wireModelId: model.id,
    configured: true,
    selected: true,
  };
}

export function modelVisibleLabel(model: Pick<UiModelInfo, 'id' | 'displayName' | 'wireModelId' | 'configSource'>): string {
  if (typeof model.displayName === 'string' && model.displayName.trim().length > 0) {
    return model.displayName;
  }
  if (typeof model.wireModelId === 'string' && model.wireModelId.trim().length > 0) {
    return model.wireModelId;
  }
  return model.id;
}

export function modelDisplayName(model: UiModelInfo): string {
  return modelVisibleLabel(model);
}

export function mainSelectableModels(models: readonly UiModelInfo[]): readonly UiModelInfo[] {
  return models.filter((model) => model.selected === true && model.configured === true);
}

export function userModelConfigVisibleLabel(
  config: Pick<UserModelConfig, 'modelId' | 'wireModelId' | 'baseModelId'>,
  officialDisplayNames?: ReadonlyMap<string, string>,
): string {
  const displayName = officialDisplayNames?.get(config.baseModelId.trim());
  if (typeof displayName === 'string' && displayName.trim().length > 0) {
    return displayName;
  }
  if (config.wireModelId.trim().length > 0) {
    return config.wireModelId;
  }
  return config.modelId;
}
