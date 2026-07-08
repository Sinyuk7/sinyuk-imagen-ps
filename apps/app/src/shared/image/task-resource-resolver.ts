import type { ResolvedTaskResource, StoredAssetRef, TaskResourceRef } from '@imagen-ps/application';
import { createRuntimeImageUrlOrDataUrl, type RuntimeImageUrl } from './runtime-image-url';
import { validatePreviewBytes } from './preview-fallback';

export interface TaskResourceResolverOptions {
  readonly resolveStoredRef: (ref: StoredAssetRef) => Promise<ArrayBuffer | undefined>;
  readonly createPreviewUrl?: (bytes: Uint8Array, mimeType: string) => RuntimeImageUrl;
}

function previewFromBytes(bytes: ArrayBuffer, mimeType: string, createPreviewUrl?: TaskResourceResolverOptions['createPreviewUrl']) {
  const view = new Uint8Array(bytes);
  if (!validatePreviewBytes(view, mimeType).ok) {
    return undefined;
  }
  const runtimeUrl = createPreviewUrl ? createPreviewUrl(view, mimeType) : createRuntimeImageUrlOrDataUrl(view, mimeType);
  return {
    url: runtimeUrl.url,
    dispose: runtimeUrl.release,
  };
}

/** Creates a runtime resolver for durable task resource refs. */
export function createTaskResourceResolver(options: TaskResourceResolverOptions) {
  return {
    async resolve(resource: TaskResourceRef): Promise<ResolvedTaskResource> {
      if (resource.ref.kind === 'url') {
        return {
          resource,
          availability: 'remote-only',
          preview: {
            url: resource.ref.ref,
          },
        };
      }

      if (resource.ref.kind === 'externalToken') {
        return {
          resource,
          availability: 'unresolvable',
        };
      }

      const bytes = await options.resolveStoredRef(resource.ref);
      if (bytes === undefined) {
        return {
          resource,
          availability: 'missing',
        };
      }

      return {
        resource,
        availability: 'available',
        bytes,
        preview: previewFromBytes(bytes, resource.ref.mimeType ?? 'image/png', options.createPreviewUrl),
      };
    },
  };
}
