import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderDiagnostic } from '../../contract/diagnostics.js';
import type { CanonicalImageJobRequest, GeminiGenerateContentRequestOutput, ProviderOutputOptions } from '../../contract/request.js';
import {
  assertProviderModelExecution,
  resolveProviderResolvedOutput,
} from '../../contract/image-model-capability.js';

/** Gemini Generate Content provider-local 输出 revision。 */
export type GeminiGenerateContentWireRevision = 'image-config';

export interface GeminiGenerateContentInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface GeminiGenerateContentFileDataPart {
  fileData: {
    mimeType?: string;
    fileUri: string;
  };
}

export interface GeminiGenerateContentTextPart {
  text: string;
}

export type GeminiGenerateContentPart =
  | GeminiGenerateContentInlineDataPart
  | GeminiGenerateContentFileDataPart
  | GeminiGenerateContentTextPart;

export interface GeminiGenerateContentRequestBody {
  contents: readonly {
    role: 'user';
    parts: readonly GeminiGenerateContentPart[];
  }[];
  generationConfig: {
    responseModalities: readonly ('TEXT' | 'IMAGE')[];
    candidateCount?: number;
    imageConfig?: {
      aspectRatio?: string;
      imageSize?: '512' | '1K' | '2K' | '4K';
    };
  };
}

export interface GeminiGenerateContentBuiltRequest {
  readonly model: string;
  readonly path: string;
  readonly body: GeminiGenerateContentRequestBody;
  readonly diagnostics: readonly ProviderDiagnostic[];
  readonly wireRevision: GeminiGenerateContentWireRevision;
}

class BuildGeminiGenerateContentRequestError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BuildGeminiGenerateContentRequestError';
    if (details !== undefined) {
      this.details = details;
    }
  }
}

const DEFAULT_WIRE_REVISION: GeminiGenerateContentWireRevision = 'image-config';
const MAX_REFERENCE_IMAGES = 14;
const ALLOWED_PROVIDER_OPTION_KEYS = new Set(['model']);

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function normalizeBase64Data(data: string): { readonly mimeType?: string; readonly payload: string } {
  if (!data.startsWith('data:')) {
    return { payload: data };
  }
  const marker = ';base64,';
  const markerIndex = data.indexOf(marker);
  if (markerIndex < 0) {
    throw new BuildGeminiGenerateContentRequestError('Gemini inline image data URLs must use base64 encoding.');
  }
  const mimeType = data.slice(5, markerIndex);
  return {
    mimeType,
    payload: data.slice(markerIndex + marker.length),
  };
}

function normalizeGeminiFileUri(asset: Asset): string | undefined {
  if (typeof asset.url === 'string' && asset.url.length > 0) {
    return asset.url;
  }
  if (
    asset.storedRef !== undefined &&
    (asset.storedRef.kind === 'url' || asset.storedRef.kind === 'externalToken') &&
    asset.storedRef.ref.length > 0
  ) {
    return asset.storedRef.ref;
  }
  return undefined;
}

function assetToGeminiPart(asset: Asset): GeminiGenerateContentInlineDataPart | GeminiGenerateContentFileDataPart {
  if (typeof asset.data === 'string' && asset.data.length > 0) {
    const normalized = normalizeBase64Data(asset.data);
    return {
      inlineData: {
        mimeType: normalized.mimeType ?? asset.mimeType ?? 'image/png',
        data: normalized.payload,
      },
    };
  }
  if (asset.data instanceof Uint8Array && asset.data.byteLength > 0) {
    return {
      inlineData: {
        mimeType: asset.mimeType ?? 'image/png',
        data: bytesToBase64(asset.data),
      },
    };
  }

  const fileUri = normalizeGeminiFileUri(asset);
  if (fileUri !== undefined) {
    return {
      fileData: {
        fileUri,
        ...(asset.storedRef?.mimeType ?? asset.mimeType ? { mimeType: asset.storedRef?.mimeType ?? asset.mimeType } : {}),
      },
    };
  }

  if (typeof asset.fileId === 'string' && asset.fileId.length > 0) {
    throw new BuildGeminiGenerateContentRequestError(
      'Gemini Generate Content does not support OpenAI-style fileId image references.',
      { fileId: asset.fileId },
    );
  }

  throw new BuildGeminiGenerateContentRequestError(
    'Gemini Generate Content image parts require inline data or a URI-style reference.',
    {
      name: asset.name,
      storedRefKind: asset.storedRef?.kind,
    },
  );
}

function normalizeGeminiModelId(modelId: string): string {
  return modelId.trim().replace(/^models\//, '');
}

export function normalizeGeminiGenerateContentModelId(modelId: string): string {
  return normalizeGeminiModelId(modelId);
}

function resolveModel(request: CanonicalImageJobRequest): string {
  return normalizeGeminiModelId(assertProviderModelExecution({
    execution: request.model,
    apiFormat: 'gemini-generate-content',
  }).modelId);
}

function resolveWireRevision(request: CanonicalImageJobRequest): GeminiGenerateContentWireRevision {
  if (request.model === undefined) {
    return DEFAULT_WIRE_REVISION;
  }
  assertProviderModelExecution({
    execution: request.model,
    apiFormat: 'gemini-generate-content',
  });
  return 'image-config';
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

function pushIgnoredProviderOptionDiagnostic(diagnostics: ProviderDiagnostic[], key: string): void {
  diagnostics.push(createDiagnostic(
    'gemini-generate-content.request.provider-option-ignored',
    `Ignored Gemini Generate Content provider option "${key}".`,
    { key, reason: 'not-allowlisted' },
  ));
}

function pushIgnoredOutputOptionDiagnostic(
  diagnostics: ProviderDiagnostic[],
  key: string,
  details?: Readonly<Record<string, unknown>>,
): void {
  diagnostics.push(createDiagnostic(
    'gemini-generate-content.request.output-option-ignored',
    `Ignored unsupported Gemini Generate Content output option "${key}".`,
    { key, ...(details ?? {}) },
  ));
}

function applyProviderOptions(
  providerOptions: Readonly<Record<string, unknown>> | undefined,
  diagnostics: ProviderDiagnostic[],
): void {
  if (!providerOptions) {
    return;
  }

  for (const [key, value] of Object.entries(providerOptions)) {
    if (value === undefined || ALLOWED_PROVIDER_OPTION_KEYS.has(key)) {
      continue;
    }
    pushIgnoredProviderOptionDiagnostic(diagnostics, key);
  }
}

function applyUnsupportedOutputDiagnostics(
  output: ProviderOutputOptions | undefined,
  diagnostics: ProviderDiagnostic[],
): void {
  if (output === undefined) {
    return;
  }

  if (output.width !== undefined) {
    pushIgnoredOutputOptionDiagnostic(diagnostics, 'width');
  }
  if (output.height !== undefined) {
    pushIgnoredOutputOptionDiagnostic(diagnostics, 'height');
  }
  if (output.background !== undefined) {
    pushIgnoredOutputOptionDiagnostic(diagnostics, 'background');
  }
  if (output.quality !== undefined) {
    pushIgnoredOutputOptionDiagnostic(diagnostics, 'quality');
  }
  if (output.outputCompression !== undefined) {
    pushIgnoredOutputOptionDiagnostic(diagnostics, 'outputCompression');
  }
  if (output.moderation !== undefined) {
    pushIgnoredOutputOptionDiagnostic(diagnostics, 'moderation');
  }
  if (output.inputFidelity !== undefined) {
    pushIgnoredOutputOptionDiagnostic(diagnostics, 'inputFidelity');
  }
  if (output.outputFormat !== undefined && output.outputFormat !== 'jpeg') {
    pushIgnoredOutputOptionDiagnostic(diagnostics, 'outputFormat', {
      requested: output.outputFormat,
      supported: ['jpeg'],
    });
  }
}

function copyResolvedRecord(value: Readonly<Record<string, unknown>> | undefined): Record<string, unknown> {
  return value === undefined ? {} : { ...value };
}

function resolveRequestOutput(request: CanonicalImageJobRequest, output: ProviderOutputOptions | undefined): GeminiGenerateContentRequestOutput | undefined {
  if (output === undefined) {
    return undefined;
  }
  const capabilityModelId = request.capabilityModelId ?? resolveModel(request);
  const resolvedOutput = resolveProviderResolvedOutput({
    providerId: 'gemini-generate-content',
    capabilityModelId,
    operation: request.operation,
    output,
    inputContext: request.inputContext,
  });
  if (resolvedOutput.kind !== 'gemini-generate-content') {
    throw new BuildGeminiGenerateContentRequestError(
      `Gemini Generate Content output received incompatible resolved output kind "${resolvedOutput.kind}".`,
      { expected: 'gemini-generate-content', actual: resolvedOutput.kind },
    );
  }
  return resolvedOutput;
}

function buildGenerationConfig(args: {
  readonly request: CanonicalImageJobRequest;
  readonly wireRevision: GeminiGenerateContentWireRevision;
  readonly diagnostics: ProviderDiagnostic[];
}): GeminiGenerateContentRequestBody['generationConfig'] {
  const { request, diagnostics } = args;
  const output = request.output;
  applyUnsupportedOutputDiagnostics(output, diagnostics);

  const generationConfig: GeminiGenerateContentRequestBody['generationConfig'] = {
    responseModalities: ['TEXT', 'IMAGE'],
  };

  if (output?.count !== undefined) {
    generationConfig.candidateCount = output.count;
  }

  const resolvedOutput = resolveRequestOutput(request, output);
  const imageConfig = copyResolvedRecord(resolvedOutput?.imageConfig) as NonNullable<GeminiGenerateContentRequestBody['generationConfig']['imageConfig']>;
  generationConfig.imageConfig = imageConfig;

  return generationConfig;
}

function buildParts(request: CanonicalImageJobRequest): readonly GeminiGenerateContentPart[] {
  if (request.operation === 'text_to_image') {
    return [{ text: request.prompt }];
  }

  if (request.images === undefined || request.images.length === 0) {
    throw new BuildGeminiGenerateContentRequestError('Gemini Generate Content edit requests require at least one input image.');
  }
  if (request.images.length > MAX_REFERENCE_IMAGES) {
    throw new BuildGeminiGenerateContentRequestError(
      `Gemini Generate Content edit requests support at most ${MAX_REFERENCE_IMAGES} input images.`,
      { imageCount: request.images.length },
    );
  }
  if (request.maskImage !== undefined) {
    throw new BuildGeminiGenerateContentRequestError(
      'Gemini Generate Content does not expose a separate mask image wire field in this implementation.',
    );
  }

  return [
    ...request.images.map((asset) => assetToGeminiPart(asset)),
    { text: request.prompt },
  ];
}

export function buildGeminiGenerateContentRequest(args: {
  readonly request: CanonicalImageJobRequest;
}): GeminiGenerateContentBuiltRequest {
  const diagnostics: ProviderDiagnostic[] = [];
  applyProviderOptions(args.request.providerOptions, diagnostics);
  const model = resolveModel(args.request);
  const wireRevision = resolveWireRevision(args.request);
  const body: GeminiGenerateContentRequestBody = {
    contents: [
      {
        role: 'user',
        parts: buildParts(args.request),
      },
    ],
    generationConfig: buildGenerationConfig({
      request: args.request,
      wireRevision,
      diagnostics,
    }),
  };

  return {
    model,
    path: `/models/${encodeURIComponent(model)}:generateContent`,
    body,
    diagnostics,
    wireRevision,
  };
}
