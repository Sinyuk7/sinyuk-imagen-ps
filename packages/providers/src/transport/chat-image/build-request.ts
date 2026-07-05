import type { Asset } from '@imagen-ps/core-engine';
import type { CanonicalImageJobRequest, ChatImageRequestOutput, ProviderOutputOptions } from '../../contract/request.js';
import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import { assertProviderModelExecution } from '../../contract/image-model-capability.js';

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

export interface ChatImageRequestBuildResult {
  readonly body: ChatImageCompletionBody;
  readonly diagnostics: readonly ProviderDiagnostic[];
}

const RESERVED_PROVIDER_OPTION_KEYS: readonly string[] = [
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

const RESERVED_PROVIDER_OPTION_KEY_SET = new Set<string>(RESERVED_PROVIDER_OPTION_KEYS);
const ALLOWED_PASSTHROUGH_PROVIDER_OPTION_KEYS = new Set<string>(['user']);

function resolveModel(request: CanonicalImageJobRequest): string {
  return assertProviderModelExecution({
    execution: request.model,
    apiFormat: 'openai-chat-completions',
  }).modelId;
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

function resolveRequestOutput(output: ProviderOutputOptions): ChatImageRequestOutput {
  const requestOutput = output.requestOutput;
  if (requestOutput === undefined) {
    throw new BuildChatImageRequestError('Chat image output requires resolved requestOutput.', {
      expected: 'chat-image',
    });
  }
  if (requestOutput.kind !== 'chat-image') {
    throw new BuildChatImageRequestError(
      `Chat image output received incompatible requestOutput kind "${requestOutput.kind}".`,
      { expected: 'chat-image', actual: requestOutput.kind },
    );
  }
  return requestOutput;
}

function resolvedImageConfigFromOutput(
  output: ProviderOutputOptions | undefined,
): Record<string, unknown> | undefined {
  if (output === undefined) {
    return undefined;
  }

  const imageConfig = resolveRequestOutput(output).imageConfig;
  return imageConfig !== undefined && Object.keys(imageConfig).length > 0
    ? { ...imageConfig }
    : undefined;
}

function createIgnoredProviderOptionDiagnostic(
  key: string,
  reason: 'invalid-type' | 'not-allowlisted' | 'reserved',
  details?: Readonly<Record<string, unknown>>,
): ProviderDiagnostic {
  return {
    code: 'chat-image.request.provider-option-ignored',
    message: `Ignored chat-image provider option "${key}" because it is ${reason}.`,
    level: 'warning',
    details: {
      key,
      reason,
      ...(details ?? {}),
    },
  };
}

function pushDiagnostic(
  diagnostics: ProviderDiagnostic[],
  key: string,
  reason: 'invalid-type' | 'not-allowlisted' | 'reserved',
  details?: Readonly<Record<string, unknown>>,
): void {
  diagnostics.push(createIgnoredProviderOptionDiagnostic(key, reason, details));
}

function applyProviderOptions(
  body: Record<string, unknown>,
  providerOptions: Readonly<Record<string, unknown>> | undefined,
  diagnostics: ProviderDiagnostic[],
): void {
  if (!providerOptions) {
    return;
  }
  for (const [key, value] of Object.entries(providerOptions)) {
    if (value === undefined || key === 'model' || key === 'modalities' || key === 'image_config') {
      continue;
    }
    if (RESERVED_PROVIDER_OPTION_KEY_SET.has(key)) {
      pushDiagnostic(diagnostics, key, 'reserved');
      continue;
    }
    if (!ALLOWED_PASSTHROUGH_PROVIDER_OPTION_KEYS.has(key)) {
      pushDiagnostic(diagnostics, key, 'not-allowlisted');
      continue;
    }
    if (key === 'user') {
      if (typeof value === 'string') {
        body.user = value;
      } else {
        pushDiagnostic(diagnostics, key, 'invalid-type', { expectedType: 'string' });
      }
    }
  }
}

function resolveModalities(
  providerOptions: Readonly<Record<string, unknown>> | undefined,
  diagnostics: ProviderDiagnostic[],
): readonly string[] {
  if (providerOptions?.modalities !== undefined) {
    pushDiagnostic(diagnostics, 'modalities', 'reserved');
  }
  return ['image'];
}

function resolveImageConfig(
  request: CanonicalImageJobRequest,
  diagnostics: ProviderDiagnostic[],
): Record<string, unknown> | undefined {
  const fromOutput = resolvedImageConfigFromOutput(request.output);
  const raw = request.providerOptions?.image_config;
  if (raw !== undefined) {
    const ignoredPaths =
      typeof raw === 'object' && raw !== null && !Array.isArray(raw)
        ? Object.keys(raw as Record<string, unknown>).map((key) => `image_config.${key}`)
        : [];
    pushDiagnostic(diagnostics, 'image_config', 'reserved', { ignoredPaths });
  }
  return fromOutput;
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
): ChatImageCompletionBody {
  return buildChatImageRequest(request).body;
}

export function buildChatImageRequest(
  request: CanonicalImageJobRequest,
): ChatImageRequestBuildResult {
  const model = resolveModel(request);
  const diagnostics: ProviderDiagnostic[] = [];
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: buildMessageContent(request) }],
    modalities: resolveModalities(request.providerOptions, diagnostics),
  };

  if (request.output?.count !== undefined) {
    body.n = request.output.count;
  }

  const imageConfig = resolveImageConfig(request, diagnostics);
  if (imageConfig !== undefined) {
    body.image_config = imageConfig;
  }

  applyProviderOptions(body, request.providerOptions, diagnostics);

  return {
    body: body as ChatImageCompletionBody,
    diagnostics,
  };
}
