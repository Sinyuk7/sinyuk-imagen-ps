import { describe, expect, it, vi } from 'vitest';
import type { ResolvedTaskResource, TaskRecord, TaskResourceRef } from '@imagen-ps/application';
import { placeTaskOutputOnCanvas } from '../src/shared/domain/task-actions';
import { fakeTaskRecord } from './fakes';

function exactFrameTaskRecord(): TaskRecord {
  return {
    ...fakeTaskRecord,
    taskId: 'task-exact-frame',
    attachments: [{
      kind: 'photoshop-capture',
      attachmentId: 'attachment-1',
      label: 'Layer 1',
      asset: { ref: { kind: 'hostObject', ref: 'input-1', mimeType: 'image/png' } },
      evidence: {
        snapshotId: 'snapshot-1',
        document: {
          documentId: 42,
          width: 1024,
          height: 768,
        },
        placementRect: {
          left: 10,
          top: 20,
          right: 266,
          bottom: 276,
        },
      },
    }],
    placement: { kind: 'exact-frame', sourceSnapshotId: 'snapshot-1' },
  };
}

function available(resource: TaskResourceRef): ResolvedTaskResource {
  return {
    resource,
    availability: 'available',
    bytes: new Uint8Array([1, 2, 3]).buffer,
    preview: { url: 'blob:preview', dispose: vi.fn() },
  };
}

describe('task output actions', () => {
  it('places an exact-frame durable output through the host placement port', async () => {
    const record = exactFrameTaskRecord();
    const output = record.outputs[0]!;
    const resolved = available(output.asset);
    const placeAssetOnCanvas = vi.fn(async () => undefined);

    await placeTaskOutputOnCanvas(record, output.outputId, {
      taskResources: { resolve: vi.fn(async () => resolved) },
      host: { placeAssetOnCanvas },
    });

    expect(placeAssetOnCanvas).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'image',
        name: 'history.png',
        mimeType: 'image/png',
      }),
      {
        kind: 'exact-frame',
        documentId: 42,
        documentSizeAtCapture: { width: 1024, height: 768 },
        placementRect: { left: 10, top: 20, right: 266, bottom: 276 },
      },
    );
    expect(resolved.preview?.dispose).toHaveBeenCalledTimes(1);
  });

  it('rebuilds exact-frame intent from durable document-only records when attachment evidence still carries frame bounds', async () => {
    const record: TaskRecord = {
      ...exactFrameTaskRecord(),
      placement: {
        kind: 'document-only',
        document: {
          host: 'photoshop',
          documentId: 42,
          width: 1024,
          height: 768,
        },
      },
    };
    const output = record.outputs[0]!;
    const resolved = available(output.asset);
    const placeAssetOnCanvas = vi.fn(async () => undefined);

    await placeTaskOutputOnCanvas(record, output.outputId, {
      taskResources: { resolve: vi.fn(async () => resolved) },
      host: { placeAssetOnCanvas },
    });

    expect(placeAssetOnCanvas).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      kind: 'exact-frame',
      documentId: 42,
      placementRect: { left: 10, top: 20, right: 266, bottom: 276 },
    }));
  });

  it('does not call the host when the output resource is unavailable', async () => {
    const output = fakeTaskRecord.outputs[0]!;
    const placeAssetOnCanvas = vi.fn(async () => undefined);

    await expect(placeTaskOutputOnCanvas(fakeTaskRecord, output.outputId, {
      taskResources: {
        resolve: vi.fn(async () => ({
          resource: output.asset,
          availability: 'missing',
        })),
      },
      host: { placeAssetOnCanvas },
    })).rejects.toThrow('Task output resource is unavailable.');

    expect(placeAssetOnCanvas).not.toHaveBeenCalled();
  });

  it('rejects unknown task outputs before resolving resources', async () => {
    const resolve = vi.fn(async () => available(fakeTaskRecord.outputs[0]!.asset));
    const placeAssetOnCanvas = vi.fn(async () => undefined);

    await expect(placeTaskOutputOnCanvas(fakeTaskRecord, 'missing-output', {
      taskResources: { resolve },
      host: { placeAssetOnCanvas },
    })).rejects.toThrow('Task output not found: missing-output');

    expect(resolve).not.toHaveBeenCalled();
    expect(placeAssetOnCanvas).not.toHaveBeenCalled();
  });
});
