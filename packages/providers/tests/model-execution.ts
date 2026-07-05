import type { ProviderModelExecution } from './../src/contract/index.js';

type ImageEndpointStrategyId = 'image-endpoint-default' | 'image-endpoint-variant';
type GeminiGenerateContentStrategyId = 'gemini-generate-content-image-config';

export function imageEndpointModel(
  modelId: string,
  requestStrategyId: ImageEndpointStrategyId = 'image-endpoint-default',
): ProviderModelExecution {
  return {
    modelId,
    apiFormat: 'openai-images',
    requestStrategyId,
  };
}

export function chatImageModel(modelId: string): ProviderModelExecution {
  return {
    modelId,
    apiFormat: 'openai-chat-completions',
    requestStrategyId: 'chat-image-default',
  };
}

export function geminiGenerateContentModel(
  modelId: string,
  requestStrategyId: GeminiGenerateContentStrategyId = 'gemini-generate-content-image-config',
): ProviderModelExecution {
  return {
    modelId,
    apiFormat: 'gemini-generate-content',
    requestStrategyId,
  };
}
