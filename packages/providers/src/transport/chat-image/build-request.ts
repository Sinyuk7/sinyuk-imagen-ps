import type { Asset } from '@imagen-ps/core-engine';
import type { CanonicalImageJobRequest, ProviderOutputOptions } from '../../contract/request.js';

export interface ChatImageContentText {
  readonly type: 'text';
  readonly text: string;
}

export interface ChatImageContentImageUrl {
  readonly type: 'image_url';
  readonly image_url: {
    readonly url: string;
  };
}

export interface ChatImageMessage {
  readonly role: 'user';
  readonly content: string | readonly (ChatImageContentText | ChatImageContentImageUrl)[];
}

export interface ChatImageCompletionBody {
  readonly model: string;
  readonly messages: readonly ChatImageMessage[];
  readonly modalities?: readonly string[];
  readonly image_config?: Record<string, unknown>;
  readonly n?: number;
  readonly user?: string;
  readonly [key: string]: unknown;
}

class BuildChatImageRequestError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BuildChatImageRequestError';
    if (details !== undefined) {
      this.details = details;
    }
  }
}

const SURFACED_HANDLED_KEYS: readonly string[] = [
  'model',
  'messages',
  'modalities',
  'image_config',
  'n',
  'size',
  'quality',
  'background',
  'output_format',
  'output_compression',
  'moderation',
  'input_fidelity',
];

function resolveModel(request: CanonicalImageJobRequest, defaultModel?: string): string {
  return typeof request.providerOptions?.model === 'string'
    ? (request.providerOptions.model as string)
    : (defaultModel ?? 'google/gemini-2.5-flash-image-preview');
}

function assetToImageUrl(asset: Asset): string {
  if (typeof asset.url === 'string' && asset.url.length > 0) {
    return asset.url;
  }
  if (typeof asset.data === 'string' && asset.data.length > 0) {
    const mimeType = asset.mimeType ?? 'image/png';
    return asset.data.startsWith('data:') ? asset.data : `data:${mimeType};base64,${asset.data}`;
  }
  if (asset.data instanceof Uint8Array && asset.data.byteLength > 0) {
    const mimeType = asset.mimeType ?? 'image/png';
    return `data:${mimeType};base64,${bytesToBase64(asset.data)}`;
  }
  throw new BuildChatImageRequestError('Chat image input asset requires url or base64 data.', {
    fileId: asset.fileId,
    name: asset.name,
  });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function inferSize(width: number | undefined, height: number | undefined): string | undefined {
  return width !== undefined && height !== undefined ? `${width}x${height}` : undefined;
}

function sizeFromPreset(preset: NonNullable<ProviderOutputOptions['sizePreset']>): '512' | '1K' | '2K' {
  return preset === '512' ? '512' : preset === '1k' ? '1K' : '2K';
}

function outputToImageConfig(output: ProviderOutputOptions | undefined): Record<string, unknown> | undefined {
  if (output === undefined) {
    return undefined;
  }

  const imageConfig: Record<string, unknown> = {};
  const size = output.sizePreset !== undefined ? sizeFromPreset(output.sizePreset) : inferSize(output.width, output.height);

  if (size !== undefined) {
    imageConfig.size = size;
  }
  if (output.aspectRatio !== undefined && output.aspectRatio !== 'auto') {
    imageConfig.aspect_ratio = output.aspectRatio;
  }
  if (output.quality !== undefined) {
    imageConfig.quality = output.quality;
  }
  if (output.background !== undefined) {
    imageConfig.background = output.background;
  }
  if (output.outputFormat !== undefined) {
    imageConfig.output_format = output.outputFormat;
  }
  if (output.outputCompression !== undefined) {
    imageConfig.output_compression = output.outputCompression;
  }
  if (output.moderation !== undefined) {
    imageConfig.moderation = output.moderation;
  }
  if (output.inputFidelity !== undefined) {
    imageConfig.input_fidelity = output.inputFidelity;
  }

  return Object.keys(imageConfig).length > 0 ? imageConfig : undefined;
}

function applyProviderOptions(
  body: Record<string, unknown>,
  providerOptions: Readonly<Record<string, unknown>> | undefined,
): void {
  if (!providerOptions) {
    return;
  }

  const handledKeys = new Set<string>(SURFACED_HANDLED_KEYS);
  for (const [key, value] of Object.entries(providerOptions)) {
    if (!handledKeys.has(key) && value !== undefined) {
      body[key] = value;
    }
  }
}

function resolveModalities(providerOptions: Readonly<Record<string, unknown>> | undefined): readonly string[] {
  const raw = providerOptions?.modalities;
  if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) {
    return raw;
  }
  return ['image'];
}

function resolveImageConfig(request: CanonicalImageJobRequest): Record<string, unknown> | undefined {
  const fromOutput = outputToImageConfig(request.output);
  const raw = request.providerOptions?.image_config;
  const fromOptions =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined;
  const merged = { ...(fromOutput ?? {}), ...(fromOptions ?? {}) };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildMessageContent(request: CanonicalImageJobRequest): ChatImageMessage['content'] {
  if (request.operation === 'text_to_image') {
    return request.prompt;
  }

  if (request.images === undefined || request.images.length === 0) {
    throw new BuildChatImageRequestError('Chat image edit request requires at least one input image.');
  }

  const content: (ChatImageContentText | ChatImageContentImageUrl)[] = [{ type: 'text', text: request.prompt }];

  for (const image of request.images) {
    content.push({ type: 'image_url', image_url: { url: assetToImageUrl(image) } });
  }

  if (request.maskImage !== undefined) {
    content.push({ type: 'text', text: 'Use the following image as the edit mask.' });
    content.push({ type: 'image_url', image_url: { url: assetToImageUrl(request.maskImage) } });
  }

  return content;
}

export function buildChatImageRequestBody(
  request: CanonicalImageJobRequest,
  defaultModel?: string,
): ChatImageCompletionBody {
  const body: Record<string, unknown> = {
    model: resolveModel(request, defaultModel),
    messages: [{ role: 'user', content: buildMessageContent(request) }],
    modalities: resolveModalities(request.providerOptions),
  };

  if (request.output?.count !== undefined) {
    body.n = request.output.count;
  }

  const imageConfig = resolveImageConfig(request);
  if (imageConfig !== undefined) {
    body.image_config = imageConfig;
  }

  applyProviderOptions(body, request.providerOptions);

  return body as ChatImageCompletionBody;
}
