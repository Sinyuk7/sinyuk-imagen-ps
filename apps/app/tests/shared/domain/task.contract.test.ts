import { describe, expect, it, vi } from 'vitest';
import type { TaskRecord } from '@imagen-ps/application';
import {
  placeTaskOutputOnCanvas,
  saveTaskOutputToFile,
} from '../../../src/shared/domain/task-actions';
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
