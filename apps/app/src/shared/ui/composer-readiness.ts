import type { ProviderModelInfo } from '@imagen-ps/application';
import type { AppOutputSizePreset } from '../ports/app-generation-settings';
import type { PlacementIntent } from '../domain/photoshop-placement';

export type ComposerOperation = 'text-to-image' | 'image-edit';

export type ComposerReadinessState =
  | 'ready'
  | 'generation-in-progress'
  | 'select-profile'
  | 'checking-profile'
  | 'profile-load-failed'
  | 'select-model'
  | 'loading-models'
  | 'model-unavailable'
  | 'preparing-attachment'
  | 'attachment-failed'
  | 'model-does-not-support-image-edit'
  | 'model-does-not-support-text-to-image'
  | 'size-unsupported'
  | 'resolve-placement-conflict'
  | 'enter-prompt'
  | 'optimizing-prompt';

export interface ComposerReadinessInput {
  readonly running: boolean;
  readonly profilesLoading: boolean;
  readonly profilesError: string | null;
  readonly hasSelectedProfile: boolean;
  readonly modelsLoading: boolean;
  readonly modelsError: string | null;
  readonly selectedModelId: string;
  readonly selectedModel: ProviderModelInfo | undefined;
  readonly attachmentPreparing: boolean;
  readonly attachmentFailed: boolean;
  readonly operation: ComposerOperation;
  readonly outputSizePreset: AppOutputSizePreset;
  readonly placementIntent: PlacementIntent;
  readonly prompt: string;
  readonly optimizing: boolean;
}

export interface ComposerReadiness {
  readonly state: ComposerReadinessState;
  readonly canSend: boolean;
}

function modelIsSelectable(model: ProviderModelInfo | undefined): boolean {
  if (!model) {
    return false;
  }
  return model.supportStatus === undefined || model.supportStatus === 'selectable';
}

function operationCapability(model: ProviderModelInfo | undefined, operation: ComposerOperation) {
  return operation === 'image-edit'
    ? model?.capabilities?.operations.imageEdit
    : model?.capabilities?.operations.textToImage;
}

export function modelSupportsOperation(
  model: ProviderModelInfo | undefined,
  operation: ComposerOperation,
): 'supported' | 'unsupported' | 'unknown' {
  return operationCapability(model, operation)?.support ?? 'unknown';
}

export function supportedSizePresetsForOperation(
  model: ProviderModelInfo | undefined,
  operation: ComposerOperation,
): readonly AppOutputSizePreset[] | 'unknown' {
  const presets = operationCapability(model, operation)?.sizePresets;
  return presets === undefined ? 'unknown' : presets;
}

export function modelSupportsImageInput(model: ProviderModelInfo | undefined): 'supported' | 'unsupported' | 'unknown' {
  return modelSupportsOperation(model, 'image-edit');
}

export function modelSupportsOutputSize(
  model: ProviderModelInfo | undefined,
  operation: ComposerOperation,
  outputSizePreset: AppOutputSizePreset,
): 'supported' | 'unsupported' | 'unknown' {
  const presets = supportedSizePresetsForOperation(model, operation);
  if (presets === 'unknown') {
    return 'unknown';
  }
  return presets.includes(outputSizePreset) ? 'supported' : 'unsupported';
}

/** 按产品定义的单一阻塞优先级推导 composer readiness。 */
export function deriveComposerReadiness(input: ComposerReadinessInput): ComposerReadiness {
  if (input.running) {
    return { state: 'generation-in-progress', canSend: false };
  }
  if (input.profilesError) {
    return { state: 'profile-load-failed', canSend: false };
  }
  if (input.profilesLoading) {
    return { state: 'checking-profile', canSend: false };
  }
  if (!input.hasSelectedProfile) {
    return { state: 'select-profile', canSend: false };
  }
  if (input.modelsError) {
    return { state: 'model-unavailable', canSend: false };
  }
  if (input.modelsLoading) {
    return { state: 'loading-models', canSend: false };
  }
  if (input.selectedModelId.trim().length === 0) {
    return { state: 'select-model', canSend: false };
  }
  if (!modelIsSelectable(input.selectedModel)) {
    return { state: 'model-unavailable', canSend: false };
  }
  if (input.attachmentPreparing) {
    return { state: 'preparing-attachment', canSend: false };
  }
  if (input.attachmentFailed) {
    return { state: 'attachment-failed', canSend: false };
  }

  const operationSupport = modelSupportsOperation(input.selectedModel, input.operation);
  if (operationSupport === 'unsupported') {
    return {
      state: input.operation === 'image-edit'
        ? 'model-does-not-support-image-edit'
        : 'model-does-not-support-text-to-image',
      canSend: false,
    };
  }

  if (modelSupportsOutputSize(input.selectedModel, input.operation, input.outputSizePreset) === 'unsupported') {
    return { state: 'size-unsupported', canSend: false };
  }
  if (input.placementIntent.kind === 'unbound' && input.placementIntent.reason === 'multiple-documents') {
    return { state: 'resolve-placement-conflict', canSend: false };
  }
  if (input.prompt.trim().length === 0) {
    return { state: 'enter-prompt', canSend: false };
  }
  if (input.optimizing) {
    return { state: 'optimizing-prompt', canSend: false };
  }
  return { state: 'ready', canSend: true };
}
