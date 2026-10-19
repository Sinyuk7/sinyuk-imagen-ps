import { getProviderCatalogModel, type CatalogModel, type FixedProviderId } from '../catalog.js';

/** JSON catalog 派生的最小模型能力投影。 */
export interface CatalogModelCapabilities {
  readonly providerId: FixedProviderId;
  readonly modelId: string;
  readonly label: string;
  readonly operations: CatalogModel['operations'];
  readonly parameters: CatalogModel['parameters'];
  readonly input?: CatalogModel['input'];
  readonly output?: CatalogModel['output'];
  readonly routes: Readonly<Record<string, { readonly path?: string; readonly endpoint?: string }>>;
}

/** 从统一 JSON catalog 读取模型能力，不生成第二份 matrix。 */
export function getCatalogModelCapabilities(
  providerId: FixedProviderId,
  modelId: string,
): CatalogModelCapabilities | undefined {
  const model = getProviderCatalogModel(providerId, modelId);
  if (!model) return undefined;
  return {
    providerId,
    modelId: model.id,
    label: model.label,
    operations: model.operations,
    parameters: model.parameters,
    ...(model.input ? { input: model.input } : {}),
    ...(model.output ? { output: model.output } : {}),
    routes: model.routes ?? {},
  };
}

