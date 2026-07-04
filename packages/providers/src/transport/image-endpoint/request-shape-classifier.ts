import type { ImageEditCodec } from '../../contract/provider.js';
import type { ProviderInvokeError, RecoveryEvidence } from './error-map.js';

export interface RequestWireSignature {
  readonly bodyKind: 'multipart' | 'json';
  readonly contentTypeKind: 'multipart/form-data' | 'application/json';
  readonly imageFieldMode?: 'image' | 'image[]';
  readonly imageReferenceMode?: 'binary' | 'reference';
}

export interface ImageEditRequestShapeRejection {
  readonly eligible: boolean;
  readonly reason:
    | 'status_not_request_invalid'
    | 'status_not_supported'
    | 'accepted_work_detected'
    | 'deny_term_detected'
    | 'missing_allowlist_evidence'
    | 'allowlist_match'
    | 'http_415';
  readonly statusCode?: number;
  readonly matchedAllowTerms: readonly string[];
  readonly matchedDenyTerms: readonly string[];
  readonly acceptedWorkSignals: readonly string[];
}

const SHAPE_ALLOW_TERMS = [
  'multipart',
  'form-data',
  'content-type',
  'media type',
  'unsupported media',
  'boundary',
  'image[]',
  'image field',
  'file field',
  'expected file',
  'expected io.reader',
] as const;

const SHAPE_DENY_TERMS = [
  'prompt',
  'model',
  'size',
  'quality',
  'quota',
  'billing',
  'auth',
  'token',
  'permission',
] as const;

const REQUEST_WIRE_SIGNATURES: Record<ImageEditCodec, RequestWireSignature> = {
  'multipart-bracket': {
    bodyKind: 'multipart',
    contentTypeKind: 'multipart/form-data',
    imageFieldMode: 'image[]',
    imageReferenceMode: 'binary',
  },
  'multipart-plain': {
    bodyKind: 'multipart',
    contentTypeKind: 'multipart/form-data',
    imageFieldMode: 'image',
    imageReferenceMode: 'binary',
  },
  'json-reference': {
    bodyKind: 'json',
    contentTypeKind: 'application/json',
    imageReferenceMode: 'reference',
  },
};

const EXACT_BODY_PATTERN_RULES = [
  {
    ruleId: 'image-field-multipart-bracket',
    pattern: /expected file field image\[\] in multipart\/form-data body/i,
    implicatedDimension: 'image_field' as const,
  },
  {
    ruleId: 'expected-io-reader',
    pattern: /expected io\.reader/i,
    implicatedDimension: 'body_kind' as const,
  },
] as const;

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

function collectTextEvidence(error: ProviderInvokeError): string {
  const responseBody = error.details?.responseBody;
  return normalizeText([
    error.message,
    typeof responseBody === 'string' ? responseBody : safeJsonStringify(responseBody),
  ].filter((part): part is string => typeof part === 'string' && part.length > 0).join(' '));
}

function containsTerm(text: string, term: string): boolean {
  return text.includes(normalizeText(term));
}

function collectMatchedTerms(text: string, terms: readonly string[]): readonly string[] {
  return terms.filter((term) => containsTerm(text, term));
}

function findExactBodyPatternRule(text: string): {
  readonly ruleId: string;
  readonly implicatedDimension: 'body_kind' | 'content_type' | 'image_field' | 'image_reference';
} | null {
  for (const rule of EXACT_BODY_PATTERN_RULES) {
    if (rule.pattern.test(text)) {
      return rule;
    }
  }
  return null;
}

function collectAcceptedWorkSignals(value: unknown, path = ''): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (Array.isArray(value)) {
    const signals = value.flatMap((entry, index) => collectAcceptedWorkSignals(entry, `${path}[${index}]`));
    if ((path === 'data' || path.endsWith('.data')) && value.length > 0) {
      signals.push(`${path || 'data'}:non-empty-data`);
    }
    return signals;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const signals: string[] = [];
    for (const [key, entry] of Object.entries(record)) {
      const normalizedKey = key.toLowerCase();
      const nextPath = path.length > 0 ? `${path}.${key}` : key;
      if (normalizedKey === 'task_id' || normalizedKey === 'generation_id' || normalizedKey === 'job_id') {
        signals.push(nextPath);
      }
      signals.push(...collectAcceptedWorkSignals(entry, nextPath));
    }
    return signals;
  }

  if (typeof value === 'string') {
    const normalized = normalizeText(value);
    if (normalized === 'queued' || normalized === 'processing' || normalized === 'running') {
      return [path.length > 0 ? `${path}:${normalized}` : normalized];
    }
  }

  return [];
}

function signatureChangesRejectedDimension(args: {
  readonly currentSignature: RequestWireSignature;
  readonly alternateSignature: RequestWireSignature;
  readonly implicatedDimension: 'body_kind' | 'content_type' | 'image_field' | 'image_reference' | 'unknown';
}): boolean {
  const { currentSignature, alternateSignature, implicatedDimension } = args;
  if (implicatedDimension === 'body_kind') {
    return currentSignature.bodyKind !== alternateSignature.bodyKind;
  }
  if (implicatedDimension === 'content_type') {
    return currentSignature.contentTypeKind !== alternateSignature.contentTypeKind;
  }
  if (implicatedDimension === 'image_field') {
    return currentSignature.imageFieldMode !== alternateSignature.imageFieldMode;
  }
  if (implicatedDimension === 'image_reference') {
    return currentSignature.imageReferenceMode !== alternateSignature.imageReferenceMode;
  }
  return (
    currentSignature.bodyKind !== alternateSignature.bodyKind ||
    currentSignature.contentTypeKind !== alternateSignature.contentTypeKind ||
    currentSignature.imageFieldMode !== alternateSignature.imageFieldMode ||
    currentSignature.imageReferenceMode !== alternateSignature.imageReferenceMode
  );
}

function evidenceWithRule(
  evidence: readonly RecoveryEvidence[] | undefined,
  ruleId: string,
): boolean {
  return evidence?.some((entry) => entry.source === 'body_pattern' && entry.ruleId === ruleId) ?? false;
}

export function requestWireSignatureForCodec(codec: ImageEditCodec): RequestWireSignature {
  return REQUEST_WIRE_SIGNATURES[codec];
}

/** 判断 `request_invalid` 是否是安全的 request-shape 拒绝。 */
export function classifyImageEditRequestShapeRejection(
  error: unknown,
  options?: {
    readonly currentCodec?: ImageEditCodec;
    readonly alternateCodec?: ImageEditCodec;
  },
): ImageEditRequestShapeRejection {
  if (
    typeof error !== 'object' ||
    error === null ||
    (error as { kind?: unknown }).kind !== 'request_invalid'
  ) {
    return {
      eligible: false,
      reason: 'status_not_request_invalid',
      matchedAllowTerms: [],
      matchedDenyTerms: [],
      acceptedWorkSignals: [],
    };
  }

  const providerError = error as ProviderInvokeError;
  const statusCode = providerError.statusCode;
  if (statusCode !== 400 && statusCode !== 415 && statusCode !== 422) {
    return {
      eligible: false,
      reason: 'status_not_supported',
      statusCode,
      matchedAllowTerms: [],
      matchedDenyTerms: [],
      acceptedWorkSignals: [],
    };
  }

  const acceptedWorkSignals = collectAcceptedWorkSignals(providerError.details?.responseBody);
  if (acceptedWorkSignals.length > 0) {
    return {
      eligible: false,
      reason: 'accepted_work_detected',
      statusCode,
      matchedAllowTerms: [],
      matchedDenyTerms: [],
      acceptedWorkSignals,
    };
  }

  const textEvidence = collectTextEvidence(providerError);
  const exactRule = findExactBodyPatternRule(textEvidence);
  const matchedDenyTerms = collectMatchedTerms(textEvidence, SHAPE_DENY_TERMS);
  if (matchedDenyTerms.length > 0) {
    return {
      eligible: false,
      reason: 'deny_term_detected',
      statusCode,
      matchedAllowTerms: [],
      matchedDenyTerms,
      acceptedWorkSignals,
    };
  }

  const currentSignature = options?.currentCodec ? requestWireSignatureForCodec(options.currentCodec) : undefined;
  const alternateSignature = options?.alternateCodec ? requestWireSignatureForCodec(options.alternateCodec) : undefined;
  const recovery = providerError.recovery;

  if (statusCode === 415) {
    const implicatedDimension = recovery?.wireRejection?.implicatedDimension ?? 'unknown';
    const eligible = currentSignature !== undefined &&
      alternateSignature !== undefined &&
      signatureChangesRejectedDimension({
        currentSignature,
        alternateSignature,
        implicatedDimension,
      });
    return {
      eligible,
      reason: 'http_415',
      statusCode,
      matchedAllowTerms: [],
      matchedDenyTerms,
      acceptedWorkSignals,
    };
  }

  const matchedAllowTerms = collectMatchedTerms(textEvidence, SHAPE_ALLOW_TERMS);
  if (
    exactRule === null ||
    currentSignature === undefined ||
    alternateSignature === undefined ||
    !signatureChangesRejectedDimension({
      currentSignature,
      alternateSignature,
      implicatedDimension: exactRule.implicatedDimension,
    }) ||
    (
      !evidenceWithRule(recovery?.evidence, exactRule.ruleId) &&
      !matchedAllowTerms.some((term) => containsTerm(textEvidence, term))
    )
  ) {
    return {
      eligible: false,
      reason: 'missing_allowlist_evidence',
      statusCode,
      matchedAllowTerms,
      matchedDenyTerms,
      acceptedWorkSignals,
    };
  }

  return {
    eligible: true,
    reason: 'allowlist_match',
    statusCode,
    matchedAllowTerms,
    matchedDenyTerms,
    acceptedWorkSignals,
  };
}
