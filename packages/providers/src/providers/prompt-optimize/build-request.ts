import type { PromptOptimizeRequest } from './request-schema.js';
import type { PromptOptimizeProviderConfig } from './config-schema.js';

export interface PromptOptimizeSystemMessage {
  readonly role: 'system';
  readonly content: string;
}

export interface PromptOptimizeUserMessage {
  readonly role: 'user';
  readonly content: string;
}

export interface PromptOptimizeCompletionBody {
  readonly model: string;
  readonly messages: readonly (PromptOptimizeSystemMessage | PromptOptimizeUserMessage)[];
  readonly [key: string]: unknown;
}

function resolveModel(request: PromptOptimizeRequest, defaultModel?: string): string {
  return typeof request.providerOptions?.model === 'string'
    ? (request.providerOptions.model as string)
    : (defaultModel ?? 'gpt-4o-mini');
}

export function buildPromptOptimizeRequestBody(
  request: PromptOptimizeRequest,
  config: PromptOptimizeProviderConfig,
): PromptOptimizeCompletionBody {
  return {
    model: resolveModel(request, config.defaultModel),
    messages: [
      { role: 'system', content: config.instruction },
      { role: 'user', content: request.prompt },
    ],
  };
}
