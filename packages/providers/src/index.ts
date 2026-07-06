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
  ChatImageProviderConfig,
  DiscoveredModel,
  GeminiGenerateContentAuthMode,
  GeminiGenerateContentProviderConfig,
  EndpointClassification,
  EndpointClassificationReason,
  EndpointClassificationSource,
  ExactTaskCost,
  GeminiGenerateContentPaths,
  GeminiGenerateContentRequestOutput,
  EffectiveImageOutputSelection,
  EditInputCapability,
  FlexiblePixelsGeometryCapability,
  GeometryCapability,
  ImageAspectRatio,
  ImageCatalogProviderId,
  ImageEndpointProviderConfig,
  ImageEndpointRequestOutput,
  ImageModelCapability,
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
  OpenAiChatCompletionsPaths,
  OpenAiImagesPaths,
  NormalizedImageInputContext,
  NormalizedImageInputGeometry,
  ProviderModelExecution,
  ProviderModelCapabilities,
  ProviderModelCapabilityReason,
  ProviderBalanceDetail,
  ProviderBalanceQueryInput,
  ProviderBalanceSnapshot,
  ProviderBalanceSummary,
  ProviderBillingMode,
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
  ProviderConfig,
  ProviderDescriptor,
  ProviderDiagnostic,
  ProviderDiagnosticLevel,
  ProviderDiagnostics,
  ProviderDispatchBridge,
  ProviderDispatchBridgeArgs,
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
  ChatImageRequestCodec,
  ChatImageRequestOutput,
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
  listOfficialModelPresets,
  listRequestStrategies,
  providerUsesImageModelCatalog,
  resolveImageModelOutput,
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
} from './providers/image-endpoint/index.js';

// Chat image provider
export { chatImageConfigSchema, createChatImageProvider, chatImageDescriptor } from './providers/chat-image/index.js';

// Gemini Generate Content provider
export {
  geminiGenerateContentConfigSchema,
  createGeminiGenerateContentProvider,
  geminiGenerateContentDescriptor,
} from './providers/gemini-generate-content/index.js';

// Bridge adapter
export { createDispatchAdapter } from './bridge/index.js';
