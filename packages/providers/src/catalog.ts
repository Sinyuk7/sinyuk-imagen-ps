import grsaiCatalog from '../catalog/grsai.json';
import runninghubCatalog from '../catalog/runninghub.json';

/** 本地 provider catalog 的固定 provider 标识。 */
export type FixedProviderId = 'grsai' | 'runninghub';

/** 目录中的基础参数选项。 */
export interface CatalogChoiceOption { readonly value: string; readonly label: string; }

/** provider 模型参数定义。 */
export interface CatalogParameter {
  readonly type: 'choice';
  readonly default: string;
  readonly options: readonly CatalogChoiceOption[];
}

/** 本地模型目录中的模型条目。 */
export interface CatalogModel {
  readonly id: string;
  readonly label: string;
  readonly operations: readonly ('text_to_image' | 'image_edit')[];
  readonly parameters: Readonly<Record<string, CatalogParameter>>;
  readonly input?: { readonly maxImages?: number; readonly mask?: boolean };
  readonly endpoint?: string;
  readonly fixed?: Readonly<Record<string, string>>;
}

/** 随发布物提供的只读 provider catalog。 */
export interface ProviderCatalog {
  readonly schemaVersion: 1;
  readonly providerId: FixedProviderId;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly models: readonly CatalogModel[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertText(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${path} must be non-empty.`);
}

function parseCatalog(value: unknown): ProviderCatalog {
  if (!isRecord(value)) throw new Error('Catalog must be an object.');
  if (value.schemaVersion !== 1) throw new Error('Catalog schemaVersion must be 1.');
  if (value.providerId !== 'grsai' && value.providerId !== 'runninghub') throw new Error('Catalog providerId is unsupported.');
  assertText(value.displayName, 'displayName');
  assertText(value.baseUrl, 'baseUrl');
  assertText(value.defaultModel, 'defaultModel');
  if (!Array.isArray(value.models) || value.models.length === 0) throw new Error('Catalog models must be non-empty.');
  const ids = new Set<string>();
  const models = value.models.map((raw, index): CatalogModel => {
    if (!isRecord(raw)) throw new Error(`models[${index}] must be an object.`);
    assertText(raw.id, `models[${index}].id`); assertText(raw.label, `models[${index}].label`);
    if (ids.has(raw.id)) throw new Error(`Duplicate catalog model id "${raw.id}".`); ids.add(raw.id);
    if (!Array.isArray(raw.operations) || raw.operations.length === 0 || raw.operations.some((op) => op !== 'text_to_image' && op !== 'image_edit')) throw new Error(`models[${index}].operations is invalid.`);
    if (!isRecord(raw.parameters)) throw new Error(`models[${index}].parameters must be an object.`);
    const parameters: Record<string, CatalogParameter> = {};
    for (const [name, parameter] of Object.entries(raw.parameters)) {
      if (!isRecord(parameter) || parameter.type !== 'choice' || typeof parameter.default !== 'string' || !Array.isArray(parameter.options) || parameter.options.length === 0) throw new Error(`models[${index}].parameters.${name} is invalid.`);
      const values = new Set<string>();
      const options = parameter.options.map((option, optionIndex) => {
        if (!isRecord(option) || typeof option.value !== 'string' || typeof option.label !== 'string' || option.value.length === 0 || values.has(option.value)) throw new Error(`models[${index}].parameters.${name}.options[${optionIndex}] is invalid.`);
        values.add(option.value); return { value: option.value, label: option.label };
      });
      if (!values.has(parameter.default)) throw new Error(`models[${index}].parameters.${name}.default is not an option.`);
      parameters[name] = { type: 'choice', default: parameter.default, options };
    }
    return { id: raw.id, label: raw.label, operations: raw.operations, parameters, ...(isRecord(raw.input) ? { input: raw.input as CatalogModel['input'] } : {}), ...(typeof raw.endpoint === 'string' ? { endpoint: raw.endpoint } : {}), ...(isRecord(raw.fixed) ? { fixed: raw.fixed as Readonly<Record<string, string>> } : {}) };
  });
  if (!ids.has(value.defaultModel)) throw new Error('Catalog defaultModel is not present in models.');
  return { schemaVersion: 1, providerId: value.providerId, displayName: value.displayName, baseUrl: value.baseUrl, defaultModel: value.defaultModel, models };
}

const CATALOGS: Readonly<Record<FixedProviderId, ProviderCatalog>> = Object.freeze({
  grsai: parseCatalog(grsaiCatalog),
  runninghub: parseCatalog(runninghubCatalog),
});

/** 返回固定 provider 的只读本地目录。 */
export function getProviderCatalog(providerId: FixedProviderId): ProviderCatalog { return CATALOGS[providerId]; }
/** 列出固定 provider。 */
export function listFixedProviders(): readonly FixedProviderId[] { return ['grsai', 'runninghub']; }
