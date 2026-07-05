import { vi } from 'vitest';
import { createMemoryThumbnailStore } from '../../../src/shared/image/thumbnail-store';
import { createStaticAppPathInfoPort } from '../../../src/shared/ports/app-path-info';
import {
  fakeOutputBytes,
  fakeOutputAsset,
  fakeProviderInputAsset,
  fakeProviderInputBytes,
} from '../fixtures/assets.fixtures';
import { fakeTaskRecord } from '../fixtures/task.fixtures';

export function createTaskResourceThumbnailHelper() {
  const resolveTaskResource = vi.fn(async () => ({
    resource: fakeTaskRecord.outputs[0]!.asset,
    availability: 'available' as const,
    bytes: fakeOutputBytes.buffer.slice(0),
    preview: { url: 'blob:task-history-preview' },
  }));

  return {
    pathInfo: createStaticAppPathInfoPort({
      logPath: '/fake/data/logs/2026-07-02/imagen.jsonl',
      generatedImagePath: '/fake/data/uxp-asset-*',
    }),
    thumbnails: createMemoryThumbnailStore({
      async resolveStoredRef(ref) {
        if (ref.ref === fakeOutputAsset.storedRef?.ref) {
          return fakeOutputBytes.buffer.slice(0);
        }
        if (ref.ref === fakeProviderInputAsset.storedRef?.ref) {
          return fakeProviderInputBytes.buffer.slice(0);
        }
        return undefined;
      },
    }),
    taskResources: { resolve: resolveTaskResource },
    spies: { resolveTaskResource },
  };
}
