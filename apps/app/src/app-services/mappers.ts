import type { Asset, Job, JobError, ProviderModelInfo, ProviderProfile } from '@imagen-ps/application';

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
  readonly statusLabel: string;
}

interface ProviderInvokeResultLike {
  readonly assets?: readonly Asset[];
  readonly metadata?: {
    readonly size?: string;
    readonly outputFormat?: string;
  };
}

function isProviderInvokeResultLike(value: unknown): value is ProviderInvokeResultLike {
  return typeof value === 'object' && value !== null;
}

export function commandErrorToMessage(error: JobError): string {
  return `${error.category}: ${error.message}`;
}

export function assetToPreviewUrl(asset: Asset): string {
  if (asset.url) {
    return asset.url;
  }
  if (typeof asset.data === 'string') {
    if (asset.data.startsWith('data:')) {
      return asset.data;
    }
    const mimeType = asset.mimeType ?? 'image/png';
    return `data:${mimeType};base64,${asset.data}`;
  }
  if (asset.data instanceof Uint8Array && typeof URL !== 'undefined' && typeof Blob !== 'undefined') {
    const bytes = new Uint8Array(asset.data.byteLength);
    bytes.set(asset.data);
    const blob = new Blob([bytes.buffer], { type: asset.mimeType ?? 'image/png' });
    return URL.createObjectURL(blob);
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

export function profileToProviderRow(profile: ProviderProfile): ProviderRowVM {
  const defaultModel = profile.config.defaultModel;
  return {
    profileId: profile.profileId,
    providerId: profile.providerId,
    displayName: profile.displayName,
    enabled: profile.enabled,
    family: String(profile.config.family ?? profile.providerId),
    ...(typeof defaultModel === 'string' && defaultModel.length > 0 ? { defaultModel } : {}),
    statusLabel: profile.enabled ? '已启用' : '已停用',
  };
}

export function modelLabel(model: ProviderModelInfo): string {
  return model.displayName ?? model.id;
}
