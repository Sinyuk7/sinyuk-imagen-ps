import type { AppOutputSizePreset } from '../ports/app-generation-settings';
import type { PlacementIntent } from '../domain/photoshop-placement';
import type { UiModelInfo } from './model-info';

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
  | 'enter-prompt';

export interface ComposerReadinessInput {
  readonly running: boolean;
  readonly profilesLoading: boolean;
  readonly profilesError: string | null;
  readonly hasSelectedProfile: boolean;
  readonly modelsLoading: boolean;
  readonly modelsError: string | null;
  readonly selectedModelId: string;
  readonly selectedModel: UiModelInfo | undefined;
  readonly attachmentPreparing: boolean;
  readonly attachmentFailed: boolean;
  readonly operation: ComposerOperation;
  readonly outputSizePreset: AppOutputSizePreset;
  readonly placementIntent: PlacementIntent;
  readonly prompt: string;
}

export interface ComposerReadiness {
  readonly state: ComposerReadinessState;
  readonly canSend: boolean;
}

function modelIsSelectable(model: UiModelInfo | undefined): boolean {
  if (!model) {
    return false;
  }
  return model.configured === true;
}

export function modelSupportsOperation(
  _model: UiModelInfo | undefined,
  _operation: ComposerOperation,
): 'supported' | 'unsupported' | 'unknown' {
  return 'unknown';
}

export function supportedSizePresetsForOperation(
  _model: UiModelInfo | undefined,
  _operation: ComposerOperation,
): readonly AppOutputSizePreset[] | 'unknown' {
  return 'unknown';
}

export function modelSupportsImageInput(model: UiModelInfo | undefined): 'supported' | 'unsupported' | 'unknown' {
  return modelSupportsOperation(model, 'image-edit');
}

export function modelSupportsOutputSize(
  model: UiModelInfo | undefined,
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
  return { state: 'ready', canSend: true };
}
