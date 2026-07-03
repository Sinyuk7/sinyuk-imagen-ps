import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import type { ProviderInvokeUsage } from '../../contract/result.js';
import { mapInvalidResponseError } from '../image-endpoint/error-map.js';

const MAX_PROVIDER_TEXT_CHARS = 4096;
const TRUNCATION_SUFFIX = '\n… [truncated]';
const INLINE_IMAGE_UNAVAILABLE = '[Image unavailable]';
const INLINE_IMAGE_OMITTED = '[image data omitted]';
const MAX_RESPONSE_IMAGES = 16;
const MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;
const SUPPORTED_INLINE_IMAGE_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const RESIDUAL_DATA_IMAGE_PATTERN = /data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/g;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG_SOI = [0xff, 0xd8] as const;
const JPEG_EOI = [0xff, 0xd9] as const;
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50] as const;

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

interface ParsedInlineImage {
  readonly start: number;
  readonly end: number;
  readonly alt: string;
  readonly url: string;
}

interface ParsedDataUrl {
  readonly mimeType: string;
  readonly payload: string;
  readonly normalizedUrl: string;
}

interface ExtractedTextResult {
  readonly text?: string;
  readonly sanitizedRawText: string;
  readonly assets: readonly Asset[];
  readonly diagnostics: readonly ProviderDiagnostic[];
}

interface ChoiceProcessingResult {
  readonly textParts: readonly string[];
  readonly sanitizedContent: unknown;
  readonly assets: readonly Asset[];
  readonly diagnostics: readonly ProviderDiagnostic[];
}

type ParsedChatImageAssetSource = 'message-images' | 'content';
type ParsedChatImageAssetReferenceKind = 'data-url' | 'remote-url';

/** 供上层埋点使用的响应图片摘要，禁止包含原始 URL 或 base64。 */
export interface ParsedChatImageAssetSummary {
  readonly source: ParsedChatImageAssetSource;
  readonly referenceKind: ParsedChatImageAssetReferenceKind;
  readonly mimeType?: string;
  readonly name?: string;
}

export interface ParsedChatImageResponse {
  readonly assets: readonly Asset[];
  readonly text?: string;
  readonly raw: unknown;
  readonly diagnostics?: readonly ProviderDiagnostic[];
  readonly assetSummaries?: readonly ParsedChatImageAssetSummary[];
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

function createDiagnostic(
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ProviderDiagnostic {
  return {
    code,
    message,
    level: 'warning',
    ...(details ? { details } : {}),
  };
}

function bytesEqual(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  if (offset + expected.length > bytes.byteLength) {
    return false;
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (bytes[offset + i] !== expected[i]) {
      return false;
    }
  }
  return true;
}

function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

function isEscaped(text: string, index: number): boolean {
  let slashCount = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    slashCount += 1;
  }
  return slashCount % 2 === 1;
}

function unescapeMarkdown(value: string): string {
  return value.replace(/\\([\\`[\]()<>"'])/g, '$1');
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\n{3,}/g, '\n\n').trim();
}

function truncatedText(text: string): string | undefined {
  const normalized = normalizeWhitespace(text);
  if (normalized.length === 0) {
    return undefined;
  }
  if (normalized.length <= MAX_PROVIDER_TEXT_CHARS) {
    return normalized;
  }
  const head = normalized.slice(0, MAX_PROVIDER_TEXT_CHARS - TRUNCATION_SUFFIX.length);
  return `${head}${TRUNCATION_SUFFIX}`;
}

function stripResidualDataImages(text: string): string {
  return text.replace(RESIDUAL_DATA_IMAGE_PATTERN, INLINE_IMAGE_UNAVAILABLE);
}

function decodeBase64(data: string): Uint8Array {
  const normalized = data.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    throw new Error('invalid_base64');
  }
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function validateImageBytes(bytes: Uint8Array, mimeType: string): void {
  if (bytes.byteLength === 0) {
    throw new Error('empty_image');
  }
  if (mimeType === 'image/png') {
    if (!bytesEqual(bytes, 0, PNG_SIGNATURE)) {
      throw new Error('invalid_png');
    }
    return;
  }
  if (mimeType === 'image/jpeg') {
    if (!bytesEqual(bytes, 0, JPEG_SOI) || !bytesEqual(bytes, bytes.byteLength - JPEG_EOI.length, JPEG_EOI)) {
      throw new Error('invalid_jpeg');
    }
    return;
  }
  if (mimeType === 'image/webp') {
    if (!bytesEqual(bytes, 0, WEBP_RIFF) || !bytesEqual(bytes, 8, WEBP_WEBP)) {
      throw new Error('invalid_webp');
    }
  }
}

function parseDataUrl(url: string): ParsedDataUrl {
  const markerIndex = url.indexOf(',');
  if (markerIndex < 0) {
    throw new Error('missing_data_separator');
  }
  const metadata = url.slice(5, markerIndex);
  const payload = url.slice(markerIndex + 1);
  const metadataParts = metadata.split(';').filter((part) => part.length > 0);
  const mimeType = metadataParts.shift()?.toLowerCase();
  if (!mimeType || !mimeType.startsWith('image/')) {
    throw new Error('unsupported_data_mime');
  }
  if (!SUPPORTED_INLINE_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error('unsupported_image_mime');
  }
  if (metadataParts.length !== 1 || metadataParts[0]?.toLowerCase() !== 'base64') {
    throw new Error('data_url_requires_base64');
  }
  const normalizedPayload = payload.replace(/\s+/g, '');
  const bytes = decodeBase64(normalizedPayload);
  if (bytes.byteLength > MAX_INLINE_IMAGE_BYTES) {
    throw new Error('image_too_large');
  }
  validateImageBytes(bytes, mimeType);
  return {
    mimeType,
    payload: normalizedPayload,
    normalizedUrl: `data:${mimeType};base64,${normalizedPayload}`,
  };
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

function assetFromUrl(url: string, index: number): { readonly asset: Asset; readonly referenceKind: ParsedChatImageAssetReferenceKind } {
  if (url.startsWith('data:')) {
    const parsed = parseDataUrl(url);
    return {
      asset: {
        type: 'image',
        name: `generated-${index + 1}.${extensionFromMimeType(parsed.mimeType)}`,
        data: parsed.payload,
        mimeType: parsed.mimeType,
      },
      referenceKind: 'data-url',
    };
  }
  const parsedUrl = new URL(url);
  return {
    asset: {
      type: 'image',
      name: `generated-${index + 1}.png`,
      url: parsedUrl.toString(),
      mimeType: 'image/png',
    },
    referenceKind: 'remote-url',
  };
}

function sanitizeImageUrl(url: string): string {
  if (!url.startsWith('data:')) {
    return url;
  }
  return INLINE_IMAGE_OMITTED;
}

function identityKeyForUrl(url: string): string {
  if (!url.startsWith('data:')) {
    return url;
  }
  return parseDataUrl(url).normalizedUrl;
}

function fallbackTextForHttpImage(alt: string, url: string): string {
  return truncatedText(alt) ?? truncatedText(url) ?? INLINE_IMAGE_UNAVAILABLE;
}

function tryMaterializeAsset(args: {
  readonly url: string;
  readonly alt: string;
  readonly source: ParsedChatImageAssetSource;
  readonly assets: Asset[];
  readonly assetSummaries: ParsedChatImageAssetSummary[];
  readonly seenAssetKeys: Set<string>;
  readonly diagnostics: ProviderDiagnostic[];
}): {
  readonly consumed: boolean;
  readonly replacement?: string;
} {
  try {
    const identityKey = identityKeyForUrl(args.url);
    if (args.seenAssetKeys.has(identityKey)) {
      return { consumed: true };
    }
    if (args.assets.length >= MAX_RESPONSE_IMAGES) {
      args.diagnostics.push(createDiagnostic(
        'chat-image.response.image-limit',
        'Chat image response exceeded the inline image limit.',
        { source: args.source, limit: MAX_RESPONSE_IMAGES },
      ));
      return {
        consumed: true,
        ...(args.source === 'content'
          ? { replacement: args.url.startsWith('data:') ? INLINE_IMAGE_UNAVAILABLE : fallbackTextForHttpImage(args.alt, args.url) }
          : {}),
      };
    }
    const { asset, referenceKind } = assetFromUrl(args.url, args.assets.length);
    args.seenAssetKeys.add(identityKey);
    args.assets.push(asset);
    args.assetSummaries.push({
      source: args.source,
      referenceKind,
      ...(asset.mimeType !== undefined ? { mimeType: asset.mimeType } : {}),
      ...(asset.name !== undefined ? { name: asset.name } : {}),
    });
    return { consumed: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    args.diagnostics.push(createDiagnostic(
      'chat-image.response.inline-image-invalid',
      'Chat image response contained an invalid inline image reference.',
      {
        source: args.source,
        reason,
        ...(args.url.startsWith('data:')
          ? {}
          : { scheme: args.url.startsWith('https://') ? 'https' : args.url.startsWith('http://') ? 'http' : 'unknown' }),
      },
    ));
    return {
      consumed: true,
      ...(args.source === 'content'
        ? { replacement: args.url.startsWith('data:') ? INLINE_IMAGE_UNAVAILABLE : fallbackTextForHttpImage(args.alt, args.url) }
        : {}),
    };
  }
}

function parseBracketedText(text: string, start: number, close: string): { readonly value: string; readonly nextIndex: number } | undefined {
  let cursor = start;
  let value = '';
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === close && !isEscaped(text, cursor)) {
      return { value, nextIndex: cursor + 1 };
    }
    value += char;
    cursor += 1;
  }
  return undefined;
}

function parseInlineDestination(text: string, start: number): { readonly url: string; readonly nextIndex: number } | undefined {
  if (text[start] === '<') {
    const bracketed = parseBracketedText(text, start + 1, '>');
    if (!bracketed) {
      return undefined;
    }
    return {
      url: unescapeMarkdown(bracketed.value.trim()),
      nextIndex: bracketed.nextIndex,
    };
  }

  let cursor = start;
  let depth = 0;
  let url = '';
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === '\\' && cursor + 1 < text.length) {
      url += text.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }
    if (char === '(') {
      depth += 1;
      url += char;
      cursor += 1;
      continue;
    }
    if (char === ')') {
      if (depth === 0) {
        break;
      }
      depth -= 1;
      url += char;
      cursor += 1;
      continue;
    }
    if (isWhitespace(char) && depth === 0) {
      break;
    }
    url += char;
    cursor += 1;
  }

  if (url.trim().length === 0) {
    return undefined;
  }
  return {
    url: unescapeMarkdown(url.trim()),
    nextIndex: cursor,
  };
}

function skipOptionalTitle(text: string, start: number): number | undefined {
  let cursor = start;
  while (cursor < text.length && isWhitespace(text[cursor]!)) {
    cursor += 1;
  }
  if (cursor >= text.length) {
    return undefined;
  }
  if (text[cursor] === ')') {
    return cursor + 1;
  }
  const quote = text[cursor];
  if (quote !== '"' && quote !== '\'') {
    return undefined;
  }
  cursor += 1;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === quote && !isEscaped(text, cursor)) {
      cursor += 1;
      while (cursor < text.length && isWhitespace(text[cursor]!)) {
        cursor += 1;
      }
      return text[cursor] === ')' ? cursor + 1 : undefined;
    }
    cursor += 1;
  }
  return undefined;
}

function parseInlineImageAt(text: string, start: number): ParsedInlineImage | undefined {
  if (text[start] !== '!' || text[start + 1] !== '[' || isEscaped(text, start)) {
    return undefined;
  }
  const label = parseBracketedText(text, start + 2, ']');
  if (!label || text[label.nextIndex] !== '(') {
    return undefined;
  }
  const destination = parseInlineDestination(text, label.nextIndex + 1);
  if (!destination) {
    return undefined;
  }
  const end = skipOptionalTitle(text, destination.nextIndex);
  if (end === undefined) {
    return undefined;
  }
  return {
    start,
    end,
    alt: unescapeMarkdown(label.value),
    url: destination.url,
  };
}

function processInlineText(
  text: string,
  assets: Asset[],
  assetSummaries: ParsedChatImageAssetSummary[],
  seenAssetKeys: Set<string>,
): ExtractedTextResult {
  const diagnostics: ProviderDiagnostic[] = [];
  let cursor = 0;
  let output = '';

  let finalText: string | undefined;
  let sanitizedRawText = '';
  const applyFinalText = () => {
    if (finalText !== undefined || sanitizedRawText.length > 0 || output.length === 0) {
      return;
    }
    const safeOutput = stripResidualDataImages(output);
    finalText = truncatedText(safeOutput);
    sanitizedRawText = finalText ?? '';
  };

  while (cursor < text.length) {
    const char = text[cursor]!;
    if (char === '\\' && cursor + 1 < text.length) {
      output += text.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }
    if (char === '`') {
      let runLength = 1;
      while (text[cursor + runLength] === '`') {
        runLength += 1;
      }
      const fence = '`'.repeat(runLength);
      const closeIndex = text.indexOf(fence, cursor + runLength);
      if (closeIndex < 0) {
        output += text.slice(cursor);
        cursor = text.length;
        continue;
      }
      output += text.slice(cursor, closeIndex + runLength);
      cursor = closeIndex + runLength;
      continue;
    }
    const parsedImage = parseInlineImageAt(text, cursor);
    if (!parsedImage) {
      output += char;
      cursor += 1;
      continue;
    }
    const result = tryMaterializeAsset({
      url: parsedImage.url,
      alt: parsedImage.alt,
      source: 'content',
      assets,
      assetSummaries,
      seenAssetKeys,
      diagnostics,
    });
    if (result.replacement !== undefined) {
      output += result.replacement;
    }
    cursor = parsedImage.end;
  }

  applyFinalText();
  return {
    ...(finalText !== undefined ? { text: finalText } : {}),
    sanitizedRawText,
    assets,
    diagnostics,
  };
}

function sanitizeContent(
  content: unknown,
  assets: Asset[],
  assetSummaries: ParsedChatImageAssetSummary[],
  seenAssetKeys: Set<string>,
): ChoiceProcessingResult {
  const diagnostics: ProviderDiagnostic[] = [];
  const textParts: string[] = [];
  if (typeof content === 'string') {
    const processed = processInlineText(content, assets, assetSummaries, seenAssetKeys);
    diagnostics.push(...processed.diagnostics);
    if (processed.text !== undefined) {
      textParts.push(processed.text);
    }
    return {
      textParts,
      sanitizedContent: processed.sanitizedRawText,
      assets,
      diagnostics,
    };
  }
  if (!Array.isArray(content)) {
    return {
      textParts,
      sanitizedContent: content,
      assets,
      diagnostics,
    };
  }

  const sanitizedContent = content.map((part) => {
    if (typeof part !== 'object' || part === null) {
      return part;
    }
    const text = (part as { readonly text?: unknown }).text;
    if (typeof text === 'string') {
      const processed = processInlineText(text, assets, assetSummaries, seenAssetKeys);
      diagnostics.push(...processed.diagnostics);
      if (processed.text !== undefined) {
        textParts.push(processed.text);
      }
      return {
        ...part,
        text: processed.sanitizedRawText,
      };
    }
    const imageUrl = (part as { readonly image_url?: { readonly url?: unknown } }).image_url?.url;
    if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
      return {
        ...part,
        image_url: {
          ...(part as { readonly image_url?: Record<string, unknown> }).image_url,
          url: INLINE_IMAGE_OMITTED,
        },
      };
    }
    return part;
  });

  return {
    textParts,
    sanitizedContent,
    assets,
    diagnostics,
  };
}

function sanitizeMessageImages(
  images: readonly ChatImageResponseImage[] | undefined,
  assets: Asset[],
  assetSummaries: ParsedChatImageAssetSummary[],
  seenAssetKeys: Set<string>,
): {
  readonly sanitizedImages: readonly ChatImageResponseImage[] | undefined;
  readonly diagnostics: readonly ProviderDiagnostic[];
} {
  if (!Array.isArray(images)) {
    return { sanitizedImages: images, diagnostics: [] };
  }
  const diagnostics: ProviderDiagnostic[] = [];
  const sanitizedImages = images.map((image) => {
    const url = image.image_url?.url;
    if (typeof url === 'string' && url.length > 0) {
      void tryMaterializeAsset({
        url,
        alt: '',
        source: 'message-images',
        assets,
        assetSummaries,
        seenAssetKeys,
        diagnostics,
      });
    }
    return {
      image_url: {
        ...(image.image_url ?? {}),
        ...(typeof url === 'string' ? { url: sanitizeImageUrl(url) } : {}),
      },
    };
  });
  return { sanitizedImages, diagnostics };
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
  const assetSummaries: ParsedChatImageAssetSummary[] = [];
  const seenAssetKeys = new Set<string>();
  const textParts: string[] = [];
  const diagnostics: ProviderDiagnostic[] = [];
  const sanitizedChoices = response.choices.map((choice) => {
    if (typeof choice !== 'object' || choice === null) {
      return choice;
    }
    const message = choice.message;
    if (typeof message !== 'object' || message === null) {
      return choice;
    }
    const {
      sanitizedImages,
      diagnostics: imageDiagnostics,
    } = sanitizeMessageImages(message.images, assets, assetSummaries, seenAssetKeys);
    diagnostics.push(...imageDiagnostics);
    const contentResult = sanitizeContent(message.content, assets, assetSummaries, seenAssetKeys);
    diagnostics.push(...contentResult.diagnostics);
    textParts.push(...contentResult.textParts);
    return {
      ...choice,
      message: {
        ...message,
        ...(sanitizedImages !== undefined ? { images: sanitizedImages } : {}),
        content: contentResult.sanitizedContent,
      },
    };
  });

  const text = truncatedText(textParts.join('\n\n'));
  if (assets.length === 0 && text === undefined) {
    throw mapInvalidResponseError('Chat image response did not contain image URLs or text content.', { raw });
  }

  const result: {
    assets: readonly Asset[];
    text?: string;
    raw: unknown;
    diagnostics?: readonly ProviderDiagnostic[];
    created?: number;
    usage?: ProviderInvokeUsage;
  } = {
    assets,
    raw: {
      ...response,
      choices: sanitizedChoices,
    },
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    ...(assetSummaries.length > 0 ? { assetSummaries } : {}),
  };

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
