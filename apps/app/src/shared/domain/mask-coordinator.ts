import type { HostImageAsset } from './host-image-asset';
import type { CanonicalMaskAsset } from './mask-source';
import type { PhotoshopCapturePlacement } from './photoshop-placement';
import type { EditRegion, MaskBindingState, MaskPreference, PrimaryKey } from './edit-region';
import type { ReadLayerMaskAsAssetInput } from '../ports/host-port';

export interface MaskCoordinatorAttachment {
  readonly id: string;
  readonly image: HostImageAsset;
  readonly photoshopPlacement?: PhotoshopCapturePlacement;
  readonly selectionMask?: CanonicalMaskAsset;
}

export interface MaskCoordinatorPort {
  readLayerMaskAsAsset(input: ReadLayerMaskAsAssetInput): Promise<HostImageAsset | undefined>;
}

export interface MaskCoordinatorOptions {
  readonly host: MaskCoordinatorPort;
  readonly releaseDraftAsset?: (asset: HostImageAsset) => Promise<void> | void;
  readonly onStateChange?: (state: MaskBindingState) => void;
}

/** 从当前第一张 attachment 派生 Mask binding identity。 */
export function primaryKeyFromAttachment(attachment: MaskCoordinatorAttachment | undefined): PrimaryKey | undefined {
  const providerInput = attachment?.image.resource.derivatives.providerInput;
  if (!attachment || providerInput?.kind !== 'ready' || !providerInput.storedRef || providerInput.width === undefined || providerInput.height === undefined) {
    return undefined;
  }
  const placement = attachment.photoshopPlacement;
  return {
    attachmentId: attachment.id,
    resourceId: attachment.image.resource.id,
    providerInputRef: providerInput.storedRef.ref,
    ...(placement ? { sourceSnapshotId: `${attachment.id}:${placement.snapshot.documentId}:${placement.snapshot.layerId}` } : {}),
    ...(placement ? { sourceBounds: placement.placementRect } : {}),
    targetSize: { width: providerInput.width, height: providerInput.height },
  };
}

function primaryKeyMatches(left: PrimaryKey | undefined, right: PrimaryKey | undefined): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function selectionEditRegion(attachment: MaskCoordinatorAttachment, key: PrimaryKey): EditRegion | undefined {
  const placement = attachment.photoshopPlacement;
  if (!attachment.selectionMask || !placement || !key.sourceBounds) return undefined;
  return {
    targetAttachmentId: attachment.id,
    source: {
      kind: 'photoshop-selection',
      documentId: placement.snapshot.documentId,
      layerId: placement.snapshot.layerId,
    },
    geometry: {
      sourceBounds: key.sourceBounds,
      targetSize: key.targetSize,
      coordinateSpace: 'primary-provider-input',
    },
    mask: {
      asset: attachment.selectionMask,
      encoding: 'grayscale-png',
      bitDepth: 8,
      polarity: 'white-edit',
    },
  };
}

/** Primary change 的 cancellation、generation fence 与 draft asset ownership owner。 */
export class MaskCoordinator {
  private readonly host: MaskCoordinatorPort;
  private readonly releaseDraftAsset?: MaskCoordinatorOptions['releaseDraftAsset'];
  private readonly onStateChange?: MaskCoordinatorOptions['onStateChange'];
  private generation = 0;
  private currentKey: PrimaryKey | undefined;
  private controller: AbortController | undefined;
  private ownedAsset: HostImageAsset | undefined;
  private state: MaskBindingState = { kind: 'disabled' };

  constructor(options: MaskCoordinatorOptions) {
    this.host = options.host;
    this.releaseDraftAsset = options.releaseDraftAsset;
    this.onStateChange = options.onStateChange;
  }

  getState(): MaskBindingState {
    return this.state;
  }

  async reconcile(attachments: readonly MaskCoordinatorAttachment[], preference: MaskPreference): Promise<MaskBindingState> {
    const primary = attachments[0];
    const key = primaryKeyFromAttachment(primary);
    if (!preference.enabled) {
      await this.invalidate(undefined, { kind: 'disabled' });
      return this.state;
    }
    if (!primary || !key) {
      await this.invalidate(key, primary ? { kind: 'none', targetAttachmentId: primary.id } : { kind: 'no-primary' });
      return this.state;
    }
    if (primaryKeyMatches(this.currentKey, key) && this.state.kind !== 'error') return this.state;

    const nextGeneration = this.generation + 1;
    await this.invalidate(key, { kind: 'loading', targetAttachmentId: primary.id, generation: nextGeneration });
    const selection = selectionEditRegion(primary, key);
    if (selection) {
      this.ownedAsset = selection.mask.asset;
      this.publish(nextGeneration, key, { kind: 'ready', targetAttachmentId: primary.id, generation: nextGeneration, editRegion: selection });
      return this.state;
    }
    const placement = primary.photoshopPlacement;
    if (!placement || !key.sourceBounds) {
      this.publish(nextGeneration, key, { kind: 'none', targetAttachmentId: primary.id });
      return this.state;
    }
    const controller = new AbortController();
    this.controller = controller;
    try {
      const asset = await this.host.readLayerMaskAsAsset({
        documentId: placement.snapshot.documentId,
        layerId: placement.snapshot.layerId,
        sourceBounds: key.sourceBounds,
        targetSize: key.targetSize,
      });
      if (controller.signal.aborted || nextGeneration !== this.generation || !primaryKeyMatches(this.currentKey, key)) {
        if (asset) await this.release(asset);
        return this.state;
      }
      if (!asset) {
        this.publish(nextGeneration, key, { kind: 'none', targetAttachmentId: primary.id });
        return this.state;
      }
      if (!('canonicalMask' in asset)) {
        throw new Error('Photoshop layer mask acquisition returned a non-canonical asset.');
      }
      this.ownedAsset = asset;
      this.publish(nextGeneration, key, {
        kind: 'ready',
        targetAttachmentId: primary.id,
        generation: nextGeneration,
        editRegion: {
          targetAttachmentId: primary.id,
          source: { kind: 'photoshop-user-layer-mask', documentId: placement.snapshot.documentId, layerId: placement.snapshot.layerId },
          geometry: { sourceBounds: key.sourceBounds, targetSize: key.targetSize, coordinateSpace: 'primary-provider-input' },
          mask: { asset, encoding: 'grayscale-png', bitDepth: 8, polarity: 'white-edit' },
        },
      });
    } catch (error) {
      if (!controller.signal.aborted && nextGeneration === this.generation && primaryKeyMatches(this.currentKey, key)) {
        this.publish(nextGeneration, key, { kind: 'error', targetAttachmentId: primary.id, message: error instanceof Error ? error.message : String(error) });
      }
    }
    return this.state;
  }

  async destroy(): Promise<void> {
    await this.invalidate(undefined, { kind: 'disabled' });
  }

  private async invalidate(key: PrimaryKey | undefined, state: MaskBindingState): Promise<void> {
    this.controller?.abort();
    this.controller = undefined;
    this.generation += 1;
    const asset = this.ownedAsset;
    this.ownedAsset = undefined;
    this.currentKey = key;
    if (asset) await this.release(asset);
    this.setState(state);
  }

  private publish(generation: number, key: PrimaryKey, state: MaskBindingState): void {
    if (generation !== this.generation || !primaryKeyMatches(key, this.currentKey)) return;
    this.setState(state);
  }

  private setState(state: MaskBindingState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  private async release(asset: HostImageAsset): Promise<void> {
    await this.releaseDraftAsset?.(asset);
  }
}
