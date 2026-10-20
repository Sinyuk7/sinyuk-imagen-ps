/**
 * @imagen-ps/providers
 *
 * provider 语义与 engine bridge 边界的稳定公开契约。
 * 纯逻辑包，无副作用。
 */

// Contract types
export type {
  BalanceChange,
  BillingEnabledProviderConfig,
  ProviderId,
  ProviderIdPaths,
  AssetRef,
  AuthMode,
  CanonicalImageJobRequest,
  CanonicalMaskImage,
  GoogleGeminiAuthMode,
  GoogleGeminiProviderConfig,
  GrsaiProviderConfig,
  GrsaiPaths,
  EndpointClassification,
  EndpointClassificationReason,
  EndpointClassificationSource,
  ExactTaskCost,
  GoogleGeminiPaths,
  GoogleGeminiRequestOutput,
  GrsaiRequestOutput,
  OpenAiProviderConfig,
  OpenAiRequestOutput,
  MaskCapability,
  MaskExecutionPlan,
  ImageAspectRatio,
  ImageOperation,
  ImageOutputFormat,
  ImageOutputGeometrySelection,
  ImageOutputImageSize,
  ImageOutputOption,
  ImageOutputSelection,
  ImageOutputSizeOptionId,
  ModelOperationCapability,
  ModelBrand,
  OpenAiImagesPaths,
  NormalizedImageInputContext,
  NormalizedImageInputGeometry,
  ProviderModelExecution,
  ProviderModelCapabilities,
  ProviderModelCapabilityReason,
  ProviderBillingConfig,
  ProviderBillingSource,
  ProviderBalanceDetail,
  ProviderBalanceQueryInput,
  ProviderBalanceQueryResult,
  ProviderBalanceSnapshot,
  ProviderBalanceSummary,
  BillingProtocolId,
  ProviderExecutionAttempt,
  ProviderExecutionInfo,
  ProviderConnectionConfig,
  ProviderEndpointConfig,
  ProviderEndpointMeasurement,
  ProviderEndpointMeasurementFailureKind,
  ProviderEndpointMeasurementOptions,
  ProviderEndpointMeasurementResult,
  ProviderSafeProbeContext,
  ProviderSafeProbeReason,
  ProviderSafeProbeResult,
  ProviderSafeProbeStatus,
  ProviderEndpointSelectionMode,
  Provider,
  ProviderAsyncExecutionArgs,
  ProviderAsyncExecutionExecutor,
  ProviderAsyncLifecycle,
  ProviderAsyncPollResult,
  ProviderAsyncSubmitResult,
  ProviderConfig,
  ProviderDescriptor,
  ProviderDefaultModelTemplate,
  ProviderDiagnostic,
  ProviderDiagnosticLevel,
  ProviderDiagnostics,
  ProviderFamily,
  ProviderAdapterId,
  ProviderInvokeArgs,
  ProviderInvokeMetadata,
  ProviderTaskUsage,
  ProviderInvokeResult,
  ProviderInvokeUsage,
  ProviderModelInfo,
  ProviderModelMatchKind,
  ProviderOperation,
  ProviderOutputOptions,
  ProviderRequest,
  ProviderResolvedOutput,
  ProviderResponseCodec,
  ProviderSettingsConnectivityCapability,
  ProviderWireCapability,
  ImageEditCodec,
  SupportEvidence,
} from './contract/index.js';
export {
  providerIdForAdapterId,
  assembleApiUrl,
  canonicalizeProviderBaseUrl,
  canonicalizeProviderEndpointUrl,
  classifyEndpoint,
  defaultPathsForProviderId,
  getPrimaryProviderEndpoint,
  adapterIdForProviderId,
  normalizeProviderIdPaths,
  normalizeApiPath,
  normalizeProviderConnection,
  providerConnectionAllowsFailover,
  providerConnectionUsesAutomaticSelection,
  assertProviderModelExecution,
  resolveMaskExecutionPlan,
} from './contract/index.js';

// Registry
export type { BuiltinProviderId, ProviderRegistry, RegistryError } from './registry/index.js';
export { builtins, createProviderRegistry, registerBuiltins } from './registry/index.js';

// Image endpoint provider
export {
  openAiConfigSchema,
  createOpenAiProvider,
  openAiDescriptor,
} from './providers/openai/index.js';

// Gemini Generate Content provider
export {
  googleGeminiConfigSchema,
  createGoogleGeminiProvider,
  googleGeminiDescriptor,
} from './providers/gemini/index.js';

// GRSAI Generate provider
export {
  grsaiConfigSchema,
  createGrsaiProvider,
  grsaiDescriptor,
} from './providers/grsai/index.js';

// RunningHub fixed catalog provider
export {
  runningHubConfigSchema,
  createRunningHubProvider,
  runningHubDescriptor,
} from './providers/runninghub/index.js';

// Bridge adapter
export type {
  CreateProviderExecutionAdapterOptions,
  ProviderExecutionConfigRef,
  ProviderExecutionConfigResolver,
  ProviderExecutionRequestMaterializationInput,
  ProviderExecutionRequestMaterializer,
} from './bridge/index.js';
export {
  createProviderExecutionAdapter,
  PROVIDER_EXECUTION_ADAPTER_ID,
} from './bridge/index.js';

export type { CatalogChoiceOption, CatalogModel, CatalogParameter, CatalogResolverOptions, CatalogRemoteSource, CatalogResolution, FixedProviderId, ProviderCatalog } from './catalog.js';
export { getProviderCatalog, getProviderCatalogModel, getProviderCatalogParameters, getProviderCatalogRoute, listFixedProviders, resolveProviderCatalog } from './catalog.js';
export type { FixedGenerationRequest, FixedProviderResult } from './contract/fixed-generation.js';
export type { FixedPreparedRequest } from './fixed-provider-adapters.js';
export { prepareFixedProviderRequest, prepareGrsaiRequest, prepareRunningHubRequest } from './fixed-provider-adapters.js';
export type { CheckedProviderParameters } from './provider-parameter-checkers.js';
export { canonicalRunningHubRatio, checkProviderParameters } from './provider-parameter-checkers.js';
export type { ProviderOutputMaterializer, ProviderRemoteOutput } from './traceable-lifecycle.js';
export { assertNoResubmitAfterUnknown, normalizeProviderRemoteOutputs, redactSignedUrl } from './traceable-lifecycle.js';
export type { CatalogModelCapabilities } from './catalog/capabilities.js';
export { getCatalogModelCapabilities } from './catalog/capabilities.js';
