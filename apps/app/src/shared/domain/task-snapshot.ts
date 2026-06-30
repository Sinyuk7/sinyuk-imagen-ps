import type {
  Asset,
  StoredAssetRef,
  TaskAttachment,
  TaskPlacement,
  TaskRecord,
  TaskResourceRef,
} from '@imagen-ps/application';
import type { HostImageAsset } from './host-image-asset';
import type { PlacementIntent, PhotoshopCapturePlacement, PhotoshopRect } from './photoshop-placement';

export interface TaskSnapshotAttachmentInput {
  readonly id: string;
  readonly type: 'layer' | 'file' | 'photoshop-capture';
  readonly name: string;
  readonly image: HostImageAsset;
  readonly photoshopPlacement?: PhotoshopCapturePlacement;
}

interface CreateRunningTaskRecordInput {
  readonly taskId: string;
  readonly operation: TaskRecord['operation'];
  readonly prompt: string;
  readonly attachments: readonly TaskSnapshotAttachmentInput[];
  readonly placementIntent: PlacementIntent;
  readonly providerName: string;
  readonly profileId: string;
  readonly modelId?: string;
  readonly createdAt: string;
}

function storedRefFromAsset(asset: Asset): StoredAssetRef | undefined {
  if (asset.storedRef !== undefined) {
    return asset.storedRef;
  }
  if (asset.url !== undefined && asset.url.length > 0) {
    return {
      kind: 'url',
      ref: asset.url,
      ...(asset.name !== undefined ? { name: asset.name } : {}),
      ...(asset.mimeType !== undefined ? { mimeType: asset.mimeType } : {}),
    };
  }
  if (asset.fileId !== undefined && asset.fileId.length > 0) {
    return {
      kind: 'externalToken',
      ref: asset.fileId,
      ...(asset.name !== undefined ? { name: asset.name } : {}),
      ...(asset.mimeType !== undefined ? { mimeType: asset.mimeType } : {}),
    };
  }
  return undefined;
}

function taskResourceFromAsset(
  asset: Asset,
  dimensions?: { readonly width?: number; readonly height?: number },
  fallback?: TaskResourceRef,
): TaskResourceRef {
  const ref = storedRefFromAsset(asset);
  if (ref === undefined) {
    if (fallback !== undefined) {
      return fallback;
    }
    throw new Error('Task attachment requires a durable storedRef, URL, or fileId.');
  }
  return {
    ref,
    ...(dimensions?.width !== undefined ? { width: dimensions.width } : {}),
    ...(dimensions?.height !== undefined ? { height: dimensions.height } : {}),
  };
}

function taskResourceFromDerivative(attachment: TaskSnapshotAttachmentInput): TaskResourceRef | undefined {
  const derivative = attachment.image.resource.derivatives.providerInput;
  if (derivative?.kind !== 'ready' || derivative.storedRef === undefined) {
    return undefined;
  }
  return {
    ref: derivative.storedRef,
    ...(derivative.width !== undefined ? { width: derivative.width } : {}),
    ...(derivative.height !== undefined ? { height: derivative.height } : {}),
  };
}

function rectEvidence(rect: PhotoshopRect): Record<string, number> {
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
  };
}

export function sourceSnapshotId(attachmentId: string, placement: PhotoshopCapturePlacement): string {
  return `${attachmentId}:${placement.snapshot.documentId}:${placement.snapshot.layerId}`;
}

function photoshopEvidence(attachment: TaskSnapshotAttachmentInput, placement: PhotoshopCapturePlacement): Record<string, unknown> {
  return {
    host: 'photoshop',
    snapshotId: sourceSnapshotId(attachment.id, placement),
    document: {
      documentId: placement.snapshot.documentId,
      ...(placement.snapshot.documentName !== undefined ? { name: placement.snapshot.documentName } : {}),
      width: placement.snapshot.documentSize.width,
      height: placement.snapshot.documentSize.height,
    },
    layer: {
      layerId: placement.snapshot.layerId,
      bounds: rectEvidence(placement.snapshot.layerBoundsNoEffects),
    },
    ...(placement.snapshot.selectionBounds
      ? { selection: { bounds: rectEvidence(placement.snapshot.selectionBounds) } }
      : {}),
    captureRect: rectEvidence(placement.snapshot.layerBoundsNoEffects),
    placementRect: rectEvidence(placement.placementRect),
  };
}

function attachmentKind(attachment: TaskSnapshotAttachmentInput): string {
  if (attachment.type === 'photoshop-capture') {
    return 'photoshop-capture';
  }
  if (attachment.type === 'layer') {
    return 'photoshop-layer';
  }
  return 'local-file';
}

function taskAttachmentFromConversation(attachment: TaskSnapshotAttachmentInput): TaskAttachment {
  const resource = attachment.image.resource;
  const providerInput = taskResourceFromDerivative(attachment);
  const asset = taskResourceFromAsset(attachment.image.asset, resource.original, providerInput);
  const base = {
    kind: attachmentKind(attachment),
    attachmentId: attachment.id,
    label: attachment.name,
    asset,
    ...(providerInput ? { providerInput } : {}),
  };

  if (attachment.photoshopPlacement !== undefined) {
    return {
      ...base,
      evidence: photoshopEvidence(attachment, attachment.photoshopPlacement),
    };
  }

  return {
    ...base,
    file: {
      ...(resource.original?.name !== undefined ? { name: resource.original.name } : {}),
      ...(resource.original?.byteSize !== undefined ? { byteSize: resource.original.byteSize } : {}),
      ...(resource.original?.mimeType !== undefined ? { mimeType: resource.original.mimeType } : {}),
      ...(resource.original?.storedRef?.sha256 !== undefined ? { sha256: resource.original.storedRef.sha256 } : {}),
    },
  };
}

function placementFromIntent(intent: PlacementIntent, attachments: readonly TaskSnapshotAttachmentInput[]): TaskPlacement {
  if (intent.kind === 'exact-frame') {
    const match = attachments.find((attachment) => attachment.photoshopPlacement !== undefined);
    if (match?.photoshopPlacement !== undefined) {
      return { kind: 'exact-frame', sourceSnapshotId: sourceSnapshotId(match.id, match.photoshopPlacement) };
    }
  }

  if (intent.kind === 'document-only') {
    return {
      kind: 'document-only',
      document: {
        host: 'photoshop',
        documentId: intent.documentId,
        ...(intent.documentName !== undefined ? { name: intent.documentName } : {}),
        width: intent.documentSizeAtCapture.width,
        height: intent.documentSizeAtCapture.height,
      },
    };
  }

  return {
    kind: 'unbound',
    reason: intent.kind === 'unbound' && intent.reason === 'multiple-documents' ? 'multiple-documents' : 'no-photoshop-source',
  };
}

export function createRunningTaskRecord(input: CreateRunningTaskRecordInput): TaskRecord {
  const task: TaskRecord = {
    schemaVersion: 1,
    taskId: input.taskId,
    status: 'running',
    operation: input.operation,
    prompt: input.prompt,
    attachments: input.attachments.map(taskAttachmentFromConversation),
    outputs: [],
    placement: placementFromIntent(input.placementIntent, input.attachments),
    execution: {
      profileId: input.profileId,
      profileName: input.providerName,
      ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
    },
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
  return task;
}
