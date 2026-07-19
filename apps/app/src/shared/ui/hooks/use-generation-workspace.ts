import { useCallback, useMemo, useState } from 'react';
import type { ProviderProfile, WorkflowMappingProjection } from '@imagen-ps/application';
import type { ComfyUiManagementController } from './use-comfyui-management';
import type { ConversationController } from './use-conversation';
import { derivePlacementIntent, type ConversationAttachment } from './use-conversation';
import type { ComposerDraftController } from './use-composer-draft';
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

function readinessMessage(messages: ReturnType<typeof useI18n>['messages'], state: ComposerReadinessState): string {
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
  const { input, attachments, operation } = composerDraft;
  const selectedModel = options.models.find((model) => model.id === options.selectedModelId);
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
    canSend: providerReadiness.canSend,
    state: providerReadiness.state,
    message: readinessMessage(t, providerReadiness.state),
  };
  const comfyReady = Boolean(options.comfyUi.runtime) && !attachmentPreparing;
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
  const send = useCallback(async (prompt: string): Promise<boolean> => {
    const intent = viewModel.submitIntent;
    if (!intent || !viewModel.readiness.canSend) return false;
    if (intent.backend === 'provider') {
      return options.conversation.submit({
        operation: intent.operation,
        prompt,
        providerName: intent.providerName,
        profileId: intent.profileId,
        apiFormat: intent.apiFormat,
        ...(intent.modelId ? { modelId: intent.modelId } : {}),
        attachments,
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
      revision: intent.revision,
      formValues: intent.formValues,
      mappings: intent.mappings,
      mutations: intent.mutations,
      ...(intent.imageInputRef ? { imageInputRef: intent.imageInputRef } : {}),
      executionAttachments: intent.mappings.image ? attachments.slice(0, 1) : [],
      onPrepared: () => composerDraft.reset({ releaseAttachments: false }),
    });
  }, [attachments, composerDraft, options, viewModel]);

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
    send,
    selectProfile,
    selectModel,
  };
}
