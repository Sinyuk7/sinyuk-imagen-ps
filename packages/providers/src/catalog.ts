import grsaiCatalog from '../catalog/grsai.json';
import runninghubCatalog from '../catalog/runninghub.json';
import openaiCatalog from '../catalog/openai.json';
import googleGeminiCatalog from '../catalog/google-gemini.json';

/** 本地 provider catalog 的固定 provider 标识。 */
export type FixedProviderId = 'grsai' | 'runninghub' | 'openai' | 'google-gemini';
export type ImageCatalogProviderId = 'openai' | 'google-gemini' | 'grsai';

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
  readonly output?: CatalogOutput;
  readonly routes?: Readonly<Record<string, { readonly path?: string; readonly endpoint?: string }>>;
}

/** 模型输出能力；由 JSON catalog 声明，Provider 负责 wire 映射。 */
export interface CatalogOutput {
  readonly formats?: readonly ('png' | 'jpeg' | 'webp')[];
  readonly geometry?: Readonly<Record<string, unknown>>;
}

/** 返回指定 Provider catalog 中的模型条目。 */
export function getProviderCatalogModel(providerId: FixedProviderId, modelId: string): CatalogModel | undefined {
  return getProviderCatalog(providerId).models.find((model) => model.id === modelId);
}

/** 返回 catalog 模型声明的 operation 参数选项。 */
export function getProviderCatalogParameters(providerId: FixedProviderId, modelId: string): Readonly<Record<string, CatalogParameter>> {
  return getProviderCatalogModel(providerId, modelId)?.parameters ?? {};
}

/** 返回模型针对指定 operation 的 catalog 路由。 */
export function getProviderCatalogRoute(
  providerId: FixedProviderId,
  modelId: string,
  operation: 'text_to_image' | 'image_edit',
): string | undefined {
  const route = getProviderCatalogModel(providerId, modelId)?.routes?.[operation];
  return route?.path ?? route?.endpoint;
}

/** 随发布物提供的只读 provider catalog。 */
export interface ProviderCatalog {
  readonly schemaVersion: 1 | 2;
  readonly providerId: FixedProviderId;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly models: readonly CatalogModel[];
}

/** catalog 来源及回退诊断。 */
export interface CatalogResolution {
  readonly catalog: ProviderCatalog;
  readonly source: 'remote' | 'local';
  readonly fallbackReason?: string;
}

/** 可替换的远程 catalog 来源。 */
export interface CatalogRemoteSource {
  readonly load: (providerId: FixedProviderId) => Promise<unknown>;
}

/** catalog resolver 依赖。 */
export interface CatalogResolverOptions {
  readonly remote?: CatalogRemoteSource;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertText(value: unknown, path: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${path} must be non-empty.`);
}

function parseCatalog(value: unknown): ProviderCatalog {
  if (!isRecord(value)) throw new Error('Catalog must be an object.');
  if (value.schemaVersion !== 1 && value.schemaVersion !== 2) throw new Error('Catalog schemaVersion must be 1 or 2.');
  if (value.providerId !== 'grsai' && value.providerId !== 'runninghub' && value.providerId !== 'openai' && value.providerId !== 'google-gemini') throw new Error('Catalog providerId is unsupported.');
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
    return { id: raw.id, label: raw.label, operations: raw.operations, parameters, ...(isRecord(raw.input) ? { input: raw.input as CatalogModel['input'] } : {}), ...(typeof raw.endpoint === 'string' ? { endpoint: raw.endpoint } : {}), ...(isRecord(raw.fixed) ? { fixed: raw.fixed as Readonly<Record<string, string>> } : {}), ...(isRecord(raw.output) ? { output: { ...(Array.isArray(raw.output.formats) ? { formats: raw.output.formats as CatalogOutput['formats'] } : {}), ...(isRecord(raw.output.geometry) ? { geometry: raw.output.geometry } : {}) } } : {}), ...(isRecord(raw.routes) ? { routes: raw.routes as CatalogModel['routes'] } : {}) };
  });
  if (!ids.has(value.defaultModel)) throw new Error('Catalog defaultModel is not present in models.');
  return { schemaVersion: value.schemaVersion, providerId: value.providerId, displayName: value.displayName, baseUrl: value.baseUrl, defaultModel: value.defaultModel, models };
}

const CATALOGS: Readonly<Record<FixedProviderId, ProviderCatalog>> = Object.freeze({
  grsai: parseCatalog(grsaiCatalog),
  runninghub: parseCatalog(runninghubCatalog),
  openai: parseCatalog(openaiCatalog),
  'google-gemini': parseCatalog(googleGeminiCatalog),
});

/** 返回固定 provider 的只读本地目录。 */
export function getProviderCatalog(providerId: FixedProviderId): ProviderCatalog { return CATALOGS[providerId]; }
/** 列出固定 provider。 */
export function listFixedProviders(): readonly FixedProviderId[] { return ['openai', 'google-gemini', 'grsai', 'runninghub']; }

/** 优先远程读取并校验，失败时回退到发布物内置 catalog。 */
export async function resolveProviderCatalog(providerId: FixedProviderId, options: CatalogResolverOptions = {}): Promise<CatalogResolution> {
  if (options.remote) {
    try {
      const remote = parseCatalog(await options.remote.load(providerId));
      if (remote.providerId !== providerId) throw new Error(`Remote catalog providerId mismatch: ${remote.providerId}.`);
      return { catalog: remote, source: 'remote' };
    } catch (error) {
      return { catalog: getProviderCatalog(providerId), source: 'local', fallbackReason: error instanceof Error ? error.message : String(error) };
    }
  }
  return { catalog: getProviderCatalog(providerId), source: 'local' };
}
