import type { ResolvedTaskResource } from '@imagen-ps/application';
import { ensurePlaceableImagePayload } from '../domain/image-payload-preflight';

export type ImagePreviewFallbackDensity = 'thumbnail' | 'preview-frame' | 'large-empty';
export type ImagePreviewFallbackState = 'loading' | 'empty' | 'preview-unavailable' | 'file-missing' | 'resource-unresolvable';
export type ImagePreviewFallbackReason = 'decode-failed' | 'unsupported-format' | 'host-unavailable' | 'permission-denied' | 'unknown';

export interface ImagePreviewFallback {
  readonly state: ImagePreviewFallbackState;
  readonly reason?: ImagePreviewFallbackReason;
}

const SUPPORTED_PREVIEW_MIME_TYPE = /image\/(?:png|jpe?g|webp)/i;

export function createImagePreviewFallback(
  state: ImagePreviewFallbackState,
  reason?: ImagePreviewFallbackReason,
): ImagePreviewFallback {
  return reason ? { state, reason } : { state };
}

export function fallbackStateFromAvailability(
  availability: ResolvedTaskResource['availability'] | undefined,
  fallbackWhenAvailable: ImagePreviewFallbackState = 'preview-unavailable',
): ImagePreviewFallbackState | undefined {
  if (availability === 'missing') {
    return 'file-missing';
  }
  if (availability === 'unresolvable') {
    return 'resource-unresolvable';
  }
  if (availability === 'available') {
    return fallbackWhenAvailable;
  }
  return undefined;
}

export function validatePreviewBytes(
  bytes: Uint8Array,
  mimeType: string,
): { readonly ok: true } | { readonly ok: false; readonly reason: ImagePreviewFallbackReason } {
  if (!SUPPORTED_PREVIEW_MIME_TYPE.test(mimeType)) {
    return { ok: false, reason: 'unsupported-format' };
  }
  try {
    const normalized = new Uint8Array(bytes.byteLength);
    normalized.set(bytes);
    ensurePlaceableImagePayload(normalized.buffer, mimeType);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'decode-failed' };
  }
}
