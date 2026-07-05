import type { ProviderModelInfo } from '../../contract/model.js';
import { reconcileDiscoveredCatalogModels, resolveImageModelRule } from '../../contract/image-model-capability.js';
import { mapInvalidResponseError } from '../image-endpoint/error-map.js';
import type { ProviderInvokeError } from '../image-endpoint/error-map.js';
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

interface OpenAiLikeModelObject {
  readonly id?: unknown;
  readonly name?: unknown;
}

interface OpenAiLikeModelsResponse {
  readonly data?: readonly OpenAiLikeModelObject[];
}

export interface ParsedGeminiGenerateContentModelsResponse {
  readonly models: readonly ProviderModelInfo[];
  readonly sourceFormat: 'gemini-native' | 'openai-like-fallback';
}

function supportsGenerateContent(methods: unknown): boolean {
  return Array.isArray(methods) && methods.some((method) => method === 'generateContent');
}

function reconcileGeminiDiscoveredModels(models: readonly ProviderModelInfo[]): readonly ProviderModelInfo[] {
  return reconcileDiscoveredCatalogModels({
    providerId: 'gemini-generate-content',
    discoveredModels: models,
  });
}

function parseNativeGeminiModelsResponse(raw: unknown): readonly ProviderModelInfo[] {
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

  return reconcileGeminiDiscoveredModels(models);
}

function parseOpenAiLikeModelsResponse(raw: unknown): readonly ProviderModelInfo[] {
  if (typeof raw !== 'object' || raw === null) {
    throw mapInvalidResponseError('Gemini Generate Content OpenAI-like models response is not a JSON object.', { raw });
  }

  const response = raw as OpenAiLikeModelsResponse;
  if (!Array.isArray(response.data)) {
    throw mapInvalidResponseError('Gemini Generate Content OpenAI-like models response missing "data" array.', { raw });
  }

  const models: ProviderModelInfo[] = [];
  for (const item of response.data) {
    if (typeof item !== 'object' || item === null) {
      continue;
    }
    const rawId =
      typeof item.id === 'string' && item.id.length > 0
        ? item.id
        : typeof item.name === 'string' && item.name.length > 0
          ? item.name
          : undefined;
    if (!rawId) {
      continue;
    }

    const normalizedId = normalizeGeminiGenerateContentModelId(rawId);
    const resolved = resolveImageModelRule({
      providerId: 'gemini-generate-content',
      modelId: normalizedId,
    });
    if (resolved.matchKind === 'default' || !resolved.capability.selection.visibleInPicker) {
      continue;
    }

    models.push({
      id: normalizedId,
      displayName: formatDisplayName(normalizedId),
    });
  }

  return reconcileGeminiDiscoveredModels(models);
}

function isInvalidResponseError(error: unknown): error is ProviderInvokeError {
  return typeof error === 'object'
    && error !== null
    && 'kind' in error
    && (error as { readonly kind?: unknown }).kind === 'invalid_response';
}

export function parseGeminiGenerateContentModelsResponse(raw: unknown): ParsedGeminiGenerateContentModelsResponse {
  try {
    return {
      models: parseNativeGeminiModelsResponse(raw),
      sourceFormat: 'gemini-native',
    };
  } catch (error) {
    if (!isInvalidResponseError(error)) {
      throw error;
    }
    return {
      models: parseOpenAiLikeModelsResponse(raw),
      sourceFormat: 'openai-like-fallback',
    };
  }
}
