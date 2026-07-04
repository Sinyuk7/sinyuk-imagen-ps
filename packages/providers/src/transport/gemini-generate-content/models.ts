import type { ProviderModelInfo } from '../../contract/model.js';
import { reconcileDiscoveredCatalogModels, resolveImageModelRule } from '../../contract/image-model-capability.js';
import { mapInvalidResponseError } from '../image-endpoint/error-map.js';
import { formatDisplayName } from '../image-endpoint/models.js';
import { normalizeGeminiGenerateContentModelId } from './build-request.js';

interface GeminiGenerateContentModel {
  readonly name?: unknown;
  readonly displayName?: unknown;
  readonly supportedGenerationMethods?: unknown;
}

interface GeminiGenerateContentModelsResponse {
  readonly models?: readonly GeminiGenerateContentModel[];
}

function supportsGenerateContent(methods: unknown): boolean {
  return Array.isArray(methods) && methods.some((method) => method === 'generateContent');
}

export function parseGeminiGenerateContentModelsResponse(raw: unknown): readonly ProviderModelInfo[] {
  if (typeof raw !== 'object' || raw === null) {
    throw mapInvalidResponseError('Gemini Generate Content models response is not a JSON object.', { raw });
  }

  const response = raw as GeminiGenerateContentModelsResponse;
  if (!Array.isArray(response.models)) {
    throw mapInvalidResponseError('Gemini Generate Content models response missing "models" array.', { raw });
  }

  const models: ProviderModelInfo[] = [];
  for (const item of response.models) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    if (typeof item.name !== 'string' || item.name.length === 0) {
      continue;
    }
    if (!supportsGenerateContent(item.supportedGenerationMethods)) {
      continue;
    }

    const normalizedId = normalizeGeminiGenerateContentModelId(item.name);
    const resolved = resolveImageModelRule({
      providerId: 'gemini-generate-content',
      modelId: normalizedId,
    });
    if (resolved.matchKind === 'default' || !resolved.capability.selection.visibleInPicker) {
      continue;
    }

    models.push({
      id: normalizedId,
      displayName:
        typeof item.displayName === 'string' && item.displayName.length > 0
          ? item.displayName
          : formatDisplayName(normalizedId),
    });
  }

  return reconcileDiscoveredCatalogModels({
    providerId: 'gemini-generate-content',
    discoveredModels: models,
  });
}
