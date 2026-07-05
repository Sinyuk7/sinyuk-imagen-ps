import type { ProfileModelItem, ProviderModelInfo } from '@imagen-ps/application';

export interface UiModelInfo {
  readonly id: string;
  readonly displayName?: string;
  readonly discovered?: boolean;
  readonly configured?: boolean;
  readonly selected?: boolean;
  readonly default?: boolean;
  readonly configSource?: ProfileModelItem['configSource'];
}

export function modelInfoFromProfileItem(item: ProfileModelItem): UiModelInfo {
  return {
    id: item.modelId,
    displayName: item.modelId,
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
    configured: true,
    selected: true,
  };
}

export function mainSelectableModels(models: readonly UiModelInfo[]): readonly UiModelInfo[] {
  return models.filter((model) => model.selected === true && model.configured === true);
}
