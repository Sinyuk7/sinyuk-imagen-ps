import type { Asset, StoredAssetRef, TaskResourceRef } from '@imagen-ps/application';

interface AssetToArrayBufferOptions {
  readonly resolveStoredRef?: (ref: StoredAssetRef) => Promise<ArrayBuffer | undefined>;
  readonly fetchImpl?: typeof fetch;
}

function arrayBufferFromDataUrl(dataUrl: string): { readonly data: ArrayBuffer; readonly mimeType: string } {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  const base64 = match ? match[2] : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return {
    data: bytes.buffer,
    mimeType: match?.[1] ?? 'image/png',
  };
}

function hasKnownExtension(name: string): boolean {
  return /\.[a-z0-9]+$/i.test(name);
}

export function fileExtensionForMimeType(mimeType: string): string {
  const normalized = mimeType.toLowerCase();
  if (normalized.includes('jpeg') || normalized.includes('jpg')) {
    return 'jpg';
  }
  if (normalized.includes('webp')) {
    return 'webp';
  }
  if (normalized.includes('svg')) {
    return 'svg';
  }
  return 'png';
}

export function suggestedAssetFileName(
  asset: Pick<Asset, 'name' | 'mimeType'>,
  fallbackBase = 'imagen-result',
): string {
  const raw = asset.name?.trim() || fallbackBase;
  if (hasKnownExtension(raw)) {
    return raw;
  }
  return `${raw}.${fileExtensionForMimeType(asset.mimeType ?? 'image/png')}`;
}

function sanitizedFileNameSegment(value: string, fallback: string): string {
  const normalized = value
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.\-_ ]+|[.\-_ ]+$/g, '');
  return normalized || fallback;
}

function truncatedSegment(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength).replace(/[.\-_ ]+$/g, '') || value.slice(0, maxLength);
}

export interface SuggestedGeneratedImageNameInput {
  readonly createdAt?: string;
  readonly providerName?: string;
  readonly prompt?: string;
  readonly outputIndex?: number;
  readonly outputCount?: number;
  readonly mimeType?: string;
}

function timestampForFileName(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

/** 为生成结果构造稳定且可读的文件名，避免直接暴露 provider 默认占位名。 */
export function suggestedGeneratedImageFileName(
  input: SuggestedGeneratedImageNameInput,
  fallbackBase = 'imagen-result',
): string {
  const timestampSegment = timestampForFileName(input.createdAt);
  const providerSegment = input.providerName
    ? truncatedSegment(sanitizedFileNameSegment(input.providerName, 'provider'), 24)
    : undefined;
  const promptSegment = input.prompt
    ? truncatedSegment(sanitizedFileNameSegment(input.prompt, 'result'), 40)
    : undefined;
  const parts = ['imagen'];
  if (timestampSegment) {
    parts.push(timestampSegment);
  }
  if (providerSegment) {
    parts.push(providerSegment);
  }
  if (promptSegment) {
    parts.push(promptSegment);
  }
  if ((input.outputCount ?? 0) > 1) {
    parts.push(String((input.outputIndex ?? 0) + 1));
  }
  return suggestedAssetFileName({
    name: parts.join('_'),
    mimeType: input.mimeType ?? 'image/png',
  }, fallbackBase);
}

async function arrayBufferFromUrl(
  url: string,
  mimeType: string | undefined,
  fetchImpl: typeof fetch,
): Promise<{ readonly data: ArrayBuffer; readonly mimeType: string }> {
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch asset URL: ${response.status}`);
  }
  return {
    data: await response.arrayBuffer(),
    mimeType: response.headers.get('content-type') ?? mimeType ?? 'image/png',
  };
}

export async function assetToArrayBuffer(
  asset: Asset,
  options: AssetToArrayBufferOptions = {},
): Promise<{ readonly data: ArrayBuffer; readonly mimeType: string }> {
  if (asset.storedRef?.kind === 'url') {
    return arrayBufferFromUrl(
      asset.storedRef.ref,
      asset.storedRef.mimeType ?? asset.mimeType,
      options.fetchImpl ?? fetch,
    );
  }
  if (asset.storedRef && options.resolveStoredRef) {
    const data = await options.resolveStoredRef(asset.storedRef);
    if (!data) {
      throw new Error(`AssetStore object is unavailable: ${asset.storedRef.ref}`);
    }
    return {
      data,
      mimeType: asset.storedRef.mimeType ?? asset.mimeType ?? 'image/png',
    };
  }
  if (asset.data instanceof Uint8Array) {
    const bytes = new Uint8Array(asset.data.byteLength);
    bytes.set(asset.data);
    return {
      data: bytes.buffer,
      mimeType: asset.mimeType ?? 'image/png',
    };
  }
  if (typeof asset.data === 'string') {
    return arrayBufferFromDataUrl(asset.data);
  }
  if (asset.url) {
    return arrayBufferFromUrl(asset.url, asset.mimeType, options.fetchImpl ?? fetch);
  }
  throw new Error('Asset has no URL or inline data.');
}

export function assetFromTaskResource(resource: TaskResourceRef): Asset {
  if (resource.ref.kind === 'url') {
    return {
      type: 'image',
      ...(resource.ref.name ? { name: resource.ref.name } : {}),
      ...(resource.ref.mimeType ? { mimeType: resource.ref.mimeType } : {}),
      url: resource.ref.ref,
    };
  }
  return {
    type: 'image',
    ...(resource.ref.name ? { name: resource.ref.name } : {}),
    ...(resource.ref.mimeType ? { mimeType: resource.ref.mimeType } : {}),
    storedRef: resource.ref,
  };
}
