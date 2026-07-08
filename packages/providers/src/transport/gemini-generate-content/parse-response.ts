import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import type { ProviderInvokeMetadata, ProviderInvokeUsage } from '../../contract/result.js';
import { mapInvalidResponseError } from '../image-endpoint/error-map.js';

const INLINE_IMAGE_OMITTED = '[image data omitted]';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46] as const;
const WEBP_WEBP = [0x57, 0x45, 0x42, 0x50] as const;

interface GeminiGenerateContentResponse {
  readonly candidates?: readonly GeminiCandidate[];
  readonly usageMetadata?: {
    readonly promptTokenCount?: number;
    readonly candidatesTokenCount?: number;
    readonly totalTokenCount?: number;
  };
  readonly usage_metadata?: {
    readonly prompt_token_count?: number;
    readonly candidates_token_count?: number;
    readonly total_token_count?: number;
  };
}

interface GeminiCandidate {
  readonly content?: {
    readonly parts?: readonly GeminiPart[];
  };
}

interface GeminiPart {
  readonly text?: unknown;
  readonly inlineData?: { readonly mimeType?: unknown; readonly data?: unknown };
  readonly inline_data?: { readonly mime_type?: unknown; readonly data?: unknown };
  readonly fileData?: { readonly mimeType?: unknown; readonly fileUri?: unknown };
  readonly file_data?: { readonly mime_type?: unknown; readonly file_uri?: unknown };
  readonly thought?: unknown;
  readonly thoughtSignature?: unknown;
  readonly thought_signature?: unknown;
}

interface ParsedCandidate {
  readonly candidateIndex: number;
  readonly textParts: readonly string[];
  readonly finalImages: readonly Asset[];
  readonly thoughtImages: readonly Asset[];
  readonly diagnostics: readonly ProviderDiagnostic[];
}

export interface ParsedGeminiGenerateContentResponse {
  readonly assets: readonly Asset[];
  readonly text?: string;
  readonly raw: unknown;
  readonly diagnostics?: readonly ProviderDiagnostic[];
  readonly metadata?: ProviderInvokeMetadata;
  readonly usage?: ProviderInvokeUsage;
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

function extensionFromMimeType(mimeType: string | undefined): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
      return 'png';
    default:
      return 'bin';
  }
}

function outputFormatFromMimeType(mimeType: string | undefined): ProviderInvokeMetadata['outputFormat'] | undefined {
  switch (mimeType?.toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpeg';
    case 'image/webp':
      return 'webp';
    case 'image/png':
      return 'png';
    default:
      return undefined;
  }
}

function decodeBase64(data: string): Uint8Array | undefined {
  try {
    const normalized = data.startsWith('data:') ? data.slice(data.indexOf(',') + 1) : data;
    const binary = atob(normalized.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return undefined;
  }
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

function readUint16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]! << 8) | bytes[offset + 1]!;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset]! * 0x1000000) + ((bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!)) >>> 0;
}

function readPngSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | undefined {
  if (bytes.byteLength < 24 || !bytesEqual(bytes, 0, PNG_SIGNATURE)) {
    return undefined;
  }
  return { width: readUint32(bytes, 16), height: readUint32(bytes, 20) };
}

function readJpegSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | undefined {
  let offset = 2;
  while (offset + 9 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      return undefined;
    }
    const marker = bytes[offset + 1]!;
    const length = readUint16(bytes, offset + 2);
    if (length < 2) {
      return undefined;
    }
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: readUint16(bytes, offset + 5), width: readUint16(bytes, offset + 7) };
    }
    offset += 2 + length;
  }
  return undefined;
}

function readWebpSize(bytes: Uint8Array): { readonly width: number; readonly height: number } | undefined {
  if (!bytesEqual(bytes, 0, WEBP_RIFF) || !bytesEqual(bytes, 8, WEBP_WEBP)) {
    return undefined;
  }
  if (bytes.byteLength >= 30 && String.fromCharCode(...bytes.slice(12, 16)) === 'VP8X') {
    return {
      width: 1 + bytes[24]! + (bytes[25]! << 8) + (bytes[26]! << 16),
      height: 1 + bytes[27]! + (bytes[28]! << 8) + (bytes[29]! << 16),
    };
  }
  return undefined;
}

function inspectAssetSize(asset: Asset): string | undefined {
  const mimeType = asset.mimeType?.toLowerCase();
  if (!mimeType) {
    return undefined;
  }
  const bytes = typeof asset.data === 'string'
    ? decodeBase64(asset.data)
    : asset.data instanceof Uint8Array
      ? asset.data
      : undefined;
  if (!bytes) {
    return undefined;
  }
  const size = mimeType.includes('png')
    ? readPngSize(bytes)
    : mimeType.includes('jpeg') || mimeType.includes('jpg')
      ? readJpegSize(bytes)
      : mimeType.includes('webp')
        ? readWebpSize(bytes)
        : undefined;
  return size ? `${size.width}x${size.height}` : undefined;
}

function inferMetadata(assets: readonly Asset[]): ProviderInvokeMetadata | undefined {
  const metadata: {
    outputFormat?: ProviderInvokeMetadata['outputFormat'];
    size?: string;
  } = {};
  for (const asset of assets) {
    if (metadata.outputFormat === undefined) {
      metadata.outputFormat = outputFormatFromMimeType(asset.mimeType);
    }
    if (metadata.size === undefined) {
      metadata.size = inspectAssetSize(asset);
    }
    if (metadata.outputFormat !== undefined && metadata.size !== undefined) {
      break;
    }
  }
  return Object.keys(metadata).length > 0 ? metadata : undefined;
}

function isThoughtPart(part: GeminiPart): boolean {
  return part.thought === true || typeof part.thoughtSignature === 'string' || typeof part.thought_signature === 'string';
}

function normalizeText(textParts: readonly string[]): string | undefined {
  const value = textParts.map((text) => text.trim()).filter((text) => text.length > 0).join('\n\n').trim();
  return value.length > 0 ? value : undefined;
}

function readInlineAsset(part: GeminiPart, index: number): { readonly asset?: Asset; readonly diagnostic?: ProviderDiagnostic } {
  const inlineData = part.inlineData ?? (
    part.inline_data
      ? {
          mimeType: part.inline_data.mime_type,
          data: part.inline_data.data,
        }
      : undefined
  );

  if (!inlineData) {
    return {};
  }

  if (typeof inlineData.mimeType !== 'string' || !inlineData.mimeType.startsWith('image/')) {
    return {
      diagnostic: createDiagnostic(
        'gemini-generate-content.response.image-part-invalid',
        'Ignored Gemini Generate Content inline image part without an image mime type.',
        { partIndex: index },
      ),
    };
  }
  if (typeof inlineData.data !== 'string' || inlineData.data.length === 0) {
    return {
      diagnostic: createDiagnostic(
        'gemini-generate-content.response.image-part-invalid',
        'Ignored Gemini Generate Content inline image part without base64 data.',
        { partIndex: index, mimeType: inlineData.mimeType },
      ),
    };
  }

  return {
    asset: {
      type: 'image',
      name: `generated-${index + 1}.${extensionFromMimeType(inlineData.mimeType)}`,
      mimeType: inlineData.mimeType,
      data: inlineData.data,
    },
  };
}

function readFileAsset(part: GeminiPart, index: number): { readonly asset?: Asset; readonly diagnostic?: ProviderDiagnostic } {
  const fileData = part.fileData ?? (
    part.file_data
      ? {
          mimeType: part.file_data.mime_type,
          fileUri: part.file_data.file_uri,
        }
      : undefined
  );

  if (!fileData) {
    return {};
  }
  if (typeof fileData.fileUri !== 'string' || fileData.fileUri.length === 0) {
    return {
      diagnostic: createDiagnostic(
        'gemini-generate-content.response.image-part-invalid',
        'Ignored Gemini Generate Content file image part without a URI.',
        { partIndex: index },
      ),
    };
  }

  return {
    asset: {
      type: 'image',
      name:
        typeof fileData.mimeType === 'string'
          ? `generated-${index + 1}.${extensionFromMimeType(fileData.mimeType)}`
          : `generated-${index + 1}`,
      ...(typeof fileData.mimeType === 'string' ? { mimeType: fileData.mimeType } : {}),
      url: fileData.fileUri,
    },
  };
}

function parseCandidate(candidate: GeminiCandidate, candidateIndex: number): ParsedCandidate {
  const diagnostics: ProviderDiagnostic[] = [];
  const textParts: string[] = [];
  const finalImages: Asset[] = [];
  const thoughtImages: Asset[] = [];
  const parts = candidate.content?.parts;

  if (!Array.isArray(parts)) {
    return {
      candidateIndex,
      textParts,
      finalImages,
      thoughtImages,
      diagnostics,
    };
  }

  for (let partIndex = 0; partIndex < parts.length; partIndex += 1) {
    const part = parts[partIndex]!;
    const thought = isThoughtPart(part);

    if (typeof part.text === 'string' && part.text.trim().length > 0) {
      if (thought) {
        diagnostics.push(createDiagnostic(
          'gemini-generate-content.response.thought-part-ignored',
          'Ignored Gemini Generate Content thought text part.',
          { candidateIndex, partIndex, kind: 'text' },
        ));
      } else {
        textParts.push(part.text);
      }
    }

    const inline = readInlineAsset(part, partIndex);
    const file = inline.asset === undefined && inline.diagnostic === undefined ? readFileAsset(part, partIndex) : {};
    const asset = inline.asset ?? file.asset;
    const diagnostic = inline.diagnostic ?? file.diagnostic;

    if (diagnostic) {
      diagnostics.push({ ...diagnostic, details: { candidateIndex, ...(diagnostic.details ?? {}) } });
    }
    if (asset) {
      if (thought) {
        thoughtImages.push(asset);
        diagnostics.push(createDiagnostic(
          'gemini-generate-content.response.thought-part-ignored',
          'Ignored Gemini Generate Content thought image part.',
          { candidateIndex, partIndex, kind: 'image' },
        ));
      } else {
        finalImages.push(asset);
      }
    }
  }

  return {
    candidateIndex,
    textParts,
    finalImages,
    thoughtImages,
    diagnostics,
  };
}

function candidateScore(candidate: ParsedCandidate): number {
  if (candidate.finalImages.length > 0) {
    return 3;
  }
  if (candidate.textParts.length > 0) {
    return 2;
  }
  if (candidate.thoughtImages.length > 0) {
    return 1;
  }
  return 0;
}

function parseUsage(raw: GeminiGenerateContentResponse): ProviderInvokeUsage | undefined {
  const usage = raw.usageMetadata ?? (
    raw.usage_metadata
      ? {
          promptTokenCount: raw.usage_metadata.prompt_token_count,
          candidatesTokenCount: raw.usage_metadata.candidates_token_count,
          totalTokenCount: raw.usage_metadata.total_token_count,
        }
      : undefined
  );
  if (!usage) {
    return undefined;
  }
  if (
    typeof usage.promptTokenCount !== 'number' ||
    typeof usage.candidatesTokenCount !== 'number' ||
    typeof usage.totalTokenCount !== 'number'
  ) {
    return undefined;
  }
  return {
    inputTokens: usage.promptTokenCount,
    outputTokens: usage.candidatesTokenCount,
    totalTokens: usage.totalTokenCount,
  };
}

function sanitizeRaw(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeRaw(entry));
  }
  if (typeof value !== 'object' || value === null) {
    return value;
  }

  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(record)) {
    if ((key === 'inlineData' || key === 'inline_data') && typeof entry === 'object' && entry !== null) {
      const inlineRecord = entry as Record<string, unknown>;
      next[key] = {
        ...inlineRecord,
        ...(typeof inlineRecord.data === 'string' ? { data: INLINE_IMAGE_OMITTED } : {}),
      };
      continue;
    }
    next[key] = sanitizeRaw(entry);
  }
  return next;
}

export function parseGeminiGenerateContentResponse(raw: unknown): ParsedGeminiGenerateContentResponse {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw mapInvalidResponseError('Gemini Generate Content response is not a JSON object.', { raw });
  }

  const response = raw as GeminiGenerateContentResponse;
  if (!Array.isArray(response.candidates)) {
    throw mapInvalidResponseError('Gemini Generate Content response missing "candidates" array.', { raw });
  }

  const parsedCandidates = response.candidates.map((candidate, index) => parseCandidate(candidate ?? {}, index));
  const selected = [...parsedCandidates].sort((a, b) => candidateScore(b) - candidateScore(a) || a.candidateIndex - b.candidateIndex)[0];
  const diagnostics = [...(selected?.diagnostics ?? [])];
  const assets = [...(selected?.finalImages ?? [])];

  if (selected && assets.length === 0 && selected.thoughtImages.length > 0) {
    assets.push(selected.thoughtImages[selected.thoughtImages.length - 1]!);
    diagnostics.push(createDiagnostic(
      'gemini-generate-content.response.thought-image-fallback',
      'Selected the last thought image because no final image parts were present.',
      {
        candidateIndex: selected.candidateIndex,
        thoughtImageCount: selected.thoughtImages.length,
      },
    ));
  }

  const text = normalizeText(selected?.textParts ?? []);
  if (assets.length === 0 && text === undefined) {
    throw mapInvalidResponseError('Gemini Generate Content response did not contain image or text output.', {
      raw,
    });
  }

  return {
    assets,
    ...(text !== undefined ? { text } : {}),
    raw: sanitizeRaw(raw),
    ...(diagnostics.length > 0 ? { diagnostics } : {}),
    ...(inferMetadata(assets) ? { metadata: inferMetadata(assets) } : {}),
    ...(parseUsage(response) ? { usage: parseUsage(response) } : {}),
  };
}
