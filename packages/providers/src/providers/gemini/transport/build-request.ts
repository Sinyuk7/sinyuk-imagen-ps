import type { Asset } from '@imagen-ps/core-engine';
import type { ProviderDiagnostic } from '../../../contract/diagnostics.js';
import type { CanonicalImageJobRequest, GoogleGeminiRequestOutput, ProviderOutputOptions } from '../../../contract/request.js';
import { assertProviderModelExecution } from '../../../contract/provider-execution.js';
import { resolveCatalogProviderOutput } from '../../../catalog/output-resolution.js';
import { getProviderCatalogRoute } from '../../../catalog.js';

/** Gemini Generate Content provider-local 输出 revision。 */
export type GoogleGeminiWireRevision = 'image-config';

export interface GoogleGeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

export interface GoogleGeminiFileDataPart {
  fileData: {
    mimeType?: string;
    fileUri: string;
  };
}

export interface GoogleGeminiTextPart {
  text: string;
}

export type GoogleGeminiPart =
  | GoogleGeminiInlineDataPart
  | GoogleGeminiFileDataPart
  | GoogleGeminiTextPart;

export interface GoogleGeminiRequestBody {
  contents: readonly {
    role: 'user';
    parts: readonly GoogleGeminiPart[];
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

export interface GoogleGeminiBuiltRequest {
  readonly model: string;
  readonly path: string;
  readonly body: GoogleGeminiRequestBody;
  readonly diagnostics: readonly ProviderDiagnostic[];
  readonly wireRevision: GoogleGeminiWireRevision;
}

class BuildGoogleGeminiRequestError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'BuildGoogleGeminiRequestError';
    if (details !== undefined) {
      this.details = details;
    }
  }
}

const DEFAULT_WIRE_REVISION: GoogleGeminiWireRevision = 'image-config';
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
    throw new BuildGoogleGeminiRequestError('Gemini inline image data URLs must use base64 encoding.');
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

function assetToGeminiPart(asset: Asset): GoogleGeminiInlineDataPart | GoogleGeminiFileDataPart {
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
    throw new BuildGoogleGeminiRequestError(
      'Gemini Generate Content does not support OpenAI-style fileId image references.',
      { fileId: asset.fileId },
    );
  }

  throw new BuildGoogleGeminiRequestError(
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

export function normalizeGoogleGeminiModelId(modelId: string): string {
  return normalizeGeminiModelId(modelId);
}

function resolveModel(request: CanonicalImageJobRequest): string {
  return normalizeGeminiModelId(assertProviderModelExecution({
    execution: request.model,
    providerId: 'google-gemini',
  }).modelId);
}

function resolveWireRevision(request: CanonicalImageJobRequest): GoogleGeminiWireRevision {
  if (request.model === undefined) {
    return DEFAULT_WIRE_REVISION;
  }
  assertProviderModelExecution({
    execution: request.model,
    providerId: 'google-gemini',
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
    'google-gemini.request.provider-option-ignored',
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
    'google-gemini.request.output-option-ignored',
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

function resolveRequestOutput(request: CanonicalImageJobRequest, output: ProviderOutputOptions | undefined): GoogleGeminiRequestOutput | undefined {
  if (output === undefined) {
    return undefined;
  }
  const capabilityModelId = request.capabilityModelId ?? resolveModel(request);
  const resolvedOutput = resolveCatalogProviderOutput({
    providerId: 'google-gemini',
    modelId: capabilityModelId,
    operation: request.operation,
    output,
    inputContext: request.inputContext,
  });
  if (resolvedOutput.kind !== 'google-gemini') {
    throw new BuildGoogleGeminiRequestError(
      `Gemini Generate Content output received incompatible resolved output kind "${resolvedOutput.kind}".`,
      { expected: 'google-gemini', actual: resolvedOutput.kind },
    );
  }
  return resolvedOutput;
}

function buildGenerationConfig(args: {
  readonly request: CanonicalImageJobRequest;
  readonly wireRevision: GoogleGeminiWireRevision;
  readonly diagnostics: ProviderDiagnostic[];
}): GoogleGeminiRequestBody['generationConfig'] {
  const { request, diagnostics } = args;
  const output = request.output;
  applyUnsupportedOutputDiagnostics(output, diagnostics);

  const generationConfig: GoogleGeminiRequestBody['generationConfig'] = {
    responseModalities: ['TEXT', 'IMAGE'],
  };

  if (output?.count !== undefined) {
    generationConfig.candidateCount = output.count;
  }

  const resolvedOutput = resolveRequestOutput(request, output);
  const imageConfig = copyResolvedRecord(resolvedOutput?.imageConfig) as NonNullable<GoogleGeminiRequestBody['generationConfig']['imageConfig']>;
  generationConfig.imageConfig = imageConfig;

  return generationConfig;
}

function buildParts(request: CanonicalImageJobRequest): readonly GoogleGeminiPart[] {
  if (request.operation === 'text_to_image') {
    return [{ text: request.prompt }];
  }

  if (request.images === undefined || request.images.length === 0) {
    throw new BuildGoogleGeminiRequestError('Gemini Generate Content edit requests require at least one input image.');
  }
  if (request.images.length > MAX_REFERENCE_IMAGES) {
    throw new BuildGoogleGeminiRequestError(
      `Gemini Generate Content edit requests support at most ${MAX_REFERENCE_IMAGES} input images.`,
      { imageCount: request.images.length },
    );
  }
  return [
    ...request.images.map((asset) => assetToGeminiPart(asset)),
    { text: request.prompt },
  ];
}

export function buildGoogleGeminiRequest(args: {
  readonly request: CanonicalImageJobRequest;
}): GoogleGeminiBuiltRequest {
  const diagnostics: ProviderDiagnostic[] = [];
  if (args.request.maskImage !== undefined) {
    diagnostics.push(createDiagnostic(
      'google-gemini.request.mask-omitted',
      'Omitted canonical Mask because Gemini Generate Content has no separate raster mask field.',
      { reason: 'transport-has-no-separate-raster-mask-field' },
    ));
  }
  applyProviderOptions(args.request.providerOptions, diagnostics);
  const model = resolveModel(args.request);
  const wireRevision = resolveWireRevision(args.request);
  const body: GoogleGeminiRequestBody = {
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

  const catalogPath = getProviderCatalogRoute('google-gemini', model, args.request.operation);
  return {
    model,
    path: (catalogPath ?? '/v1beta/models/{model}:generateContent').replace('{model}', encodeURIComponent(model)),
    body,
    diagnostics,
    wireRevision,
  };
}
