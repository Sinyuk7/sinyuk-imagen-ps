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
  ImageAspectRatio,
  ImageCatalogProviderId,
  ImageEndpointProviderConfig,
  ImageModelCapability,
  ImageOperation,
  ImageOutputConstraintStrategy,
  ImageOutputVariant,
  ImageSizePreset,
  ModelOutputConfig,
  ModelBrand,
  ModelOperationCapability,
  ModelMatcher,
  ModelMatcherPattern,
  OfficialModelPreset,
  OpenAiChatCompletionsPaths,
  OpenAiImagesPaths,
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
  ProviderConnectionTestResult,
  ProviderEndpointConfig,
  ProviderEndpointMeasurement,
  ProviderEndpointMeasurementFailureKind,
  ProviderEndpointMeasurementOptions,
  ProviderEndpointMeasurementResult,
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
  ProviderResponseCodec,
  ProviderSettingsConnectivityCapability,
  ProviderWireCapability,
  RequestStrategy,
  RequestStrategyId,
  ChatImageRequestCodec,
  ImageEditCodec,
  ResolvedImageModelOutput,
  ResolvedImageModelRule,
  SupportEvidence,
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
  getSupportedImageOutputSizePresets,
  isSupportedImageModelOutput,
  listLocalCatalogModels,
  listOfficialModelPresets,
  listRequestStrategies,
  providerUsesImageModelCatalog,
  resolveImageModelOutput,
  resolveImageModelRule,
  summarizeImageModelCapabilities,
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
