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
  AssetRef,
  CanonicalImageJobRequest,
  ChatImageProviderConfig,
  GeminiGenerateContentApiVersion,
  GeminiGenerateContentAuthMode,
  GeminiGenerateContentProviderConfig,
  ExactTaskCost,
  ImageAspectRatio,
  ImageCatalogProviderId,
  ImageEndpointProviderConfig,
  ImageModelCapability,
  ImageOperation,
  ImageOutputConstraintStrategy,
  ImageOutputVariant,
  ImageSizePreset,
  ModelBrand,
  ModelOperationCapability,
  ModelMatcher,
  ModelMatcherPattern,
  ProviderModelAvailability,
  ProviderModelAvailabilityReason,
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
  PromptOptimizeProviderConfig,
  PromptOptimizeRequest,
  Provider,
  ProviderConfig,
  ProviderDescriptor,
  ProviderDiagnostic,
  ProviderDiagnosticLevel,
  ProviderDiagnostics,
  ProviderDispatchBridge,
  ProviderDispatchBridgeArgs,
  ProviderFamily,
  ProviderInvokeArgs,
  ProviderInvokeMetadata,
  ProviderInvokeResult,
  ProviderInvokeUsage,
  ProviderModelInfo,
  ProviderModelMatchKind,
  ProviderModelSupportStatus,
  ProviderOperation,
  ProviderOutputOptions,
  ProviderRequest,
  ProviderResponseCodec,
  ProviderSettingsConnectivityCapability,
  ProviderWireCapability,
  ChatImageRequestCodec,
  ImageEditCodec,
  ResolvedImageModelOutput,
  ResolvedImageModelRule,
  SupportEvidence,
} from './contract/index.js';
export {
  canonicalizeProviderEndpointUrl,
  getPrimaryProviderEndpoint,
  normalizeProviderConnection,
  providerConnectionAllowsFailover,
  providerConnectionUsesAutomaticSelection,
  ImageModelContractError,
  describeConfiguredCatalogModel,
  getSupportedImageOutputSizePresets,
  isSupportedImageModelOutput,
  listLocalCatalogModels,
  providerUsesImageModelCatalog,
  reconcileDiscoveredCatalogModels,
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

// Prompt optimize provider
export {
  promptOptimizeConfigSchema,
  createPromptOptimizeProvider,
  promptOptimizeDescriptor,
  DEFAULT_OPTIMIZER_INSTRUCTION,
} from './providers/prompt-optimize/index.js';
export { parsePromptOptimizeResponse } from './providers/prompt-optimize/parse-response.js';

// Bridge adapter
export { createDispatchAdapter } from './bridge/index.js';
