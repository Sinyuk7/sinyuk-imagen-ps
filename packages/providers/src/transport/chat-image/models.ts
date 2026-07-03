import type { ProviderModelInfo } from '../../contract/model.js';
import { reconcileDiscoveredCatalogModels, resolveImageModelRule } from '../../contract/image-model-capability.js';
import { formatDisplayName } from '../image-endpoint/models.js';
import { mapInvalidResponseError } from '../image-endpoint/error-map.js';

interface ChatImageModelsResponse {
  readonly data?: readonly unknown[];
}

export function parseChatImageModelsResponse(raw: unknown): readonly ProviderModelInfo[] {
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
    if (typeof model.id !== 'string' || model.id.length === 0) {
      continue;
    }

    const resolved = resolveImageModelRule({
      providerId: 'chat-image',
      modelId: model.id,
    });
    if (resolved.matchKind === 'default' || !resolved.capability.selection.visibleInPicker) {
      continue;
    }

    models.push({
      id: model.id,
      displayName: typeof model.name === 'string' ? model.name : formatDisplayName(model.id),
    });
  }

  return reconcileDiscoveredCatalogModels({
    providerId: 'chat-image',
    discoveredModels: models,
  });
}
