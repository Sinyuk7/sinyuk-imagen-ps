/**
 * @imagen-ps/providers
 *
 * provider 语义与 engine bridge 边界的稳定公开契约。
 * 纯逻辑包，无副作用。
 */

// Contract types
export type {
  AssetRef,
  CanonicalImageJobRequest,
  OpenAICompatibleProviderConfig,
  Provider,
  ProviderCapabilities,
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
  ProviderOperation,
  ProviderOutputOptions,
  ProviderRequest,
} from './contract/index.js';

// Registry
export type { ProviderRegistry, RegistryError } from './registry/index.js';
export { createProviderRegistry, registerBuiltins } from './registry/index.js';

// Mock provider
export type { MockProviderConfig, MockProviderOptions, MockProviderRequest } from './providers/mock/index.js';
export { mockConfigSchema, mockRequestSchema, createMockProvider, mockDescriptor } from './providers/mock/index.js';

// OpenAI-compatible provider
export {
  openaiCompatibleConfigSchema,
  createOpenAICompatibleProvider,
  openaiCompatibleDescriptor,
} from './providers/openai-compatible/index.js';

// Bridge adapter
export { createDispatchAdapter } from './bridge/index.js';
