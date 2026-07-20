import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '@imagen-ps/application';
import {
  placeTaskOutputOnCanvas,
  saveTaskOutputToFile,
} from '../../../src/shared/domain/task-actions';
import { createRunningTaskRecord } from '../../../src/shared/domain/task-snapshot';
import { fakeHostImage } from '../../helpers/fixtures/assets.fixtures';
import { fakeTaskRecord } from '../../helpers/fixtures/task.fixtures';

function task(overrides?: Partial<TaskRecord>): TaskRecord {
  return {
    ...fakeTaskRecord,
    execution: {
      backend: { id: 'fake-backend', label: 'Fake Backend' },
      connection: { id: 'studio-connection', label: 'Studio Connection' },
      target: { id: 'target-1', label: 'Target One' },
    },
    ...overrides,
  };
}

describe('Task output actions', () => {
  it('writes a ready Edit Region as a top-level snapshot instead of an attachment', () => {
    const record = createRunningTaskRecord({
      taskId: 'task-edit-region',
      operation: 'image-edit',
      prompt: 'replace the background',
      attachments: [{ id: 'primary', type: 'layer', name: 'Primary layer', image: fakeHostImage }],
      editRegion: {
        targetAttachmentId: 'primary',
        source: { kind: 'photoshop-user-layer-mask', documentId: 42, layerId: 7 },
        geometry: {
          sourceBounds: { left: 10, top: 20, right: 110, bottom: 120 },
          targetSize: { width: 100, height: 100 },
          coordinateSpace: 'primary-provider-input',
        },
        mask: {
          asset: fakeHostImage,
          encoding: 'grayscale-png',
          bitDepth: 8,
          polarity: 'white-edit',
        },
      },
      placementIntent: { kind: 'unbound', reason: 'no-photoshop-source' },
      execution: { backend: { id: 'provider', label: 'Provider' } },
      createdAt: '2026-07-20T00:00:00.000Z',
    });

    expect(record.attachments).toHaveLength(1);
    expect(record.attachments[0]).toMatchObject({ attachmentId: 'primary', kind: 'photoshop-layer' });
    expect(record.editRegion).toMatchObject({
      targetAttachmentId: 'primary',
      geometry: { targetWidth: 100, targetHeight: 100 },
      encoding: 'grayscale-png',
      bitDepth: 8,
      polarity: 'white-edit',
    });
  });

  it('downloads through StoredAssetRef and uses the generic execution label', async () => {
    const saveAssetToFile = vi.fn(async () => undefined);
    const record = task();

    await saveTaskOutputToFile(record, record.outputs[0]!.outputId, {
      host: { saveAssetToFile },
    });

    expect(saveAssetToFile).toHaveBeenCalledWith(
      expect.objectContaining({ storedRef: record.outputs[0]!.asset.ref }),
      expect.objectContaining({ suggestedName: expect.stringContaining('Studio-Connection') }),
    );
  });

  it('places available output bytes with durable document-only intent', async () => {
    const placeAssetOnCanvas = vi.fn(async () => undefined);
    const saveAssetToFile = vi.fn(async () => undefined);
    const record = task({
      placement: {
        kind: 'document-only',
        document: {
          host: 'photoshop',
          documentId: 42,
          name: 'Editorial.psd',
          width: 2048,
          height: 1536,
        },
      },
    });

    await placeTaskOutputOnCanvas(record, record.outputs[0]!.outputId, {
      taskResources: {
        async resolve(resource) {
          return {
            resource,
            availability: 'available',
            bytes: new Uint8Array([1, 2, 3]).buffer,
          };
        },
      },
      host: { placeAssetOnCanvas, saveAssetToFile },
    });

    expect(placeAssetOnCanvas).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.any(Uint8Array) }),
      {
        kind: 'document-only',
        documentId: 42,
        documentName: 'Editorial.psd',
        documentSizeAtCapture: { width: 2048, height: 1536 },
      },
    );
  });

  it('keeps missing output records but blocks placement side effects', async () => {
    const placeAssetOnCanvas = vi.fn(async () => undefined);
    const saveAssetToFile = vi.fn(async () => undefined);
    const record = task();

    await expect(placeTaskOutputOnCanvas(record, record.outputs[0]!.outputId, {
      taskResources: {
        async resolve(resource) {
          return { resource, availability: 'missing' };
        },
      },
      host: { placeAssetOnCanvas, saveAssetToFile },
    })).rejects.toThrow('Task output resource is unavailable.');

    expect(record.outputs).toHaveLength(1);
    expect(placeAssetOnCanvas).not.toHaveBeenCalled();
  });
});
