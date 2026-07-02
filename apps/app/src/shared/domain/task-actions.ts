import type { Asset, TaskRecord, TaskResourceRef } from '@imagen-ps/application';
import type { ResolvedTaskResource } from '@imagen-ps/application';
import type { HostBridge } from '../ports/host-port';
import {
  placementIntentFromCapturePlacement,
  type PlacementIntent,
  type PhotoshopCapturePlacement,
  type PhotoshopRect,
} from './photoshop-placement';

export interface TaskActionResourceResolver {
  resolve(resource: TaskResourceRef): Promise<ResolvedTaskResource>;
}

export interface TaskActionServices {
  readonly taskResources: TaskActionResourceResolver;
  readonly host: Pick<HostBridge, 'placeAssetOnCanvas'>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function rectFromEvidence(value: unknown): PhotoshopRect | undefined {
  const rect = asRecord(value);
  const left = numberValue(rect?.left);
  const top = numberValue(rect?.top);
  const right = numberValue(rect?.right);
  const bottom = numberValue(rect?.bottom);
  if (left === undefined || top === undefined || right === undefined || bottom === undefined || right <= left || bottom <= top) {
    return undefined;
  }
  return { left, top, right, bottom };
}

function placementFromEvidence(source: Record<string, unknown> | undefined): PhotoshopCapturePlacement | undefined {
  const document = asRecord(source?.document);
  const layer = asRecord(source?.layer);
  const documentId = numberValue(document?.documentId);
  const width = numberValue(document?.width);
  const height = numberValue(document?.height);
  const layerId = numberValue(layer?.layerId);
  const layerBoundsNoEffects = rectFromEvidence(layer?.bounds);
  const placementRect = rectFromEvidence(source?.placementRect);
  const selection = asRecord(asRecord(source?.selection)?.bounds);
  const selectionBounds = selection ? rectFromEvidence(selection) ?? null : null;
  const documentName = typeof document?.name === 'string' ? document.name : undefined;
  if (
    documentId === undefined ||
    width === undefined ||
    height === undefined ||
    layerId === undefined ||
    layerBoundsNoEffects === undefined ||
    placementRect === undefined
  ) {
    return undefined;
  }
  return {
    snapshot: {
      documentId,
      ...(documentName ? { documentName } : {}),
      documentSize: { width, height },
      layerId,
      layerBoundsNoEffects,
      selectionBounds,
    },
    placementRect,
  };
}

function exactFrameIntentFromLegacyEvidence(source: Record<string, unknown> | undefined): PlacementIntent | undefined {
  const document = asRecord(source?.document);
  const documentId = numberValue(document?.documentId);
  const width = numberValue(document?.width);
  const height = numberValue(document?.height);
  const documentName = typeof document?.name === 'string' ? document.name : undefined;
  const placementRect = rectFromEvidence(source?.placementRect);
  if (documentId === undefined || width === undefined || height === undefined || placementRect === undefined) {
    return undefined;
  }
  return {
    kind: 'exact-frame',
    documentId,
    documentSizeAtCapture: { width, height },
    ...(documentName ? { documentName } : {}),
    placementRect,
  };
}

function placementIntentFromTask(record: TaskRecord): PlacementIntent {
  const placement = record.placement;
  if (placement.kind === 'unbound') {
    return { kind: 'unbound', reason: placement.reason === 'multiple-documents' ? 'multiple-documents' : 'no-photoshop-capture' };
  }

  const attachmentEvidence = record.attachments
    .map((attachment) => asRecord(asRecord(attachment)?.evidence))
    .find((evidence) =>
      placement.kind === 'exact-frame'
        ? evidence?.snapshotId === placement.sourceSnapshotId
        : numberValue(asRecord(evidence?.document)?.documentId) === numberValue(placement.document.documentId),
    );
  const replayPlacement = placementFromEvidence(attachmentEvidence);
  if (replayPlacement !== undefined) {
    return placementIntentFromCapturePlacement(replayPlacement);
  }
  if (placement.kind === 'exact-frame') {
    const legacyExactFrame = exactFrameIntentFromLegacyEvidence(attachmentEvidence);
    if (legacyExactFrame !== undefined) {
      return legacyExactFrame;
    }
  }

  if (placement.kind === 'document-only') {
    const document = placement.document;
    const documentId = numberValue(document.documentId);
    const width = numberValue(document.width);
    const height = numberValue(document.height);
    const documentName = typeof document.name === 'string' ? document.name : undefined;
    if (documentId === undefined || width === undefined || height === undefined) {
      return { kind: 'unbound', reason: 'no-photoshop-capture' };
    }
    const legacyExactFrame = exactFrameIntentFromLegacyEvidence(attachmentEvidence);
    if (legacyExactFrame !== undefined) {
      return legacyExactFrame;
    }
    return { kind: 'document-only', documentId, documentSizeAtCapture: { width, height }, ...(documentName ? { documentName } : {}) };
  }

  const source = attachmentEvidence;
  const document = asRecord(source?.document);
  const documentId = numberValue(document?.documentId);
  const width = numberValue(document?.width);
  const height = numberValue(document?.height);
  const documentName = typeof document?.name === 'string' ? document.name : undefined;
  const evidencePlacement = placementFromEvidence(source);
  if (documentId === undefined || width === undefined || height === undefined || evidencePlacement === undefined) {
    return { kind: 'unbound', reason: 'no-photoshop-capture' };
  }
  return placementIntentFromCapturePlacement({
    ...evidencePlacement,
    snapshot: {
      ...evidencePlacement.snapshot,
      ...(documentName ? { documentName } : {}),
      documentSize: { width, height },
      documentId,
    },
  });
}

function assetFromResolved(record: TaskRecord, resource: ResolvedTaskResource): Asset {
  if (resource.availability !== 'available' || !resource.bytes) {
    throw new Error('Task output resource is unavailable.');
  }
  return {
    type: 'image',
    name: resource.resource.ref.name ?? `${record.taskId}.png`,
    mimeType: resource.resource.ref.mimeType ?? 'image/png',
    data: new Uint8Array(resource.bytes),
  };
}

export async function placeTaskOutputOnCanvas(record: TaskRecord, outputId: string, services: TaskActionServices): Promise<void> {
  const output = record.outputs.find((item) => item.outputId === outputId);
  if (!output) {
    throw new Error(`Task output not found: ${outputId}`);
  }
  const resolved = await services.taskResources.resolve(output.asset);
  try {
    await services.host.placeAssetOnCanvas(assetFromResolved(record, resolved), placementIntentFromTask(record));
  } finally {
    resolved.preview?.dispose?.();
  }
}
