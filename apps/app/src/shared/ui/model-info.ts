import { getProviderCatalog, type FixedProviderId, type ProviderModelInfo } from '@imagen-ps/application';

export interface UiModelInfo {
  readonly id: string;
  readonly displayName?: string;
  readonly wireModelId?: string;
  readonly discovered?: boolean;
  readonly configured?: boolean;
  readonly configSource?: 'catalog';
}

/** 固定 Provider 的本地 catalog 模型投影。 */
export function fixedProviderModels(providerId: FixedProviderId): readonly UiModelInfo[] {
  return getProviderCatalog(providerId).models.map((model) => ({ id: model.id, displayName: model.label, configured: true, configSource: 'catalog' }));
}
export function modelInfoFromDescriptor(model: ProviderModelInfo): UiModelInfo {
  return { id: model.id, displayName: model.displayName, wireModelId: model.id, configSource: 'catalog', configured: true };
}
function firstNonEmpty(values: ReadonlyArray<string | undefined>): string | undefined { return values.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim(); }
export function capabilityPresetLabel(model: Pick<UiModelInfo, 'id' | 'displayName' | 'wireModelId'>): string { return firstNonEmpty([model.displayName, model.wireModelId, model.id]) ?? model.id; }
export function configurationInstanceLabel(model: Pick<UiModelInfo, 'id' | 'displayName' | 'wireModelId' | 'configSource'>): string { return capabilityPresetLabel(model); }
export function modelDisplayName(model: UiModelInfo): string { return capabilityPresetLabel(model); }
export function mainSelectableModels(models: readonly UiModelInfo[]): readonly UiModelInfo[] { return models.filter((model) => model.configured === true); }
