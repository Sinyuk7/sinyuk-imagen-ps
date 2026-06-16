import type { ProviderModelInfo } from '../../contract/model.js';
import { formatDisplayName } from '../image-endpoint/models.js';
import { mapInvalidResponseError } from '../image-endpoint/error-map.js';

interface ChatImageModelsResponse {
  readonly data?: readonly unknown[];
}

function hasImageOutput(model: Record<string, unknown>): boolean {
  const architecture = model.architecture;
  if (typeof architecture === 'object' && architecture !== null) {
    const outputModalities = (architecture as { output_modalities?: unknown }).output_modalities;
    if (Array.isArray(outputModalities) && outputModalities.includes('image')) {
      return true;
    }
  }

  const id = typeof model.id === 'string' ? model.id.toLowerCase() : '';
  return id.includes('image') || id.includes('gpt-image') || id.includes('banana');
}

export function parseChatImageModelsResponse(raw: unknown): ProviderModelInfo[] {
  if (typeof raw !== 'object' || raw === null) {
    throw mapInvalidResponseError('Chat image models response is not a JSON object.', { raw });
  }

  const response = raw as ChatImageModelsResponse;
  if (!Array.isArray(response.data)) {
    throw mapInvalidResponseError('Chat image models response "data" is not an array.', { raw });
  }

  const models: ProviderModelInfo[] = [];
  for (const item of response.data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const model = item as Record<string, unknown>;
    if (typeof model.id !== 'string' || model.id.length === 0 || !hasImageOutput(model)) {
      continue;
    }
    models.push({
      id: model.id,
      displayName: typeof model.name === 'string' ? model.name : formatDisplayName(model.id),
    });
  }

  return models;
}
