import { getProviderCatalog, type CatalogModel, type FixedProviderId, type ProviderCatalog } from './catalog.js';

/** provider 参数检查后的公共结果。 */
export interface CheckedProviderParameters {
  readonly model: CatalogModel;
  readonly parameters: Readonly<Record<string, string>>;
}

function modelFor(providerId: FixedProviderId, modelId: string, operation: 'text_to_image' | 'image_edit', catalog: ProviderCatalog): CatalogModel {
  if (catalog.providerId !== providerId) throw new Error('Catalog provider does not match request provider.');
  const model = catalog.models.find((candidate) => candidate.id === modelId);
  if (!model) throw new Error(`Unknown ${providerId} model "${modelId}".`);
  if (!model.operations.includes(operation)) throw new Error(`Model "${modelId}" does not support ${operation}.`);
  return model;
}

/** 检查固定 provider 的 catalog 参数；缺失值使用 catalog 默认值。 */
export function checkProviderParameters(input: {
  readonly providerId: FixedProviderId;
  readonly modelId: string;
  readonly operation: 'text_to_image' | 'image_edit';
  readonly parameters?: Readonly<Record<string, string>>;
}, catalog: ProviderCatalog = getProviderCatalog(input.providerId)): CheckedProviderParameters {
  const model = modelFor(input.providerId, input.modelId, input.operation, catalog);
  const supplied = input.parameters ?? {};
  const parameters: Record<string, string> = {};
  for (const [name, rule] of Object.entries(model.parameters)) {
    const value = supplied[name] ?? rule.default;
    if (!rule.options.some((option) => option.value === value)) {
      throw new Error(`Invalid ${name} for ${input.providerId} model "${input.modelId}".`);
    }
    parameters[name] = value;
  }
  return { model, parameters };
}

/** 将逻辑比例归一化为 RunningHub catalog 中的比例。 */
export function canonicalRunningHubRatio(value: string, supported: readonly string[]): string {
  if (value === 'auto' && supported.includes(value)) return value;
  const match = /^(\d+):(\d+)$/u.exec(value.trim());
  if (!match) throw new Error('Aspect ratio must be two positive integers separated by colon.');
  const width = Number(match[1]); const height = Number(match[2]);
  if (width <= 0 || height <= 0) throw new Error('Aspect ratio dimensions must be positive.');
  const divisor = (a: number, b: number): number => b === 0 ? a : divisor(b, a % b);
  const w = width / divisor(width, height); const h = height / divisor(width, height);
  const exact = supported.find((candidate) => {
    const parts = /^(\d+):(\d+)$/u.exec(candidate);
    return parts ? w * Number(parts[2]) === h * Number(parts[1]) : false;
  });
  if (!exact) throw new Error(`Aspect ratio ${value} is not supported by the selected RunningHub model.`);
  return exact;
}
