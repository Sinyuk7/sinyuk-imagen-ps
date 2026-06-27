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
  ChatImageProviderConfig,
  ImageEndpointProviderConfig,
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

// Image endpoint provider
export {
  imageEndpointConfigSchema,
  createImageEndpointProvider,
  imageEndpointDescriptor,
} from './providers/image-endpoint/index.js';

// Chat image provider
export { chatImageConfigSchema, createChatImageProvider, chatImageDescriptor } from './providers/chat-image/index.js';

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
