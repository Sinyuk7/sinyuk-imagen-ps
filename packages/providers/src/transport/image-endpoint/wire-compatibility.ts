import type { ImageEditCodec, ProviderDescriptor } from '../../contract/provider.js';
import type { CanonicalImageJobRequest } from '../../contract/request.js';
import type { ImageEndpointProviderConfig } from '../../providers/image-endpoint/config-schema.js';
import { assertProviderModelExecution } from '../../contract/image-model-capability.js';
import type { ImageEditRequestCodec } from './build-request.js';
import { resolveImageEditRequestCodecById } from './build-request.js';

export type ImageEditCodecResolutionSource = 'cache' | 'descriptor-default' | 'legacy-default';

export interface ImageEditCodecResolution {
  readonly codec: ImageEditRequestCodec;
  readonly source: ImageEditCodecResolutionSource;
  readonly cacheKey: string;
}

export interface AlternateImageEditCodecResolution {
  readonly codec: ImageEditRequestCodec;
  readonly source: 'descriptor-default' | 'legacy-default';
}

export interface ImageEditCompatibilityFingerprint {
  readonly providerId: string;
  readonly providerFamily: string;
  readonly operation: CanonicalImageJobRequest['operation'];
  readonly targetPath: string;
  readonly model: string;
  readonly connection: {
    readonly selectionMode: ImageEndpointProviderConfig['connection']['selectionMode'];
    readonly selectedEndpointId?: string;
    readonly endpoints: readonly {
      readonly id: string;
      readonly url: string;
      readonly enabled: boolean;
    }[];
    readonly extraHeaderNames: readonly string[];
    readonly extraHeadersFingerprint: string;
  };
  readonly requestShape: {
    readonly imageCountMode: 'single-image' | 'multi-image';
    readonly hasMask: boolean;
    readonly imageReferenceKinds: 'inline-data' | 'url' | 'fileId' | 'mixed' | 'missing';
    readonly maskReferenceKind: 'inline-data' | 'url' | 'fileId' | 'missing' | 'unknown';
  };
}

interface ImageEditCodecCacheEntry {
  readonly codec: ImageEditCodec;
  readonly createdAt: number;
  readonly expiresAt: number;
  lastUsedAt: number;
}

const IMAGE_EDIT_CODEC_CACHE_TTL_MS = 10 * 60 * 1000;
const IMAGE_EDIT_CODEC_CACHE_MAX_ENTRIES = 128;
const IMAGE_EDIT_CODEC_CACHE_ALGORITHM = 'fnv1a64';
const LEGACY_DEFAULT_EDIT_CODEC_ORDER: readonly ImageEditCodec[] = [
  'multipart-bracket',
  'json-reference',
  'multipart-plain',
];

const imageEditCodecCache = new Map<string, ImageEditCodecCacheEntry>();

function currentTime(): number {
  return Date.now();
}

function sortRecord(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortRecord(entry));
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortRecord((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(sortRecord(value));
}

function digestString(value: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return `${IMAGE_EDIT_CODEC_CACHE_ALGORITHM}:${hash.toString(16).padStart(16, '0')}`;
}

function hasInlineAssetData(asset: { readonly data?: unknown } | undefined): boolean {
  return (
    (typeof asset?.data === 'string' && asset.data.length > 0) ||
    (asset?.data instanceof Uint8Array && asset.data.byteLength > 0)
  );
}

type ImageAsset = NonNullable<CanonicalImageJobRequest['images']>[number];

function classifyAssetReferenceKind(
  asset: ImageAsset | CanonicalImageJobRequest['maskImage'],
): 'inline-data' | 'url' | 'fileId' | 'missing' | 'unknown' {
  if (asset === undefined) {
    return 'missing';
  }
  if (hasInlineAssetData(asset)) {
    return 'inline-data';
  }
  if (typeof asset.fileId === 'string' && asset.fileId.length > 0) {
    return 'fileId';
  }
  if (typeof asset.url === 'string' && asset.url.length > 0) {
    return 'url';
  }
  return 'unknown';
}

function summarizeImageReferenceKinds(
  images: CanonicalImageJobRequest['images'],
): 'inline-data' | 'url' | 'fileId' | 'mixed' | 'missing' {
  if (images === undefined || images.length === 0) {
    return 'missing';
  }
  const kinds = [...new Set(images.map((asset) => classifyAssetReferenceKind(asset)))];
  if (kinds.length !== 1) {
    return 'mixed';
  }
  return kinds[0] === 'unknown' ? 'mixed' : (kinds[0] as 'inline-data' | 'url' | 'fileId');
}

function resolveModel(request: CanonicalImageJobRequest): string {
  return assertProviderModelExecution({
    execution: request.model,
    apiFormat: 'openai-images',
  }).modelId;
}

function normalizeExtraHeaders(extraHeaders: ImageEndpointProviderConfig['extraHeaders']): {
  readonly extraHeaderNames: readonly string[];
  readonly extraHeadersFingerprint: string;
} {
  const canonicalPairs = Object.entries(extraHeaders ?? {})
    .map(([key, value]) => `${key.toLowerCase()}:${value}`)
    .sort();

  return {
    extraHeaderNames: [...new Set(canonicalPairs.map((pair) => pair.slice(0, pair.indexOf(':'))))],
    extraHeadersFingerprint: digestString(stableSerialize(canonicalPairs)),
  };
}

function evictExpiredEntries(now: number): void {
  for (const [key, entry] of imageEditCodecCache.entries()) {
    if (entry.expiresAt <= now) {
      imageEditCodecCache.delete(key);
    }
  }
}

function evictOverflowEntries(): void {
  while (imageEditCodecCache.size > IMAGE_EDIT_CODEC_CACHE_MAX_ENTRIES) {
    let oldestKey: string | undefined;
    let oldestLastUsedAt = Number.POSITIVE_INFINITY;
    for (const [key, entry] of imageEditCodecCache.entries()) {
      if (entry.lastUsedAt < oldestLastUsedAt) {
        oldestLastUsedAt = entry.lastUsedAt;
        oldestKey = key;
      }
    }
    if (oldestKey === undefined) {
      break;
    }
    imageEditCodecCache.delete(oldestKey);
  }
}

function readCachedCodec(cacheKey: string): ImageEditCodec | undefined {
  const now = currentTime();
  evictExpiredEntries(now);
  const entry = imageEditCodecCache.get(cacheKey);
  if (!entry) {
    return undefined;
  }
  entry.lastUsedAt = now;
  return entry.codec;
}

function normalizeCodecList(codecs: readonly ImageEditCodec[] | undefined): readonly ImageEditCodec[] {
  if (codecs === undefined) {
    return [];
  }
  return [...new Set(codecs)];
}

function codecCandidates(descriptor: ProviderDescriptor): {
  readonly supported: readonly ImageEditCodec[];
  readonly ordered: readonly ImageEditCodec[];
  readonly source: Extract<ImageEditCodecResolutionSource, 'descriptor-default' | 'legacy-default'>;
} {
  const supported = normalizeCodecList(descriptor.transport?.wire?.supportedEditCodecs);
  const declaredOrder = normalizeCodecList(descriptor.transport?.wire?.defaultEditCodecOrder);

  if (declaredOrder.length > 0) {
    const declaredSupported = supported.length > 0 ? supported : declaredOrder;
    return {
      supported: declaredSupported,
      ordered: declaredOrder.filter((codec) => declaredSupported.includes(codec)),
      source: 'descriptor-default',
    };
  }

  return {
    supported: supported.length > 0 ? supported : LEGACY_DEFAULT_EDIT_CODEC_ORDER,
    ordered: LEGACY_DEFAULT_EDIT_CODEC_ORDER.filter((codec) => supported.length === 0 || supported.includes(codec)),
    source: 'legacy-default',
  };
}

/** 判断 image-edit 请求是否能被指定 codec 安全编码。 */
export function isImageEditCodecCompatible(
  request: CanonicalImageJobRequest,
  codec: ImageEditCodec,
): boolean {
  if (request.operation !== 'image_edit' || request.images === undefined || request.images.length === 0) {
    return false;
  }

  if (codec === 'json-reference') {
    const imageCompatible = request.images.every((asset) => {
      const kind = classifyAssetReferenceKind(asset);
      return kind === 'inline-data' ? typeof asset.data === 'string' : kind === 'url' || kind === 'fileId';
    });
    if (!imageCompatible) {
      return false;
    }
    if (request.maskImage === undefined) {
      return true;
    }
    const maskKind = classifyAssetReferenceKind(request.maskImage);
    return maskKind === 'inline-data' ? typeof request.maskImage.data === 'string' : maskKind === 'url' || maskKind === 'fileId';
  }

  return request.images.every((asset) => hasInlineAssetData(asset));
}

/** 构造 image-edit 兼容性指纹。 */
export function createImageEditCompatibilityFingerprint(args: {
  readonly descriptor: ProviderDescriptor;
  readonly config: ImageEndpointProviderConfig;
  readonly request: CanonicalImageJobRequest;
  readonly targetPath: string;
}): ImageEditCompatibilityFingerprint {
  const { extraHeaderNames, extraHeadersFingerprint } = normalizeExtraHeaders(args.config.extraHeaders);
  return {
    providerId: args.config.providerId,
    providerFamily: args.descriptor.family,
    operation: args.request.operation,
    targetPath: args.targetPath,
    model: resolveModel(args.request),
    connection: {
      selectionMode: args.config.connection.selectionMode,
      ...(args.config.connection.selectedEndpointId ? { selectedEndpointId: args.config.connection.selectedEndpointId } : {}),
      endpoints: args.config.connection.endpoints.map((endpoint) => ({
        id: endpoint.id,
        url: endpoint.url,
        enabled: endpoint.enabled,
      })),
      extraHeaderNames,
      extraHeadersFingerprint,
    },
    requestShape: {
      imageCountMode: (args.request.images?.length ?? 0) > 1 ? 'multi-image' : 'single-image',
      hasMask: args.request.maskImage !== undefined,
      imageReferenceKinds: summarizeImageReferenceKinds(args.request.images),
      maskReferenceKind: classifyAssetReferenceKind(args.request.maskImage),
    },
  };
}

/** 稳定序列化 image-edit 兼容性指纹。 */
export function serializeImageEditCompatibilityFingerprint(
  fingerprint: ImageEditCompatibilityFingerprint,
): string {
  return stableSerialize(fingerprint);
}

/** 计算 image-edit 兼容性指纹 digest。 */
export function digestImageEditCompatibilityFingerprint(
  fingerprint: ImageEditCompatibilityFingerprint,
): string {
  return digestString(serializeImageEditCompatibilityFingerprint(fingerprint));
}

/** 记录成功解析的 image-edit codec。 */
export function rememberSuccessfulImageEditCodec(cacheKey: string, codec: ImageEditCodec): void {
  const now = currentTime();
  evictExpiredEntries(now);
  imageEditCodecCache.set(cacheKey, {
    codec,
    createdAt: now,
    lastUsedAt: now,
    expiresAt: now + IMAGE_EDIT_CODEC_CACHE_TTL_MS,
  });
  evictOverflowEntries();
}

/** 解析 image-edit 请求应使用的 codec。 */
export function resolveImageEditCodec(args: {
  readonly descriptor: ProviderDescriptor;
  readonly config: ImageEndpointProviderConfig;
  readonly request: CanonicalImageJobRequest;
  readonly targetPath: string;
}): ImageEditCodecResolution {
  const fingerprint = createImageEditCompatibilityFingerprint(args);
  const cacheKey = digestImageEditCompatibilityFingerprint(fingerprint);
  const cachedCodec = readCachedCodec(cacheKey);
  if (cachedCodec !== undefined && isImageEditCodecCompatible(args.request, cachedCodec)) {
    return {
      codec: resolveImageEditRequestCodecById(cachedCodec),
      source: 'cache',
      cacheKey,
    };
  }

  const candidates = codecCandidates(args.descriptor);
  const compatibleCodec = candidates.ordered.find((codec) => {
    if (!candidates.supported.includes(codec)) {
      return false;
    }
    return isImageEditCodecCompatible(args.request, codec);
  });

  return {
    codec: resolveImageEditRequestCodecById(compatibleCodec ?? 'json-reference'),
    source: candidates.source,
    cacheKey,
  };
}

/** 解析当前 request 在首发 codec 失败后的候选备用 codec。 */
export function resolveAlternateImageEditCodec(args: {
  readonly descriptor: ProviderDescriptor;
  readonly request: CanonicalImageJobRequest;
  readonly currentCodec: ImageEditCodec;
}): AlternateImageEditCodecResolution | undefined {
  const candidates = codecCandidates(args.descriptor);
  const alternate = candidates.ordered.find((codec) => {
    if (codec === args.currentCodec) {
      return false;
    }
    if (!candidates.supported.includes(codec)) {
      return false;
    }
    return isImageEditCodecCompatible(args.request, codec);
  });

  return alternate !== undefined
    ? { codec: resolveImageEditRequestCodecById(alternate), source: candidates.source }
    : undefined;
}

export function evictIfMatches(cacheKey: string, failedCodecId: ImageEditCodec): void {
  const current = imageEditCodecCache.get(cacheKey);
  if (current?.codec === failedCodecId) {
    imageEditCodecCache.delete(cacheKey);
  }
}

/** 测试辅助：清空 image-edit codec success cache。 */
export function resetImageEditCompatibilityCacheForTesting(): void {
  imageEditCodecCache.clear();
}

export const imageEditCompatibilityTesting = {
  cacheMaxEntries: IMAGE_EDIT_CODEC_CACHE_MAX_ENTRIES,
  cacheTtlMs: IMAGE_EDIT_CODEC_CACHE_TTL_MS,
};
