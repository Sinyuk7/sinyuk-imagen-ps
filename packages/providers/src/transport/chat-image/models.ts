import type { DiscoveredModel } from '../../contract/model.js';
import { mapInvalidResponseError } from '../image-endpoint/error-map.js';

interface ChatImageModelsResponse {
  readonly data?: readonly unknown[];
}

export function parseChatImageModelsResponse(raw: unknown): readonly DiscoveredModel[] {
  if (typeof raw !== 'object' || raw === null) {
    throw mapInvalidResponseError('Chat image models response is not a JSON object.', { raw });
  }

  const response = raw as ChatImageModelsResponse;
  if (!Array.isArray(response.data)) {
    throw mapInvalidResponseError('Chat image models response "data" is not an array.', { raw });
  }

  const models: DiscoveredModel[] = [];
  const seen = new Set<string>();
  for (const item of response.data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const model = item as Record<string, unknown>;
    if (typeof model.id !== 'string' || model.id.length === 0) {
      continue;
    }

    const normalizedId = model.id.trim();
    if (normalizedId.length === 0 || seen.has(normalizedId)) {
      continue;
    }
    seen.add(normalizedId);
    models.push({ id: normalizedId });
  }

  return models;
}
