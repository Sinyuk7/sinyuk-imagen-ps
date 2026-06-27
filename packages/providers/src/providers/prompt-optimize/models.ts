import type { ProviderModelInfo } from '../../contract/model.js';
import { formatDisplayName } from '../../transport/image-endpoint/models.js';
import { mapInvalidResponseError } from '../../transport/image-endpoint/error-map.js';

interface PromptOptimizeModelsResponse {
  readonly data?: readonly unknown[];
}

export function parsePromptOptimizeModelsResponse(raw: unknown): ProviderModelInfo[] {
  if (typeof raw !== 'object' || raw === null) {
    throw mapInvalidResponseError('Prompt optimize models response is not a JSON object.', { raw });
  }

  const response = raw as PromptOptimizeModelsResponse;
  if (!Array.isArray(response.data)) {
    throw mapInvalidResponseError('Prompt optimize models response "data" is not an array.', { raw });
  }

  const models: ProviderModelInfo[] = [];
  for (const item of response.data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const model = item as Record<string, unknown>;
    if (typeof model.id !== 'string' || model.id.length === 0) {
      continue;
    }
    models.push({
      id: model.id,
      displayName: typeof model.name === 'string' ? model.name : formatDisplayName(model.id),
    });
  }

  return models;
}
