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
  ApiFormat,
  ApiFormatPaths,
  AssetRef,
  AuthMode,
  CanonicalImageJobRequest,
  CanonicalMaskImage,
  GeminiGenerateContentAuthMode,
  GeminiGenerateContentProviderConfig,
  GrsaiGenerateProviderConfig,
  GrsaiGeneratePaths,
  EndpointClassification,
  EndpointClassificationReason,
  EndpointClassificationSource,
  ExactTaskCost,
  GeminiGenerateContentPaths,
  GeminiGenerateContentRequestOutput,
  GrsaiGenerateRequestOutput,
  EffectiveImageOutputSelection,
  EditInputCapability,
  FlexiblePixelsGeometryCapability,
  GeometryCapability,
  ImageAspectRatio,
  ImageCatalogProviderId,
  ImageEndpointProviderConfig,
  ImageEndpointRequestOutput,
  ImageModelCapability,
  MaskCapability,
  MaskExecutionPlan,
  ImageOperation,
  ImageOutputCellId,
  ImageOutputCapability,
  ImageOutputFormat,
  ImageOutputGeometrySelection,
  ImageOutputImageSize,
  ImageOutputMatrix,
  ImageOutputMatrixCell,
  ImageOutputOption,
  ImageOutputSelection,
  ImageOutputSizeOptionId,
  ImageOutputUiArchetype,
  ImageOutputUiModel,
  ImageSizePreset,
  ModelOutputConfig,
  ModelBrand,
  ModelOperationCapability,
  ModelMatcher,
  ModelMatcherPattern,
  OfficialModelPreset,
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
  ProviderImplementationId,
  ProviderInvokeArgs,
  ProviderInvokeMetadata,
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
  RatioResolutionGeometryCapability,
  RequestStrategy,
  RequestStrategyId,
  ImageEditCodec,
  ResolvedImageModelOutput,
  ResolvedImageModelRule,
  SupportEvidence,
  UserModelOutputExposure,
} from './contract/index.js';
export {
  apiFormatForImplementationId,
  assembleApiUrl,
  canonicalizeProviderBaseUrl,
  canonicalizeProviderEndpointUrl,
  classifyEndpoint,
  defaultPathsForApiFormat,
  getPrimaryProviderEndpoint,
  implementationIdForApiFormat,
  normalizeApiFormatPaths,
  normalizeApiPath,
  normalizeProviderConnection,
  providerConnectionAllowsFailover,
  providerConnectionUsesAutomaticSelection,
  ImageModelContractError,
  assertProviderModelExecution,
  getOfficialModelPreset,
  getRequestStrategy,
  hasExplicitImageModelRule,
  isSupportedImageModelOutput,
  listLocalCatalogModels,
  listProviderDefaultModelTemplates,
  listOfficialModelPresets,
  listRequestStrategies,
  providerUsesImageModelCatalog,
  resolveImageModelOutput,
  resolveMaskExecutionPlan,
  resolveImageModelRule,
  resolveProviderResolvedOutput,
  getSupportedImageOutputSizePresets,
  summarizeImageModelCapabilities,
  tryResolveImageModelRule,
  validateImageModelCatalog,
} from './contract/index.js';

// Registry
export type { BuiltinProviderId, ProviderRegistry, RegistryError } from './registry/index.js';
export { builtins, createProviderRegistry, registerBuiltins } from './registry/index.js';

// Mock provider
export type { MockProviderConfig, MockProviderOptions, MockProviderRequest } from './providers/mock/index.js';
export { mockConfigSchema, mockRequestSchema, createMockProvider, mockDescriptor } from './providers/mock/index.js';

// Image endpoint provider
export {
  imageEndpointConfigSchema,
  createImageEndpointProvider,
  imageEndpointDescriptor,
} from './providers/openai-images/index.js';

// Gemini Generate Content provider
export {
  geminiGenerateContentConfigSchema,
  createGeminiGenerateContentProvider,
  geminiGenerateContentDescriptor,
} from './providers/gemini/index.js';

// GRSAI Generate provider
export {
  grsaiGenerateConfigSchema,
  createGrsaiGenerateProvider,
  grsaiGenerateDescriptor,
} from './providers/grsai/index.js';

// RunningHub fixed catalog provider
export {
  runningHubGenerateConfigSchema,
  createRunningHubGenerateProvider,
  runningHubGenerateDescriptor,
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
export { getProviderCatalog, listFixedProviders, resolveProviderCatalog } from './catalog.js';
export type { FixedGenerationRequest, FixedProviderResult } from './contract/fixed-generation.js';
export type { FixedPreparedRequest } from './fixed-provider-adapters.js';
export { prepareFixedProviderRequest, prepareGrsaiRequest, prepareRunningHubRequest } from './fixed-provider-adapters.js';
export type { CheckedProviderParameters } from './provider-parameter-checkers.js';
export { canonicalRunningHubRatio, checkProviderParameters } from './provider-parameter-checkers.js';
