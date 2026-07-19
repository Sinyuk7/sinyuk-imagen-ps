import type {
  ComfyUiWorkflowValueMutation,
  WorkflowForm,
  WorkflowInputRef,
  WorkflowMapping,
  WorkflowPrimitiveValue,
} from '@imagen-ps/application';
import { composeWorkflowMutations } from '@imagen-ps/application';
import type { ApiFormat, ImageOutputSelection, ProviderProfile } from '@imagen-ps/application';
import type { AppGenerationSettings, AppProviderInputSizePreset } from '../ports/app-generation-settings';
import type { ComposerDraftController } from './hooks/use-composer-draft';
import type { ModelGenerationSettingsController } from './hooks/use-model-generation-settings';
import type { UiModelInfo } from './model-info';

export type GenerationMode = 'provider' | 'comfyui';
export type GenerationSettingsRoute = GenerationMode;

export interface ProviderSubmitIntent {
  readonly backend: 'provider';
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly providerName: string;
  readonly modelId?: string;
  readonly operation: 'image-edit' | 'text-to-image';
  readonly output?: ImageOutputSelection;
  readonly providerInputSizePreset?: AppProviderInputSizePreset;
}

export interface ComfyUiSubmitIntent {
  readonly backend: 'comfyui';
  readonly selectedWorkflowId: string;
  readonly revision: string;
  readonly mappings: Readonly<{ text: WorkflowMapping; image: WorkflowMapping }>;
  readonly formValues: Readonly<Record<string, WorkflowPrimitiveValue>>;
  readonly composer: Readonly<{ prompt: string; attachmentCount: number }>;
  readonly mutations: readonly ComfyUiWorkflowValueMutation[];
  readonly imageInputRef?: WorkflowInputRef;
}

export type GenerationSubmitIntent = ProviderSubmitIntent | ComfyUiSubmitIntent;

export interface GenerationReadinessProjection {
  readonly canSend: boolean;
  readonly state: string;
  readonly message: string;
}

export interface GenerationTargetSummary {
  readonly kind: GenerationMode;
  readonly label: string;
  readonly workflowId?: string;
  readonly remotePath?: string;
  readonly profileId?: string;
  readonly modelId?: string;
}

export interface GenerationComposerViewModel {
  readonly mode: GenerationMode;
  readonly target: GenerationTargetSummary;
  readonly readiness: GenerationReadinessProjection;
  readonly billingVisible: boolean;
  readonly imageInputDisabled: boolean;
  readonly imageInputDisabledReason?: string;
  readonly notices: readonly string[];
  readonly settingsRoute: GenerationSettingsRoute;
  readonly submitIntent?: GenerationSubmitIntent;
  readonly provider?: {
    readonly profiles: readonly ProviderProfile[];
    readonly profilesLoading: boolean;
    readonly profilesError: string | null;
    readonly selectedProfile?: ProviderProfile;
    readonly selectedProfileId: string | null;
    readonly models: readonly UiModelInfo[];
    readonly modelsLoading: boolean;
    readonly modelsError: string | null;
    readonly selectedModelId: string;
    readonly selectedModel?: UiModelInfo;
  };
}

export interface ProviderComposerBuilderInput {
  readonly profiles: readonly ProviderProfile[];
  readonly profilesLoading: boolean;
  readonly profilesError: string | null;
  readonly selectedProfile?: ProviderProfile;
  readonly selectedProfileId: string | null;
  readonly models: readonly UiModelInfo[];
  readonly modelsLoading: boolean;
  readonly modelsError: string | null;
  readonly selectedModelId: string;
  readonly selectedModel?: UiModelInfo;
  readonly operation: 'image-edit' | 'text-to-image';
  readonly readiness: GenerationReadinessProjection;
  readonly imageInputDisabled: boolean;
  readonly imageInputDisabledReason?: string;
  readonly output?: ImageOutputSelection;
  readonly providerInputSizePreset?: AppProviderInputSizePreset;
}

export interface ComfyUiComposerBuilderInput {
  readonly runtime?: {
    readonly identity: { readonly workflowId: string; readonly displayName: string; readonly remotePath: string; readonly revision: string };
    readonly form?: WorkflowForm;
  };
  readonly mapping?: {
    readonly text: { readonly resolved: WorkflowMapping; readonly notice?: string };
    readonly image: { readonly resolved: WorkflowMapping; readonly notice?: string };
  };
  readonly draftValues: Readonly<Record<string, WorkflowPrimitiveValue>>;
  readonly prompt: string;
  readonly attachmentCount: number;
  readonly readiness: GenerationReadinessProjection;
}

/** 构建 Provider 统一 Composer projection；不读取 ComfyUI facts。 */
export function buildProviderComposerViewModel(input: ProviderComposerBuilderInput): GenerationComposerViewModel {
  const target: GenerationTargetSummary = {
    kind: 'provider',
    label: input.selectedProfile?.displayName ?? 'Provider',
    ...(input.selectedProfileId ? { profileId: input.selectedProfileId } : {}),
    ...(input.selectedModelId ? { modelId: input.selectedModelId } : {}),
  };
  const submitIntent = input.selectedProfile === undefined
    ? undefined
    : {
        backend: 'provider' as const,
        profileId: input.selectedProfile.profileId,
        apiFormat: input.selectedProfile.apiFormat,
        providerName: input.selectedProfile.displayName,
        ...(input.selectedModelId ? { modelId: input.selectedModelId } : {}),
        operation: input.operation,
        ...(input.output ? { output: input.output } : {}),
        ...(input.providerInputSizePreset ? { providerInputSizePreset: input.providerInputSizePreset } : {}),
      };
  return {
    mode: 'provider',
    target,
    readiness: input.readiness,
    billingVisible: true,
    imageInputDisabled: input.imageInputDisabled,
    ...(input.imageInputDisabledReason ? { imageInputDisabledReason: input.imageInputDisabledReason } : {}),
    notices: [],
    settingsRoute: 'provider',
    ...(submitIntent ? { submitIntent } : {}),
    provider: {
      profiles: input.profiles,
      profilesLoading: input.profilesLoading,
      profilesError: input.profilesError,
      ...(input.selectedProfile ? { selectedProfile: input.selectedProfile } : {}),
      selectedProfileId: input.selectedProfileId,
      models: input.models,
      modelsLoading: input.modelsLoading,
      modelsError: input.modelsError,
      selectedModelId: input.selectedModelId,
      ...(input.selectedModel ? { selectedModel: input.selectedModel } : {}),
    },
  };
}

/** 构建 ComfyUI product projection；不暴露 format/source/capability/connection facts。 */
export function buildComfyUiComposerViewModel(input: ComfyUiComposerBuilderInput): GenerationComposerViewModel {
  const runtime = input.runtime;
  const target: GenerationTargetSummary = {
    kind: 'comfyui',
    label: runtime?.identity.displayName ?? 'ComfyUI Workflow',
    ...(runtime ? {
      workflowId: runtime.identity.workflowId,
      remotePath: runtime.identity.remotePath,
    } : {}),
  };
  const notices = [input.mapping?.text.notice, input.mapping?.image.notice].filter((value): value is string => Boolean(value));
  const submitIntent = runtime
    ? {
        backend: 'comfyui' as const,
        selectedWorkflowId: runtime.identity.workflowId,
        revision: runtime.identity.revision,
        mappings: {
          text: input.mapping?.text.resolved ?? null,
          image: input.mapping?.image.resolved ?? null,
        },
        formValues: input.draftValues,
        composer: { prompt: input.prompt, attachmentCount: input.attachmentCount },
        mutations: input.runtime.form
          ? composeWorkflowMutations({
              form: input.runtime.form,
              draft: input.draftValues,
              mapping: {
                text: input.mapping?.text.resolved ?? null,
                image: input.mapping?.image.resolved ?? null,
              },
              composer: { prompt: input.prompt },
            })
          : [],
        ...(input.mapping?.image.resolved ? { imageInputRef: input.mapping.image.resolved } : {}),
      }
    : undefined;
  return {
    mode: 'comfyui',
    target,
    readiness: input.readiness,
    billingVisible: false,
    imageInputDisabled: false,
    notices,
    settingsRoute: 'comfyui',
    ...(submitIntent ? { submitIntent } : {}),
  };
}

export interface GenerationWorkspaceController {
  readonly generationMode: GenerationMode;
  readonly settingsRoute: GenerationSettingsRoute;
  readonly composerDraft: ComposerDraftController;
  readonly providerSettings: {
    readonly generation: AppGenerationSettings;
    readonly model: ModelGenerationSettingsController;
  };
  readonly viewModel: GenerationComposerViewModel;
  readonly setGenerationMode: (mode: GenerationMode) => void;
  readonly setSettingsRoute: (route: GenerationSettingsRoute) => void;
  readonly setAttachmentPreparing: (preparing: boolean) => void;
  readonly send: (prompt: string) => Promise<boolean>;
  readonly selectProfile: (profileId: string | null) => Promise<void>;
  readonly selectModel: (modelId: string) => void;
}
