import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderInvokeUsage } from '../../contract/result.js';
import { mapInvalidResponseError } from '../image-endpoint/error-map.js';

interface ChatImageResponse {
  readonly created?: number;
  readonly choices?: readonly ChatImageChoice[];
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
  };
}

interface ChatImageChoice {
  readonly message?: {
    readonly images?: readonly ChatImageResponseImage[];
    readonly content?: unknown;
  };
}

interface ChatImageResponseImage {
  readonly image_url?: {
    readonly url?: string;
  };
}

export interface ParsedChatImageResponse {
  readonly assets: readonly Asset[];
  readonly text?: string;
  readonly created?: number;
  readonly usage?: ProviderInvokeUsage;
}

function parseUsage(raw: ChatImageResponse['usage']): ProviderInvokeUsage | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }

  const inputTokens = typeof raw.prompt_tokens === 'number' ? raw.prompt_tokens : undefined;
  const outputTokens = typeof raw.completion_tokens === 'number' ? raw.completion_tokens : undefined;
  const totalTokens = typeof raw.total_tokens === 'number' ? raw.total_tokens : undefined;

  if (inputTokens === undefined || outputTokens === undefined || totalTokens === undefined) {
    return undefined;
  }

  return { inputTokens, outputTokens, totalTokens };
}

function mimeFromDataUrl(url: string): string | undefined {
  const match = /^data:([^;,]+)[;,]/.exec(url);
  return match?.[1];
}

function extensionFromMimeType(mimeType: string): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
    default:
      return 'png';
  }
}

function assetFromUrl(url: string, index: number): Asset {
  const mimeType = mimeFromDataUrl(url) ?? 'image/png';
  const name = `generated-${index + 1}.${extensionFromMimeType(mimeType)}`;
  if (url.startsWith('data:')) {
    const marker = ';base64,';
    const markerIndex = url.indexOf(marker);
    return {
      type: 'image',
      name,
      data: markerIndex >= 0 ? url.slice(markerIndex + marker.length) : url,
      mimeType,
    };
  }
  return {
    type: 'image',
    name,
    url,
    mimeType,
  };
}

function textFromContent(content: unknown): string | undefined {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (!Array.isArray(content)) {
    return undefined;
  }
  const parts = content.flatMap((part) => {
    if (typeof part === 'object' && part !== null) {
      const text = (part as { readonly text?: unknown }).text;
      return typeof text === 'string' && text.trim().length > 0 ? [text.trim()] : [];
    }
    return [];
  });
  return parts.length > 0 ? parts.join('\n') : undefined;
}

export function parseChatImageResponse(raw: unknown): ParsedChatImageResponse {
  if (typeof raw !== 'object' || raw === null) {
    throw mapInvalidResponseError('Chat image response is not a JSON object.', { raw });
  }

  const response = raw as ChatImageResponse;
  if (!Array.isArray(response.choices)) {
    throw mapInvalidResponseError('Chat image response missing "choices" array.', { raw });
  }

  const assets: Asset[] = [];
  const textParts: string[] = [];
  for (const choice of response.choices) {
    if (typeof choice !== 'object' || choice === null) {
      continue;
    }
    const text = textFromContent(choice.message?.content);
    if (text !== undefined) {
      textParts.push(text);
    }
    const images = choice.message?.images;
    if (!Array.isArray(images)) {
      continue;
    }
    for (const image of images) {
      const url = image.image_url?.url;
      if (typeof url === 'string' && url.length > 0) {
        assets.push(assetFromUrl(url, assets.length));
      }
    }
  }

  const text = textParts.length > 0 ? textParts.join('\n\n') : undefined;
  if (assets.length === 0 && text === undefined) {
    throw mapInvalidResponseError('Chat image response did not contain image URLs or text content.', { raw });
  }

  const result: {
    assets: readonly Asset[];
    text?: string;
    created?: number;
    usage?: ProviderInvokeUsage;
  } = { assets };

  if (text !== undefined) {
    result.text = text;
  }

  if (typeof response.created === 'number') {
    result.created = response.created;
  }

  const usage = parseUsage(response.usage);
  if (usage !== undefined) {
    result.usage = usage;
  }

  return result;
}
