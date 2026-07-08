import type { ApiFormat, Asset, Job, JobError, ProviderProfile } from '@imagen-ps/application';
import type { ProfileBillingState } from '@imagen-ps/application';
import { ensurePlaceableImagePayload } from './image-payload-preflight';
import { assetHasTransparency } from '../image/image-transparency';

export interface AssetPreview {
  readonly asset: Asset;
  readonly url: string;
  readonly label: string;
  readonly hasTransparency: boolean;
}

export interface ProviderRowVM {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly apiFormatLabel: string;
  readonly defaultModel?: string;
}

export interface BillingPrimaryParts {
  readonly primary: string;
  readonly unit?: string;
  readonly secondary?: string;
}

interface ProviderInvokeResultLike {
  readonly assets?: readonly Asset[];
  readonly text?: unknown;
  readonly metadata?: {
    readonly size?: string;
    readonly outputFormat?: string;
  };
}

function isProviderInvokeResultLike(value: unknown): value is ProviderInvokeResultLike {
  return typeof value === 'object' && value !== null;
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  let chunk = '';
  let index = 0;
  const append = (a: string, b: string, c: string, d: string): void => {
    chunk += `${a}${b}${c}${d}`;
    if (chunk.length >= 8192) {
      chunks.push(chunk);
      chunk = '';
    }
  };

  for (; index + 2 < bytes.length; index += 3) {
    const value = (bytes[index] << 16) | (bytes[index + 1] << 8) | bytes[index + 2];
    append(
      BASE64_ALPHABET[(value >> 18) & 63],
      BASE64_ALPHABET[(value >> 12) & 63],
      BASE64_ALPHABET[(value >> 6) & 63],
      BASE64_ALPHABET[value & 63],
    );
  }

  const remaining = bytes.length - index;
  if (remaining === 1) {
    const value = bytes[index] << 16;
    append(BASE64_ALPHABET[(value >> 18) & 63], BASE64_ALPHABET[(value >> 12) & 63], '=', '=');
  } else if (remaining === 2) {
    const value = (bytes[index] << 16) | (bytes[index + 1] << 8);
    append(
      BASE64_ALPHABET[(value >> 18) & 63],
      BASE64_ALPHABET[(value >> 12) & 63],
      BASE64_ALPHABET[(value >> 6) & 63],
      '=',
    );
  }

  if (chunk.length > 0) {
    chunks.push(chunk);
  }

  return chunks.join('');
}

function arrayBufferFromBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function base64ToBytes(value: string): Uint8Array {
  const clean = value.replace(/\s+/g, '').replace(/=+$/, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of clean) {
    const index = BASE64_ALPHABET.indexOf(char);
    if (index === -1) {
      continue;
    }
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(out);
}

function bytesFromDataString(data: string): Uint8Array {
  const commaIndex = data.startsWith('data:') ? data.indexOf(',') + 1 : 0;
  return base64ToBytes(data.slice(commaIndex));
}

function previewMimeType(asset: Asset): string {
  return asset.mimeType ?? 'image/png';
}

function ensurePreviewableImageBytes(bytes: Uint8Array, mimeType: string): boolean {
  try {
    ensurePlaceableImagePayload(arrayBufferFromBytes(bytes), mimeType);
    return true;
  } catch {
    return false;
  }
}

export function commandErrorToMessage(error: JobError): string {
  return `${error.category}: ${error.message}`;
}

export function assetToPreviewUrl(asset: Asset): string {
  if (asset.url) {
    return asset.url;
  }
  if (typeof asset.data === 'string') {
    const mimeType = previewMimeType(asset);
    if (asset.data.startsWith('data:')) {
      const header = /^data:([^;,]+)/.exec(asset.data);
      const dataMimeType = header?.[1] ?? mimeType;
      return ensurePreviewableImageBytes(bytesFromDataString(asset.data), dataMimeType) ? asset.data : '';
    }
    if (!ensurePreviewableImageBytes(bytesFromDataString(asset.data), mimeType)) {
      return '';
    }
    return `data:${mimeType};base64,${asset.data}`;
  }
  if (asset.data instanceof Uint8Array) {
    const mimeType = previewMimeType(asset);
    if (!ensurePreviewableImageBytes(asset.data, mimeType)) {
      return '';
    }
    return `data:${mimeType};base64,${bytesToBase64(asset.data)}`;
  }
  return '';
}

export function assetToPreview(asset: Asset, index = 0): AssetPreview {
  return {
    asset,
    url: assetToPreviewUrl(asset),
    label: asset.name ?? `Asset ${index + 1}`,
    hasTransparency: assetHasTransparency(asset),
  };
}

export function jobOutputAssets(job: Job): readonly Asset[] {
  const image = job.output?.image;
  if (!isProviderInvokeResultLike(image) || !Array.isArray(image.assets)) {
    return [];
  }
  return image.assets;
}

export function jobOutputMetadata(job: Job): ProviderInvokeResultLike['metadata'] {
  const image = job.output?.image;
  return isProviderInvokeResultLike(image) ? image.metadata : undefined;
}

export function outputAssets(output: unknown): readonly Asset[] {
  if (typeof output !== 'object' || output === null) {
    return [];
  }
  const image = (output as { readonly image?: unknown }).image;
  if (!isProviderInvokeResultLike(image) || !Array.isArray(image.assets)) {
    return [];
  }
  return image.assets;
}

export function outputMetadata(output: unknown): ProviderInvokeResultLike['metadata'] {
  if (typeof output !== 'object' || output === null) {
    return undefined;
  }
  const image = (output as { readonly image?: unknown }).image;
  return isProviderInvokeResultLike(image) ? image.metadata : undefined;
}

export function outputText(output: unknown): string | undefined {
  if (typeof output !== 'object' || output === null) {
    return undefined;
  }
  const image = (output as { readonly image?: unknown }).image;
  if (!isProviderInvokeResultLike(image) || typeof image.text !== 'string') {
    return undefined;
  }
  const text = image.text.trim();
  return text.length > 0 ? text : undefined;
}

export function profileToProviderRow(profile: ProviderProfile): ProviderRowVM {
  return {
    profileId: profile.profileId,
    apiFormat: profile.apiFormat,
    displayName: profile.displayName,
    enabled: profile.enabled,
    apiFormatLabel: formatApiFormat(profile.apiFormat),
    ...(profile.defaultModelId !== undefined && profile.defaultModelId.length > 0 ? { defaultModel: profile.defaultModelId } : {}),
  };
}

function formatApiFormat(apiFormat: ApiFormat): string {
  switch (apiFormat) {
    case 'openai-images':
      return 'OpenAI Images';
    case 'openai-chat-completions':
      return 'OpenAI Chat Completions';
    case 'gemini-generate-content':
      return 'Gemini GenerateContent';
  }

  const exhaustive: never = apiFormat;
  return exhaustive;
}

function trimTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

export function formatCompactMetric(value: string | undefined): string | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  const normalized = trimTrailingZeros(value.trim());
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return normalized;
  }
  const absolute = Math.abs(parsed);
  const units = [
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' },
  ] as const;
  for (const unit of units) {
    if (absolute < unit.threshold) {
      continue;
    }
    const scaled = parsed / unit.threshold;
    const scaledAbsolute = Math.abs(scaled);
    const decimals = scaledAbsolute >= 100 ? 1 : scaledAbsolute >= 10 ? 2 : 3;
    return `${trimTrailingZeros(scaled.toFixed(decimals))}${unit.suffix}`;
  }
  return normalized;
}

export function formatBillingPrimary(billing: ProfileBillingState | null | undefined): string | undefined {
  const parts = formatBillingPrimaryParts(billing);
  if (!parts) {
    return undefined;
  }
  const head = parts.unit ? `${parts.primary} ${parts.unit}` : parts.primary;
  return parts.secondary ? `${head} · ${parts.secondary}` : head;
}

export function formatBillingPrimaryParts(billing: ProfileBillingState | null | undefined): BillingPrimaryParts | undefined {
  const primary = billing?.balance?.snapshot.primary;
  if (!primary) {
    return undefined;
  }
  if (primary.kind === 'money') {
    return {
      primary: primary.remaining,
      unit: primary.currency,
    };
  }
  const remaining = formatCompactMetric(primary.remaining);
  const percent = typeof primary.usedPercent === 'number' ? `${Math.round(primary.usedPercent)}% used` : undefined;
  const unit = primary.unit ?? 'quota';
  if (remaining) {
    return {
      primary: remaining,
      unit,
      ...(percent ? { secondary: percent } : {}),
    };
  }
  if (percent) {
    return {
      primary: percent,
    };
  }
  return {
    primary: unit,
  };
}

export function formatExactTaskCost(cost: ProfileBillingState['lastExactTaskCost']): string | undefined {
  if (!cost) {
    return undefined;
  }
  const label = `${trimTrailingZeros(cost.amount)} ${cost.currency}`;
  return cost.completeness === 'partial' ? `${label} (partial)` : label;
}

export function formatBalanceChange(change: ProfileBillingState['lastBalanceChange']): string | undefined {
  if (!change) {
    return undefined;
  }
  const prefix = change.direction === 'decreased' ? '-' : '+';
  return `${prefix}${trimTrailingZeros(change.amount)} ${change.currency}`;
}
