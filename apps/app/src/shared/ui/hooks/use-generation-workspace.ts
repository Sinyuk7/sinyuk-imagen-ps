import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveProviderMaskExecutionPlan,
  type MaskExecutionPlan,
  type ProviderProfile,
  type WorkflowMappingProjection,
} from '@imagen-ps/application';
import type { ComfyUiManagementController } from './use-comfyui-management';
import type { ConversationController } from './use-conversation';
import { derivePlacementIntent, type ConversationAttachment } from './use-conversation';
import type { ComposerDraftController } from './use-composer-draft';
import { MaskCoordinator, type MaskCoordinatorAttachment } from '../../domain/mask-coordinator';
import type { MaskBindingState, MaskPreference } from '../../domain/edit-region';
import type { MaskCoordinatorPort } from '../../domain/mask-coordinator';
import { useI18n } from '../i18n/i18n-context';
import {
  buildComfyUiComposerViewModel,
  buildProviderComposerViewModel,
  type GenerationMode,
  type GenerationSettingsRoute,
  type GenerationWorkspaceController,
  type GenerationReadinessProjection,
} from '../generation-workspace';
import type { UiModelInfo } from '../model-info';
import type { ModelGenerationSettingsController } from './use-model-generation-settings';
import type { GenerationSettingsState } from './use-generation-settings';
import {
  deriveComposerReadiness,
  modelSupportsImageInput,
  type ComposerReadinessState,
} from '../composer-readiness';

export interface GenerationWorkspaceOptions {
  readonly host: MaskCoordinatorPort & { releaseDraftAsset(asset: import('../../domain/host-image-asset').HostImageAsset): Promise<void> };
  readonly conversation: ConversationController;
  readonly composerDraft: ComposerDraftController;
  readonly comfyUi: ComfyUiManagementController;
  readonly profiles: readonly ProviderProfile[];
  readonly profilesLoading: boolean;
  readonly profilesError: string | null;
  readonly selectedProfile?: ProviderProfile;
  readonly selectedProfileId: string | null;
  readonly selectProfile: (profileId: string | null) => Promise<void>;
  readonly models: readonly UiModelInfo[];
  readonly modelsLoading: boolean;
  readonly modelsError: string | null;
  readonly selectedModelId: string;
  readonly selectModel: (modelId: string) => void;
  readonly generationSettings: GenerationSettingsState;
  readonly modelGenerationSettings: ModelGenerationSettingsController;
}

/** Composer 只在当前 execution target 能消费 canonical Mask 时启用开关。 */
export function isMaskToggleDisabled(input: {
  readonly hasPhotoshopPrimary: boolean;
  readonly mode: GenerationMode;
  readonly providerPlan: MaskExecutionPlan;
}): boolean {
  return !input.hasPhotoshopPrimary
    || (input.mode === 'provider' && input.providerPlan.kind !== 'provider-native');
}

function readinessMessage(messages: ReturnType<typeof useI18n>['messages'], state: ComposerReadinessState | 'mask-loading' | 'mask-error'): string {
  switch (state) {
    case 'ready': return messages.main.readinessReady;
    case 'select-profile': return messages.main.readinessSelectProfile;
    case 'checking-profile': return messages.main.readinessCheckingProfile;
    case 'profile-load-failed': return messages.main.readinessProfileLoadFailed;
    case 'select-model': return messages.main.readinessSelectModel;
    case 'loading-models': return messages.main.readinessLoadingModels;
    case 'model-unavailable': return messages.main.readinessModelUnavailable;
    case 'preparing-attachment': return messages.main.readinessPreparingAttachment;
    case 'attachment-failed': return messages.main.readinessAttachmentFailed;
    case 'model-does-not-support-image-edit': return messages.main.readinessModelNoImageEdit;
    case 'model-does-not-support-text-to-image': return messages.main.readinessModelNoTextToImage;
    case 'size-unsupported': return messages.main.readinessSizeUnsupported;
    case 'resolve-placement-conflict': return messages.main.readinessPlacementConflict;
    case 'enter-prompt': return messages.main.readinessEnterPrompt;
    case 'mask-loading': return messages.main.maskLoading;
    case 'mask-error': return messages.main.maskError;
  }
}

function comfyReadiness(messages: ReturnType<typeof useI18n>['messages'], ready: boolean, hasRuntime: boolean): GenerationReadinessProjection {
  return {
    canSend: ready,
    state: ready ? 'ready' : 'target-unavailable',
    message: ready
      ? messages.common.ready
      : hasRuntime ? messages.settings.comfyUiReadinessBridge : messages.settings.comfyUiSelectWorkflow,
  };
}

function mappingForComposer(mapping: WorkflowMappingProjection | undefined, attachments: readonly ConversationAttachment[], prompt: string): WorkflowMappingProjection | undefined {
  if (!mapping) return undefined;
  const textNotice = mapping.textCandidates.length === 0 && prompt.trim()
    ? '此 Workflow 不使用当前提示词'
    : undefined;
  const imageNotice = mapping.imageCandidates.length === 0 && attachments.length > 0
    ? '此 Workflow 未识别到图片输入，附件不会发送'
    : mapping.image.resolved !== null && attachments.length > 1
      ? '此 Workflow 仅使用第一张附件'
      : undefined;
  return {
    ...mapping,
    text: { resolved: mapping.text.resolved, ambiguous: mapping.text.ambiguous, ...(textNotice ? { notice: textNotice } : {}) },
    image: { resolved: mapping.image.resolved, ambiguous: mapping.image.ambiguous, ...(imageNotice ? { notice: imageNotice } : {}) },
    showSection: mapping.showSection
      || textNotice !== undefined
      || imageNotice !== undefined,
  };
}

/** AppShell 唯一 Generation Workspace state owner。 */
export function useGenerationWorkspace(options: GenerationWorkspaceOptions): GenerationWorkspaceController {
  const { messages: t } = useI18n();
  const composerDraft = options.composerDraft;
  const [generationMode, setGenerationMode] = useState<GenerationMode>(options.comfyUi.runtime ? 'comfyui' : 'provider');
  const [settingsRoute, setSettingsRoute] = useState<GenerationSettingsRoute>(generationMode);
  const [attachmentPreparing, setAttachmentPreparing] = useState(false);
  const [maskPreference, setMaskPreference] = useState<MaskPreference>({ enabled: false });
  const [maskState, setMaskState] = useState<MaskBindingState>({ kind: 'disabled' });
  const maskCoordinatorRef = useRef<MaskCoordinator | undefined>(undefined);
  if (!maskCoordinatorRef.current) {
    maskCoordinatorRef.current = new MaskCoordinator({
      host: options.host,
      releaseDraftAsset: options.host.releaseDraftAsset,
      onStateChange: setMaskState,
    });
  }
  const maskCoordinator = maskCoordinatorRef.current;
  const { input, attachments, operation } = composerDraft;
  const selectedModel = options.models.find((model) => model.id === options.selectedModelId);
  const photoshopPrimary = attachments[0]?.photoshopPlacement !== undefined;
  const providerMaskPlan = options.selectedProfile && selectedModel
    ? resolveProviderMaskExecutionPlan({
        apiFormat: options.selectedProfile.apiFormat,
        capabilityModelId: selectedModel.id,
        hasReadyMask: true,
      })
    : { kind: 'unsupported' as const, reason: 'no-selected-provider-target' };
  const providerMaskSupported = providerMaskPlan.kind === 'provider-native';
  const maskToggleDisabled = isMaskToggleDisabled({
    hasPhotoshopPrimary: photoshopPrimary,
    mode: generationMode,
    providerPlan: providerMaskPlan,
  });
  const effectiveMaskPreference = useMemo(() => ({
    enabled: maskPreference.enabled
      && (generationMode !== 'provider' || providerMaskSupported),
  } as const), [generationMode, maskPreference.enabled, providerMaskSupported]);
  const maskAttachments = useMemo<readonly MaskCoordinatorAttachment[]>(() => attachments.map((attachment) => ({
    id: attachment.id,
    image: attachment.image,
    ...(attachment.photoshopPlacement ? { photoshopPlacement: attachment.photoshopPlacement } : {}),
    ...(attachment.mask ? { selectionMask: attachment.mask } : {}),
  })), [attachments]);

  useEffect(() => {
    void maskCoordinator.reconcile(maskAttachments, effectiveMaskPreference);
  }, [effectiveMaskPreference, maskAttachments, maskCoordinator]);

  useEffect(() => () => {
    void maskCoordinator.destroy();
  }, [maskCoordinator]);
  const maskBlocksSubmit = photoshopPrimary
    && effectiveMaskPreference.enabled
    && (maskState.kind === 'loading' || maskState.kind === 'error');
  const placementIntent = useMemo(
    () => derivePlacementIntent(attachments, generationMode === 'comfyui' ? undefined : options.modelGenerationSettings.outputSelection ?? undefined),
    [attachments, generationMode, options.modelGenerationSettings.outputSelection],
  );
  const providerReadiness = deriveComposerReadiness({
    profilesLoading: options.profilesLoading,
    profilesError: options.profilesError,
    hasSelectedProfile: Boolean(options.selectedProfile),
    modelsLoading: options.modelsLoading,
    modelsError: options.modelsError,
    selectedModelId: options.selectedModelId,
    selectedModel,
    attachmentPreparing,
    attachmentFailed: false,
    operation,
    outputSettingsLoading: options.modelGenerationSettings.loading,
    hasOutputMatrix: options.modelGenerationSettings.ready,
    placementIntent,
    prompt: input,
  });
  const providerReadinessProjection: GenerationReadinessProjection = {
    canSend: providerReadiness.canSend && !maskBlocksSubmit,
    state: maskBlocksSubmit ? (maskState.kind === 'loading' ? 'mask-loading' : 'mask-error') : providerReadiness.state,
    message: readinessMessage(t, maskBlocksSubmit ? (maskState.kind === 'loading' ? 'mask-loading' : 'mask-error') : providerReadiness.state),
  };
  const comfyReady = Boolean(options.comfyUi.runtime) && !attachmentPreparing && !maskBlocksSubmit;
  const comfyMapping = mappingForComposer(options.comfyUi.mappingProjection, attachments, input);
  const viewModel = generationMode === 'provider'
    ? buildProviderComposerViewModel({
        profiles: options.profiles,
        profilesLoading: options.profilesLoading,
        profilesError: options.profilesError,
        ...(options.selectedProfile ? { selectedProfile: options.selectedProfile } : {}),
        selectedProfileId: options.selectedProfileId,
        models: options.models,
        modelsLoading: options.modelsLoading,
        modelsError: options.modelsError,
        selectedModelId: options.selectedModelId,
        ...(selectedModel ? { selectedModel } : {}),
        operation,
        readiness: providerReadinessProjection,
        imageInputDisabled: modelSupportsImageInput(selectedModel) === 'unsupported',
        imageInputDisabledReason: t.main.imageInputDisabledForModel,
        ...(options.modelGenerationSettings.outputSelection ? { output: options.modelGenerationSettings.outputSelection } : {}),
        providerInputSizePreset: options.generationSettings.settings.providerInputSizePreset,
      })
      : buildComfyUiComposerViewModel({
        ...(options.comfyUi.runtime ? { runtime: options.comfyUi.runtime } : {}),
        ...(comfyMapping ? { mapping: comfyMapping } : {}),
        draftValues: options.comfyUi.draftValues,
        prompt: input,
        attachmentCount: attachments.length,
        readiness: comfyReadiness(t, comfyReady, Boolean(options.comfyUi.runtime)),
      });

  const setMode = useCallback((mode: GenerationMode) => {
    setGenerationMode(mode);
    setSettingsRoute(mode);
  }, []);
  const selectProfile = useCallback(async (profileId: string | null) => {
    await options.selectProfile(profileId);
  }, [options]);
  const selectModel = useCallback((modelId: string) => options.selectModel(modelId), [options]);
  const setMaskEnabled = useCallback((enabled: boolean) => setMaskPreference({ enabled }), []);
  const retryMask = useCallback(() => {
    void maskCoordinator.reconcile(maskAttachments, effectiveMaskPreference);
  }, [effectiveMaskPreference, maskAttachments, maskCoordinator]);
  const send = useCallback(async (prompt: string): Promise<boolean> => {
    const intent = viewModel.submitIntent;
    if (!intent || !viewModel.readiness.canSend || maskBlocksSubmit) return false;
    const editRegion = maskState.kind === 'ready' && (intent.backend !== 'provider' || providerMaskSupported)
      ? maskState.editRegion
      : undefined;
    if (intent.backend === 'provider') {
      return options.conversation.submit({
        operation: intent.operation,
        prompt,
        providerName: intent.providerName,
        profileId: intent.profileId,
        apiFormat: intent.apiFormat,
        ...(intent.modelId ? { modelId: intent.modelId } : {}),
        attachments,
        ...(editRegion ? { editRegion } : {}),
        ...(intent.output ? { output: { count: 1, selection: intent.output } } : {}),
        ...(intent.providerInputSizePreset ? { providerInputSizePreset: intent.providerInputSizePreset } : {}),
        onPrepared: () => composerDraft.reset({ releaseAttachments: false }),
      });
    }
    const workflow = options.comfyUi.runtime;
    if (!workflow) return false;
    const state = await options.comfyUi.loadState();
    if (!state?.baseUrl) return false;
    return options.conversation.submit({
      backendId: 'comfyui',
      operation: attachments.length > 0 ? 'image-edit' : 'text-to-image',
      prompt,
      providerName: 'ComfyUI',
      selectedWorkflowId: intent.selectedWorkflowId,
      workflowName: workflow.identity.displayName,
      attachments,
      ...(editRegion ? { editRegion } : {}),
      revision: intent.revision,
      formValues: intent.formValues,
      mappings: intent.mappings,
      mutations: intent.mutations,
      ...(intent.imageInputRef ? { imageInputRef: intent.imageInputRef } : {}),
      ...(intent.maskBinding ? { maskBinding: intent.maskBinding } : {}),
      executionAttachments: intent.mappings.image ? attachments.slice(0, 1) : [],
      onPrepared: () => composerDraft.reset({ releaseAttachments: false }),
    });
  }, [attachments, composerDraft, maskBlocksSubmit, maskState, options, providerMaskSupported, viewModel]);

  return {
    generationMode,
    settingsRoute,
    composerDraft,
    providerSettings: {
      generation: options.generationSettings.settings,
      model: options.modelGenerationSettings,
    },
    viewModel,
    setGenerationMode: setMode,
    setSettingsRoute,
    setAttachmentPreparing,
    maskPreference,
    maskState,
    maskToggleDisabled,
    setMaskEnabled,
    retryMask,
    send,
    selectProfile,
    selectModel,
  };
}
