import type { Asset, Job, JobError, ProviderModelInfo, ProviderProfile } from '@imagen-ps/application';
import type { ProfileBillingState } from '@imagen-ps/application';
import { ensurePlaceableImagePayload } from './image-payload-preflight';

export interface AssetPreview {
  readonly asset: Asset;
  readonly url: string;
  readonly label: string;
}

export interface ProviderRowVM {
  readonly profileId: string;
  readonly providerId: string;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly family: string;
  readonly defaultModel?: string;
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
  const defaultModel = profile.config.defaultModel;
  return {
    profileId: profile.profileId,
    providerId: profile.providerId,
    displayName: profile.displayName,
    enabled: profile.enabled,
    family: String(profile.config.family ?? profile.providerId),
    ...(typeof defaultModel === 'string' && defaultModel.length > 0 ? { defaultModel } : {}),
  };
}

export function modelLabel(model: ProviderModelInfo): string {
  const base = model.displayName ?? model.id;
  if (model.supportStatus === 'saved-undiscovered') {
    return `${base} (saved, undiscovered)`;
  }
  if (model.supportStatus === 'custom-unchecked') {
    return `${base} (custom, unchecked)`;
  }
  return base;
}

function trimTrailingZeros(value: string): string {
  return value.includes('.') ? value.replace(/\.?0+$/, '') : value;
}

export function formatBillingPrimary(billing: ProfileBillingState | null | undefined): string | undefined {
  const primary = billing?.balance?.snapshot.primary;
  if (!primary) {
    return undefined;
  }
  if (primary.kind === 'money') {
    return `${primary.remaining} ${primary.currency}`;
  }
  const remaining = primary.remaining ? trimTrailingZeros(primary.remaining) : undefined;
  const percent = typeof primary.usedPercent === 'number' ? `${Math.round(primary.usedPercent)}% used` : undefined;
  const unit = primary.unit ?? 'quota';
  return [remaining ? `${remaining} ${unit}` : undefined, percent].filter(Boolean).join(' · ') || unit;
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
