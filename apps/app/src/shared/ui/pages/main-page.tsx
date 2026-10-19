import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useAppServices } from '../../ports/app-services-context';
import type { HostPort, LayerInfo } from '../../ports/host-port';
import { suggestedGeneratedImageFileName } from '../../domain/asset-file';
import { assetToPreview } from '../../domain/mappers';
import type {
  ConversationAttachment,
  ConversationController,
  ConversationRound,
} from '../hooks/use-conversation';
import { useLayerThumbnail } from '../hooks/use-layer-thumbnail';
import { useI18n } from '../i18n/i18n-context';
import type { ProviderInputSizePolicy } from '../../image/resize';
import {
  providerInputSizePresetToMaxSide,
  type AppGenerationSettings,
} from '../../ports/app-generation-settings';
import { MOTION_FEEDBACK_DWELL } from '../motion';
import {
  modelSupportsOperation,
  type ComposerOperation,
} from '../composer-readiness';
import { classifyRoundError, type ErrorPrimaryAction } from '../error-action';
import { comfyUiExecutionNodeLabel } from '../comfyui-execution-error';
import type { ImageOutputSelection } from '@imagen-ps/application';
import { configurationInstanceLabel, type UiModelInfo } from '../model-info';
import type { GenerationWorkspaceController } from '../generation-workspace';
import type { PromptSettings } from '../../ports/prompt-settings';
import { assemblePromptTemplate, promptTemplateNeedsInput } from '../../ports/prompt-settings';
import { Button, ComposerParameterField, ComposerSelect, Divider, HelpText, Icon, IconButton, ImageFallbackContent, imageFallbackTitle, List, ListStateItem, MotionActivityDot, MotionActivityIcon, MotionButtonSurface, MotionContent, MotionDimSurface, MotionHighlight, MotionImage, MotionPresenceView, PageFrame, PageHeader, PageScroll, PageState, ProviderIdentity, ProviderMediaHeader, UxpTextArea, type UxpTextAreaElement, useToast } from '../ui-system';
import { composerConfigurationSummaryParts, composerRatioChoices, composerSizeChoices, projectComposerRatioSize, resolveComposerRatioSizeSource } from '../composer-parameter-presentation';

function isImeCompositionKey(event: React.KeyboardEvent): boolean {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { readonly isComposing?: boolean };
  return nativeEvent.isComposing === true || nativeEvent.keyCode === 229;
}

function optionLabel<T extends string>(options: ReadonlyArray<{ readonly id: T; readonly label: string }>, id: T): string {
  return options.find((option) => option.id === id)?.label ?? id.toUpperCase();
}

function attachmentPreviewFields(image: ConversationAttachment['image']): Pick<ConversationAttachment, 'previewUrl' | 'previewFallback'> {
  if (image.preview.url) {
    return { previewUrl: image.preview.url };
  }
  const preview = assetToPreview(image.asset);
  return {
    previewUrl: preview.url,
    ...(preview.fallback ? { previewFallback: preview.fallback } : {}),
  };
}

interface MainPageProps {
  readonly onNav: (view: string) => void;
  readonly workspace: GenerationWorkspaceController;
  readonly layers: readonly LayerInfo[];
  readonly layersError: string | null;
  readonly layersLoading: boolean;
  readonly reloadLayers: () => Promise<void>;
  readonly conversation: ConversationController;
  readonly promptSettings: PromptSettings;
  readonly onSelectPromptTemplate: (templateId: string) => void;
  readonly highlightedRoundId?: string | null;
  readonly onEditProfile?: (providerId: string) => void;
  readonly restoreFailedRoundId?: string | null;
  readonly onFailedRoundRestored?: (roundId: string) => void;
}

type PlaceStatus = 'idle' | 'placing' | 'placed';

interface FlatLayer {
  readonly layer: LayerInfo;
  readonly depth: number;
}

function flattenLayers(layers: readonly LayerInfo[], depth = 0): FlatLayer[] {
  return layers.flatMap((layer) => [
    { layer, depth },
    ...flattenLayers(layer.children ?? [], depth + 1),
  ]);
}

function LayerThumbnailImpl({
  host,
  layerId,
  visible,
}: {
  readonly host: HostPort;
  readonly layerId: number;
  readonly visible?: boolean;
}) {
  const { url, ref } = useLayerThumbnail(host, layerId);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    setLoaded(false);
    if (imgRef.current?.complete) {
      setLoaded(true);
    }
  }, [url]);

  return (
    <div
      ref={ref}
      className="layer-thumb"
      data-visible={visible === false ? 'false' : 'true'}
    >
      {url ? (
        <img
          ref={imgRef}
          src={url}
          className={`layer-thumb-img${loaded ? ' layer-thumb-img-loaded' : ''}`}
          alt=""
          onLoad={() => setLoaded(true)}
        />
      ) : null}
    </div>
  );
}

const LayerThumbnail = memo(LayerThumbnailImpl);

function statusDot(status: ConversationRound['status']): 'ok' | 'run' | 'err' {
  return status === 'ok' ? 'ok' : status === 'running' ? 'run' : 'err';
}

function attachmentId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function requestIdCopyKey(roundId: string): string {
  return `error-request:${roundId}`;
}

function dedupeById(models: readonly UiModelInfo[]): readonly UiModelInfo[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) {
      return false;
    }
    seen.add(model.id);
    return true;
  });
}

function modelIsSelectable(model: UiModelInfo | undefined): boolean {
  if (!model) {
    return false;
  }
  return model.configured === true;
}

function modelAvailabilityReason(_model: UiModelInfo | undefined, _t: ReturnType<typeof useI18n>['messages']): string | null {
  return null;
}

function modelCapabilityReason(
  model: UiModelInfo | undefined,
  operation: ComposerOperation,
  t: ReturnType<typeof useI18n>['messages'],
): string | null {
  const operationSupport = modelSupportsOperation(model, operation);
  if (operationSupport === 'unsupported') {
    return operation === 'image-edit'
      ? t.main.modelReasonNoImageEdit
      : t.main.modelReasonNoTextToImage;
  }
  return null;
}

function primaryActionLabel(t: ReturnType<typeof useI18n>['messages'], action: ErrorPrimaryAction): string {
  switch (action) {
    case 'open-provider-settings':
      return t.main.errorActionOpenProviderSettings;
    case 'choose-supported-size':
      return t.main.errorActionChooseSupportedSize;
    case 'choose-compatible-model':
      return t.main.errorActionChooseCompatibleModel;
    case 'replace-image':
      return t.main.errorActionReplaceImage;
    case 'copy-error-details':
      return t.main.errorActionCopyDetails;
    case 'fill-composer-from-failed-round':
      return t.main.errorActionFillComposer;
  }
}

function errorDisplayMessage(
  t: ReturnType<typeof useI18n>['messages'],
  failure: ReturnType<typeof classifyRoundError>,
): string {
  if (failure.category === 'provider-protocol-incompatible') {
    return t.main.errorMessageProviderProtocolIncompatible;
  }
  return failure.message;
}

function placementButtonState(intent: ConversationRound['placementIntent'], status: PlaceStatus | undefined, t: ReturnType<typeof useI18n>['messages']): {
  readonly label: string;
  readonly title: string;
  readonly disabled: boolean;
} {
  if (status === 'placing') {
    return { label: t.main.placingPs, title: t.main.placingPs, disabled: true };
  }
  if (status === 'placed') {
    return { label: t.main.placedPs, title: t.main.placedPs, disabled: false };
  }
  if (intent.kind === 'unbound' && intent.reason === 'multiple-documents') {
    return { label: t.main.cannotPlace, title: t.main.placementMultipleDocuments, disabled: true };
  }
  if (intent.kind === 'unbound') {
    return { label: t.main.placeActiveDocument, title: t.main.placementActiveDocumentHint, disabled: false };
  }
  if (intent.kind === 'exact-frame') {
    return { label: t.main.placePsShort, title: t.main.placementExactFrameHint, disabled: false };
  }
  return { label: t.main.placePsShort, title: t.main.placementDocumentOnlyHint, disabled: false };
}

function findRoundElement(container: HTMLElement, roundId: string): HTMLElement | null {
  return container.querySelector(`[data-round-id="${roundId}"]`);
}

type PreviewLayoutMode = 'intrinsic' | 'tall-contain' | 'fallback';
type PreviewVisualMode = 'full-bleed' | 'contained-well';

const PREVIEW_MAX_PORTRAIT_RATIO = 2 / 3;

function parseDimensionRatio(width: number, height: number): number | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return undefined;
  }
  return width / height;
}

function parseAspectRatioValue(aspectRatio: string): number | undefined {
  const match = aspectRatio.match(/^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/);
  if (!match) {
    return undefined;
  }
  return parseDimensionRatio(Number(match[1]), Number(match[2]));
}

function previewRatioFromSelection(selection: ImageOutputSelection | undefined): number | undefined {
  if (!selection) {
    return undefined;
  }
  switch (selection.geometry.kind) {
    case 'pixels': {
      return parseDimensionRatio(selection.geometry.width, selection.geometry.height);
    }
    case 'ratio-resolution': {
      return parseAspectRatioValue(selection.geometry.aspectRatio);
    }
    default:
      return undefined;
  }
}

function previewRatioFromOutputSize(size: string | undefined): number | undefined {
  const match = size?.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) {
    return undefined;
  }
  return parseDimensionRatio(Number(match[1]), Number(match[2]));
}

function previewRatioForRound(round: Pick<ConversationRound, 'output' | 'outputSize'>): number | undefined {
  return previewRatioFromSelection(round.output?.selection) ?? previewRatioFromOutputSize(round.outputSize);
}

export function previewLayoutModeForRound(round: Pick<ConversationRound, 'output' | 'outputSize'>): PreviewLayoutMode {
  const ratio = previewRatioForRound(round);
  if (ratio === undefined) {
    return 'fallback';
  }
  return ratio < PREVIEW_MAX_PORTRAIT_RATIO ? 'tall-contain' : 'intrinsic';
}

function layoutModeForRatio(ratio: number | undefined): PreviewLayoutMode {
  if (ratio === undefined) {
    return 'fallback';
  }
  return ratio < PREVIEW_MAX_PORTRAIT_RATIO ? 'tall-contain' : 'intrinsic';
}

function previewVisualModeForRender(layoutMode: PreviewLayoutMode, hasPreview: boolean): PreviewVisualMode {
  return layoutMode === 'intrinsic' && hasPreview ? 'full-bleed' : 'contained-well';
}

function ImageResultStage({
  roundId,
  previewIndex,
  preview,
  requestedLayout,
  fallbackTitle,
  children,
}: {
  readonly roundId: string;
  readonly previewIndex: number;
  readonly preview: ConversationRound['previews'][number] | undefined;
  readonly requestedLayout: PreviewLayoutMode;
  readonly fallbackTitle: string;
  readonly children?: ReactNode;
}) {
  const [actualPreviewLayout, setActualPreviewLayout] = useState<{ key: string; mode: PreviewLayoutMode } | null>(null);
  const previewKey = `${roundId}:${previewIndex}:${preview?.url ?? ''}`;
  const previewLayout = actualPreviewLayout?.key === previewKey ? actualPreviewLayout.mode : requestedLayout;
  const visualMode = previewVisualModeForRender(previewLayout, Boolean(preview?.url));

  return (
    <div
      className="img-result"
      data-testid={`result-preview-${roundId}`}
      data-preview-index={previewIndex}
      data-preview-layout={previewLayout}
      data-preview-visual-mode={visualMode}
      data-has-preview={preview?.url ? 'true' : 'false'}
    >
      <div className="img-stage">
        {preview?.url ? (
          <div className="img-frame" data-alpha-state={preview.transparencyState}>
            <MotionImage
              key={previewKey}
              src={preview.url}
              className="img-media"
              alt={preview.label}
              onLoad={(image) => {
                const nextMode = layoutModeForRatio(parseDimensionRatio(image.naturalWidth, image.naturalHeight));
                setActualPreviewLayout((current) => (
                  current?.key === previewKey && current.mode === nextMode
                    ? current
                    : { key: previewKey, mode: nextMode }
                ));
              }}
            />
          </div>
        ) : (
          <div className="img-frame img-frame-placeholder" data-alpha-state="unknown">
            <ImageFallbackContent density="preview-frame" state={preview?.fallback?.state ?? 'preview-unavailable'} title={fallbackTitle} />
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function providerInputPolicy(settings: AppGenerationSettings): ProviderInputSizePolicy {
  const maxSide = providerInputSizePresetToMaxSide(settings.providerInputSizePreset);
  return {
    maxSide,
  };
}

function isLocalFileNormalizationError(error: unknown): boolean {
  return error instanceof Error && error.message.includes('Local image requires provider input normalization');
}

export function MainPage({
  onNav,
  workspace,
  layers,
  layersError,
  layersLoading,
  reloadLayers,
  conversation,
  promptSettings,
  onSelectPromptTemplate,
  highlightedRoundId,
  onEditProfile,
  restoreFailedRoundId,
  onFailedRoundRestored,
}: MainPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [providerMenuOpen, setProfileMenuOpen] = useState(false);
  const [promptTemplateMenuOpen, setPromptTemplateMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<'model' | 'prompt-template' | 'ratio' | 'size' | `catalog:${string}` | null>(null);
  const [advancedParametersOpen, setAdvancedParametersOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [captureInFlight, setCaptureInFlight] = useState(false);
  const { show } = useToast();
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [selectedPreviewIndexes, setSelectedPreviewIndexes] = useState<Record<string, number>>({});
  const [placeStatus, setPlaceStatus] = useState<Record<string, PlaceStatus>>({});
  const [expandedPrompts, setExpandedPrompts] = useState<Record<string, boolean>>({});
  const [overflowingPrompts, setOverflowingPrompts] = useState<Record<string, boolean>>({});
  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});
  const [overflowingResponses, setOverflowingResponses] = useState<Record<string, boolean>>({});
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [scrolledAway, setScrolledAway] = useState(false);
  const { viewModel, composerDraft } = workspace;
  const currentTemplate = promptSettings.templates.find((template) => template.id === promptSettings.selectedTemplateId) ?? promptSettings.templates[0]!;
  const provider = viewModel.provider;
  const providers = ([{ profileId: 'grsai', displayName: 'GRSAI' }, { profileId: 'runninghub', displayName: 'RunningHub' }] as const);
  const providersLoading = false;
  const providersError = null;
  const selectedProviderId = provider?.providerId ?? 'grsai';
  const selectedProvider = providers.find((profile) => profile.profileId === selectedProviderId) ?? providers[0];
  const models = provider?.models ?? [];
  const modelsLoading = provider?.modelsLoading ?? false;
  const selectedModelId = provider?.selectedModelId ?? '';
  const catalogParameters = provider?.parameters ?? {};
  const catalogParameterValues = workspace.catalogParameterValues;
  const ratioSizeProjection = useMemo(() => projectComposerRatioSize(catalogParameters, catalogParameterValues), [catalogParameters, catalogParameterValues]);
  const generationSettings = workspace.providerSettings.generation;
  const convRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<UxpTextAreaElement>(null);
  const providerSelectorRef = useRef<HTMLButtonElement>(null);
  const providerListboxRef = useRef<HTMLDivElement>(null);
  const providerMenuFocusRef = useRef<'selected' | 'first' | 'last'>('selected');
  const restoreProviderTriggerFocusRef = useRef(false);
  const focusInitialProviderOptionRef = useCallback((element: HTMLDivElement | null) => element?.focus(), []);
  const layerPickerOpenStartedAtRef = useRef<number | null>(null);
  const promptFoldRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const promptTextRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const responseFoldRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const responseTextRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastNonEmptyLayersRef = useRef<readonly LayerInfo[]>(layers);
  const focusProviderOption = useCallback((target: HTMLElement | undefined) => target?.focus(), []);
  useEffect(() => {
    if (layers.length > 0) {
      lastNonEmptyLayersRef.current = layers;
    }
  }, [layers]);
  // 刷新失败的 adapter 会清空数组；页面保留上次已展示图层，直到下次成功结果到达。
  const visibleLayers = layersError && layers.length === 0 ? lastNonEmptyLayersRef.current : layers;
  const flatLayers = useMemo(() => flattenLayers(visibleLayers), [visibleLayers]);
  const uniqueModels = useMemo(() => dedupeById(models), [models]);
  const { input, attachments } = composerDraft;
  const maskStatusText = workspace.maskState.kind === 'loading'
    ? t.main.maskLoading
    : workspace.maskState.kind === 'ready'
      ? t.main.maskReady
      : workspace.maskState.kind === 'none'
        ? t.main.maskNone
        : workspace.maskState.kind === 'error'
          ? `${t.main.maskError}: ${workspace.maskState.message}`
          : undefined;

  useEffect(() => {
    workspace.setAttachmentPreparing(captureInFlight);
  }, [captureInFlight, workspace]);

  useEffect(() => {
    if (providerMenuOpen || !restoreProviderTriggerFocusRef.current) {
      return;
    }
    restoreProviderTriggerFocusRef.current = false;
    providerSelectorRef.current?.focus();
  }, [providerMenuOpen]);

  function layerKindIcon(kind: string | undefined): 'layer-pixel' | 'layer-smart-object' | 'layer-text' | 'layer-group' | null {
    switch (kind) {
      case 'smartObject': return 'layer-smart-object';
      case 'pixel': return 'layer-pixel';
      case 'text': return 'layer-text';
      case 'group': return 'layer-group';
      default: return null;
    }
  }

  function layerKindLabel(kind: string | undefined): string {
    switch (kind) {
      case 'smartObject': return t.main.layerKindSmartObject;
      case 'pixel': return t.main.layerKindPixel;
      case 'text': return t.main.layerKindText;
      case 'group': return t.main.layerKindGroup;
      default: return kind ? kind.charAt(0).toUpperCase() + kind.slice(1) : t.main.layerKindDefault;
    }
  }
  const selectableProviders = providers;
  const comfyUiMode = viewModel.mode === 'comfyui';
  const providerMenuOptionIds = comfyUiMode
    ? ['mode:provider']
    : [...selectableProviders.map((profile) => `provider:${profile.profileId}`), 'mode:comfyui'];
  const providerMenuInitialFocusId = providerMenuFocusRef.current === 'first'
    ? providerMenuOptionIds[0]
    : providerMenuFocusRef.current === 'last'
      ? providerMenuOptionIds[providerMenuOptionIds.length - 1]
      : !comfyUiMode && selectedProviderId
        ? `provider:${selectedProviderId}`
        : providerMenuOptionIds[0];
  useEffect(() => {
    if (!providerMenuOpen) {
      return;
    }
    const options = Array.from(
      providerListboxRef.current?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? [],
    );
    const target = providerMenuFocusRef.current === 'first'
      ? options[0]
      : providerMenuFocusRef.current === 'last'
        ? options[options.length - 1]
        : options.find((option) => option.getAttribute('aria-selected') === 'true') ?? options[0];
    focusProviderOption(target);
  }, [focusProviderOption, providerMenuInitialFocusId, providerMenuOpen]);
  const providerListState = !comfyUiMode && selectableProviders.length < 1
    ? providersError
      ? { kind: 'error' as const, title: providersError }
      : providersLoading
        ? { kind: 'loading' as const, title: t.main.loadingProfiles }
        : { kind: 'empty' as const, title: t.main.noProvider }
    : undefined;
  const layerListState = flatLayers.length === 0
    ? layersError
      ? { kind: 'error' as const, title: layersError }
      : layersLoading
        ? { kind: 'loading' as const, title: t.settings.loading }
        : { kind: 'empty' as const, title: t.main.noAvailableLayers }
    : undefined;
  const selectedModelInfo = uniqueModels.find((model) => model.id === selectedModelId);

  const selectedModelLabel = comfyUiMode
    ? viewModel.target.label
    : selectedModelInfo
    ? configurationInstanceLabel(selectedModelInfo)
    : (selectedModelId || (modelsLoading ? t.main.modelLoading : t.main.modelUnselected));
  const currentOperation = composerDraft.operation;
  const modelOptions = useMemo(
    () => uniqueModels.map((model) => ({
      id: model.id,
      label: configurationInstanceLabel(model),
    })),
    [uniqueModels],
  );
  const configurationSummary = composerConfigurationSummaryParts({
    modelLabel: selectedModelInfo ? configurationInstanceLabel(selectedModelInfo) : selectedModelLabel,
    ...(ratioSizeProjection.ratio ? { ratio: ratioSizeProjection.ratio.value } : {}),
    ...(ratioSizeProjection.size ? { size: ratioSizeProjection.size.value } : {}),
    parameters: catalogParameters,
    values: catalogParameterValues,
  });
  const visibleLabelForModelId = (modelId: string | undefined): string | undefined => {
    if (!modelId) {
      return undefined;
    }
    const model = uniqueModels.find((item) => item.id === modelId);
    return model ? configurationInstanceLabel(model) : modelId;
  };
  const currentPromptValue = () => taRef.current?.value ?? input;
  const composerTextAreaNeedsUxpPopupOverlapWorkaround = openMenu !== null || promptTemplateMenuOpen;
  const syncComposerInputBeforeMenuOpen = useCallback(() => {
    const liveValue = taRef.current?.value;
    if (liveValue !== undefined && liveValue !== input) {
      composerDraft.setInput(liveValue);
    }
    taRef.current?.blur();
  }, [composerDraft, input]);
  const handleOpenComposerMenu = useCallback((menu: 'model' | 'prompt-template' | 'ratio' | 'size' | `catalog:${string}`, open: boolean) => {
    setProfileMenuOpen(false);
    setPromptTemplateMenuOpen(menu === 'prompt-template' && open);
    if (open) {
      syncComposerInputBeforeMenuOpen();
    }
    setOpenMenu(open ? menu : null);
  }, [syncComposerInputBeforeMenuOpen]);

  const canSend = viewModel.readiness.canSend;
  const composerReadinessState = viewModel.readiness.state;
  const composerReadinessText = viewModel.readiness.message;
  const showFooterReadiness = composerReadinessState !== 'enter-prompt';
  const imageInputDisabled = viewModel.imageInputDisabled;
  const imageInputDisabledReason = viewModel.imageInputDisabledReason ?? t.main.imageInputDisabledForModel;
  const canCapture = !captureInFlight && !imageInputDisabled;
  const responseTextKey = (roundId: string) => `response:${roundId}`;
  const placeResetTimersRef = useRef<Record<string, number>>({});
  const isAtBottom = useCallback(() => {
    const el = convRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 64;
  }, []);

  useEffect(() => () => {
    for (const timer of Object.values(placeResetTimersRef.current)) {
      window.clearTimeout(timer);
    }
    placeResetTimersRef.current = {};
  }, []);

  useEffect(() => {
    if (convRef.current && isAtBottom()) {
      convRef.current.scrollTop = convRef.current.scrollHeight;
    }
  }, [conversation.rounds, isAtBottom]);

  useEffect(() => {
    setSelectedPreviewIndexes((current) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const round of conversation.rounds) {
        if (round.status !== 'ok' || round.previews.length <= 1) {
          continue;
        }
        const clamped = Math.min(Math.max(current[round.id] ?? 0, 0), round.previews.length - 1);
        next[round.id] = clamped;
        if (current[round.id] !== clamped) {
          changed = true;
        }
      }
      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }
      return changed ? next : current;
    });
    setExpandedResponses((current) => {
      let changed = false;
      const liveRoundIds = new Set(conversation.rounds.map((round) => round.id));
      const next: Record<string, boolean> = {};
      for (const [roundId, expanded] of Object.entries(current)) {
        if (liveRoundIds.has(roundId)) {
          next[roundId] = expanded;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setExpandedPrompts((current) => {
      let changed = false;
      const liveRoundIds = new Set(conversation.rounds.map((round) => round.id));
      const next: Record<string, boolean> = {};
      for (const [roundId, expanded] of Object.entries(current)) {
        if (liveRoundIds.has(roundId)) {
          next[roundId] = expanded;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
    setPlaceStatus((current) => {
      let changed = false;
      const liveRoundIds = new Set(conversation.rounds.map((round) => round.id));
      const next: Record<string, PlaceStatus> = {};
      for (const [roundId, status] of Object.entries(current)) {
        if (liveRoundIds.has(roundId)) {
          next[roundId] = status;
        } else {
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [conversation.rounds]);

  const measurePromptOverflow = useCallback(() => {
    setOverflowingPrompts((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const round of conversation.rounds) {
        const foldElement = promptFoldRefs.current.get(round.id);
        const contentElement = promptTextRefs.current.get(round.id);
        if (!foldElement || !contentElement) {
          continue;
        }
        const lineHeight = Number.parseFloat(window.getComputedStyle(contentElement).lineHeight);
        const foldedHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight * 3 : 54;
        const overflowing = contentElement.scrollHeight > foldedHeight + 1 || contentElement.offsetHeight > foldElement.clientHeight + 1;
        next[round.id] = overflowing;
        if (current[round.id] !== overflowing) {
          changed = true;
        }
      }
      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }
      return changed ? next : current;
    });
  }, [conversation.rounds]);

  const measureResponseOverflow = useCallback(() => {
    setOverflowingResponses((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const round of conversation.rounds) {
        const foldElement = responseFoldRefs.current.get(round.id);
        const contentElement = responseTextRefs.current.get(round.id);
        if (!foldElement || !contentElement) {
          continue;
        }
        const lineHeight = Number.parseFloat(window.getComputedStyle(contentElement).lineHeight);
        const foldedHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight * 3 : 54;
        const overflowing = contentElement.scrollHeight > foldedHeight + 1 || contentElement.offsetHeight > foldElement.clientHeight + 1;
        next[round.id] = overflowing;
        if (current[round.id] !== overflowing) {
          changed = true;
        }
      }
      if (Object.keys(current).length !== Object.keys(next).length) {
        changed = true;
      }
      return changed ? next : current;
    });
  }, [conversation.rounds]);

  useEffect(() => {
    measurePromptOverflow();
    measureResponseOverflow();
  }, [conversation.rounds, expandedPrompts, expandedResponses, measurePromptOverflow, measureResponseOverflow]);

  useEffect(() => {
    window.addEventListener('resize', measurePromptOverflow);
    window.addEventListener('resize', measureResponseOverflow);
    return () => {
      window.removeEventListener('resize', measurePromptOverflow);
      window.removeEventListener('resize', measureResponseOverflow);
    };
  }, [measurePromptOverflow, measureResponseOverflow]);

  useEffect(() => {
    const el = convRef.current;
    if (!el) return;
    function handleScroll() {
      setScrolledAway(el!.scrollHeight - el!.scrollTop - el!.clientHeight > 64);
    }
    el.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [conversation.rounds.length]);

  useEffect(() => {
    if (!highlightedRoundId || !convRef.current) return;
    const el = findRoundElement(convRef.current, highlightedRoundId);
    if (el) {
      el.scrollIntoView({ behavior: 'auto', block: 'center' });
      el.classList.add('round-flash');
      const timer = window.setTimeout(() => el.classList.remove('round-flash'), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [highlightedRoundId]);

  const closeAll = () => {
    setProfileMenuOpen(false);
    setOpenMenu(null);
    setAttachOpen(false);
    setLayerOpen(false);
  };
  const closeProviderMenu = (restoreFocus = false) => {
    restoreProviderTriggerFocusRef.current = restoreFocus;
    setProfileMenuOpen(false);
  };
  const openProviderMenu = (focus: 'selected' | 'first' | 'last' = 'selected') => {
    providerMenuFocusRef.current = focus;
    setProfileMenuOpen(true);
    setOpenMenu(null);
  };
  const handleProviderTriggerKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Escape' && providerMenuOpen) {
      event.preventDefault();
      event.stopPropagation();
      closeProviderMenu(true);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'ArrowDown' && event.key !== 'ArrowUp') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    openProviderMenu(event.key === 'ArrowDown' ? 'first' : event.key === 'ArrowUp' ? 'last' : 'selected');
  };
  const handleProviderListboxKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeProviderMenu(true);
      return;
    }
    const options = Array.from(
      providerListboxRef.current?.querySelectorAll<HTMLElement>('[role="option"]:not([aria-disabled="true"])') ?? [],
    );
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      event.stopPropagation();
      if (options.length === 0) {
        return;
      }
      const currentIndex = options.findIndex((option) => option === document.activeElement);
      const nextIndex = event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? options.length - 1
          : currentIndex < 0
            ? event.key === 'ArrowDown' ? 0 : options.length - 1
            : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
      focusProviderOption(options[nextIndex]);
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') {
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    if (!active || active.getAttribute('role') !== 'option' || !providerListboxRef.current?.contains(active)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    active.click();
  };
  const openWorkspaceSettings = () => {
    workspace.setSettingsRoute(viewModel.settingsRoute);
    onNav('settings');
  };

  const handleSelectModel = useCallback((modelId: string) => {
    const model = uniqueModels.find((item) => item.id === modelId);
    const availabilityReason = modelAvailabilityReason(model, t);
    const capabilityReason = modelCapabilityReason(model, currentOperation, t);
    if (!modelIsSelectable(model) || capabilityReason !== null) {
      show(availabilityReason ?? capabilityReason ?? t.main.readinessModelUnavailable, 'warning', {
        key: `model-select-unavailable:${modelId}`,
      });
      return;
    }
    workspace.selectModel(modelId);
  }, [currentOperation, show, t, uniqueModels, workspace]);

  const restoreRound = (round: ConversationRound) => {
    composerDraft.setInput(round.prompt);
    if (round.modelId && uniqueModels.some((model) => model.id === round.modelId)) {
      workspace.selectModel(round.modelId);
    }
    composerDraft.replaceAttachments(round.attachments);
    taRef.current?.focus();
    show(t.toast.promptFilled, 'info', { key: 'prompt-fill' });
  };

  const fillComposerFromFailedRound = useCallback((round: ConversationRound) => {
    composerDraft.setInput(round.prompt);
    composerDraft.replaceAttachments(round.attachments);
    taRef.current?.focus();
    show(t.toast.promptFilled, 'info', { key: `prompt-fill:${round.id}` });
  }, [composerDraft, show, t.toast.promptFilled]);

  useEffect(() => {
    if (!restoreFailedRoundId) {
      return;
    }
    const round = conversation.rounds.find((item) => item.id === restoreFailedRoundId);
    if (!round || round.status !== 'err') {
      return;
    }
    fillComposerFromFailedRound(round);
    onFailedRoundRestored?.(round.id);
  }, [conversation.rounds, fillComposerFromFailedRound, onFailedRoundRestored, restoreFailedRoundId]);

  const removeAllAttachments = () => {
    composerDraft.clearAttachments();
  };

  const handleCopy = (id: string, round: ConversationRound) => {
    navigator.clipboard?.writeText(round.prompt).catch(() => undefined);
    setCopied((current) => ({ ...current, [id]: true }));
    window.setTimeout(() => setCopied((current) => ({ ...current, [id]: false })), 1500);
    restoreRound(round);
  };

  const handleCopyResponse = (round: ConversationRound) => {
    if (!round.responseText) {
      return;
    }
    const key = responseTextKey(round.id);
    navigator.clipboard?.writeText(round.responseText).catch(() => undefined);
    setCopied((current) => ({ ...current, [key]: true }));
    window.setTimeout(() => setCopied((current) => ({ ...current, [key]: false })), 1500);
  };

  const handleCopyRequestId = (roundId: string, requestId: string) => {
    const key = requestIdCopyKey(roundId);
    navigator.clipboard?.writeText(requestId).catch(() => undefined);
    setCopied((current) => ({ ...current, [key]: true }));
    window.setTimeout(() => setCopied((current) => ({ ...current, [key]: false })), 1500);
  };

  const handleCopyErrorDetails = useCallback((
    round: ConversationRound,
    failure: ReturnType<typeof classifyRoundError>,
  ) => {
    const lines = [
      `Provider: ${round.providerName}`,
      `Category: ${t.main.errorCategoryLabel[failure.category] ?? t.main.errorCategoryLabel.unknown}`,
      `Message: ${failure.message}`,
      ...(failure.detail ? [`Detail: ${failure.detail}`] : []),
      ...(failure.requestId ? [`Request ID: ${failure.requestId}`] : []),
    ];
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => undefined);
    show(t.toast.errorDetailsCopied, 'info', { key: `error-details-copy:${round.id}` });
  }, [show, t.main.errorCategoryLabel, t.toast.errorDetailsCopied]);

  const responseFoldRef = (roundId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      responseFoldRefs.current.set(roundId, element);
    } else {
      responseFoldRefs.current.delete(roundId);
    }
  };

  const responseTextRef = (roundId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      responseTextRefs.current.set(roundId, element);
    } else {
      responseTextRefs.current.delete(roundId);
    }
  };

  const promptFoldRef = (roundId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      promptFoldRefs.current.set(roundId, element);
    } else {
      promptFoldRefs.current.delete(roundId);
    }
  };

  const promptTextRef = (roundId: string) => (element: HTMLDivElement | null) => {
    if (element) {
      promptTextRefs.current.set(roundId, element);
    } else {
      promptTextRefs.current.delete(roundId);
    }
  };

  const previewIndexForRound = (round: ConversationRound): number => {
    if (round.previews.length === 0) {
      return 0;
    }
    return Math.min(Math.max(selectedPreviewIndexes[round.id] ?? 0, 0), round.previews.length - 1);
  };

  const selectPreview = (round: ConversationRound, previewIndex: number) => {
    if (round.previews.length <= 1) {
      return;
    }
    const nextIndex = Math.min(Math.max(previewIndex, 0), round.previews.length - 1);
    setSelectedPreviewIndexes((current) => ({ ...current, [round.id]: nextIndex }));
  };

  const stepPreview = (round: ConversationRound, step: -1 | 1) => {
    if (round.previews.length <= 1) {
      return;
    }
    const currentIndex = previewIndexForRound(round);
    const nextIndex = Math.min(Math.max(currentIndex + step, 0), round.previews.length - 1);
    selectPreview(round, nextIndex);
  };

  const scrollToBottom = () => {
    if (convRef.current) {
      convRef.current.scrollTop = convRef.current.scrollHeight;
    }
  };

  const addAttachment = (attachment: ConversationAttachment) => {
    composerDraft.addAttachment(attachment);
    setHighlightKey(`attachment:${attachment.id}`);
    setAttachOpen(false);
    setLayerOpen(false);
  };

  const removeAttachment = (attachmentId: string) => {
    composerDraft.removeAttachment(attachmentId);
  };

  const selectProvider = (profileId: string) => {
    if (profileId !== selectedProviderId) {
      composerDraft.clearAttachments();
    }
    void workspace.selectProvider(profileId as 'grsai' | 'runninghub');
    closeProviderMenu(true);
  };

  const selectGenerationMode = (mode: 'provider' | 'comfyui') => {
    workspace.setGenerationMode(mode);
    closeProviderMenu(true);
  };

  const addLayer = async (layer: LayerInfo) => {
    if (imageInputDisabled) {
      show(imageInputDisabledReason, 'warning', { key: 'image-input-disabled' });
      return;
    }
    try {
      const image = await services.host.readLayerAsAsset(layer.id, providerInputPolicy(generationSettings));
      addAttachment({
        id: attachmentId('layer'),
        type: 'layer',
        name: layer.name,
        image,
        ...attachmentPreviewFields(image),
        ...(image.photoshopPlacement ? { photoshopPlacement: image.photoshopPlacement } : {}),
      });
    show(t.toast.layerAdded, 'positive', { key: 'attachment-layer-added' });
    } catch (error) {
      show(error instanceof Error ? error.message : t.toast.layerReadFailed, 'negative', { key: 'attachment-layer-error' });
    }
  };

  const openLayerPicker = () => {
    if (imageInputDisabled) {
      show(imageInputDisabledReason, 'warning', { key: 'image-input-disabled' });
      return;
    }
    layerPickerOpenStartedAtRef.current = Date.now();
    setLayerOpen(true);
    void reloadLayers();
  };

  useEffect(() => {
    if (layerOpen) {
      return;
    }
    layerPickerOpenStartedAtRef.current = null;
  }, [layerOpen]);

  useEffect(() => {
    if (!layerOpen || layersLoading) {
      return;
    }
    const openedAt = layerPickerOpenStartedAtRef.current;
    if (openedAt === null) {
      return;
    }
    layerPickerOpenStartedAtRef.current = null;
    void services.diagnostics?.checkpoint('uxp.ui.layer_picker.open.data_ready', {
      openToDataReadyMs: Date.now() - openedAt,
      layerCount: flatLayers.length,
      hasError: Boolean(layersError),
    });
  }, [flatLayers.length, layerOpen, layersError, layersLoading, services.diagnostics]);

  const addFile = async () => {
    if (imageInputDisabled) {
      show(imageInputDisabledReason, 'warning', { key: 'image-input-disabled' });
      return;
    }
    try {
      const image = await services.host.pickImageFile(providerInputPolicy(generationSettings));
      if (!image) {
        return;
      }
      addAttachment({
        id: attachmentId('file'),
        type: 'file',
        name: image.asset.name ?? 'image',
        image,
        ...attachmentPreviewFields(image),
        ...(image.photoshopPlacement ? { photoshopPlacement: image.photoshopPlacement } : {}),
      });
      show(t.toast.fileAdded, 'positive', { key: 'attachment-file-added' });
    } catch (error) {
      show(
        isLocalFileNormalizationError(error)
          ? t.toast.fileNeedsNormalization
          : error instanceof Error
            ? error.message
            : t.toast.filePickFailed,
        'negative',
        { key: 'attachment-file-error' },
      );
    }
  };

  const captureFromPhotoshop = async () => {
    if (!canCapture) {
      if (imageInputDisabled) {
        show(imageInputDisabledReason, 'warning', { key: 'image-input-disabled' });
      }
      return;
    }
    setCaptureInFlight(true);
    try {
      const result = await services.host.captureActiveImage(providerInputPolicy(generationSettings));
      const id = attachmentId('capture');
      const previewGeneration = Date.now();
      addAttachment({
        id,
        type: 'photoshop-capture',
        name: result.image.asset.name ?? (result.sourceKind === 'selection' ? t.main.captureSelection : t.main.captureLayer),
        image: result.image,
        ...(result.mask ? { mask: result.mask } : {}),
        ...attachmentPreviewFields(result.image),
        previewGeneration,
        photoshopPlacement: result.placement,
      });
      if (result.previewTask) {
        void result.previewTask()
          .then((preview) => {
            if (preview?.url) {
              composerDraft.updateAttachmentPreview(id, previewGeneration, {
                url: preview.url,
                dispose: preview.dispose,
              });
            }
          })
          .catch(() => undefined);
      }
      show(t.toast.captureAdded, 'positive', { key: 'attachment-capture-added' });
    } catch (error) {
      show(error instanceof Error ? error.message : t.toast.captureFailed, 'negative', { key: 'attachment-capture-error' });
    } finally {
      setCaptureInFlight(false);
    }
  };

  const handleSend = async () => {
    if (!canSend) {
      show(composerReadinessText, composerReadinessState === 'model-unavailable' ? 'warning' : 'info', { key: 'send-readiness' });
      return;
    }
    const rawPrompt = currentPromptValue().trim();
    if (rawPrompt.length === 0 && promptTemplateNeedsInput(currentTemplate)) {
      show(t.main.readinessEnterPrompt, 'info', { key: 'prompt-template-input-required' });
      return;
    }
    const assembled = assemblePromptTemplate(currentTemplate, rawPrompt);
    const prompt = assembled.userPrompt.trim();
    if (/^\/new\b$/i.test(prompt)) {
      conversation.clear();
      show(t.toast.newSessionStarted, 'info', { key: 'session-new' });
      return;
    }
    if (comfyUiMode && workspace.viewModel.notices.some((notice) => notice.includes('不使用当前提示词'))) {
      show(t.main.comfyUiPromptUnused, 'info', { key: 'comfyui-prompt-unused' });
    }
    await workspace.send(prompt, assembled.systemPrompt);
  };

  const placeAsset = async (round: ConversationRound, previewIndex = 0) => {
    if (round.placementIntent.kind === 'unbound' && round.placementIntent.reason === 'multiple-documents') {
      show(t.main.placementMultipleDocuments, 'warning', { key: `place-conflict:${round.id}` });
      return;
    }
    const asset = round.previews[previewIndex]?.asset;
    if (!asset) {
      show(t.toast.noPlaceableImage, 'info', { key: 'output-missing-placeable' });
      return;
    }
    setPlaceStatus((current) => ({ ...current, [round.id]: 'placing' }));
    try {
      await services.host.placeAssetOnCanvas(asset, round.placementIntent);
      setPlaceStatus((current) => ({ ...current, [round.id]: 'placed' }));
      setHighlightKey(`place:${round.id}:${Date.now()}`);
      show(t.toast.placedOnCanvas, 'positive', { key: `place-success:${round.id}` });
      const pendingTimer = placeResetTimersRef.current[round.id];
      if (pendingTimer !== undefined) {
        window.clearTimeout(pendingTimer);
      }
      placeResetTimersRef.current[round.id] = window.setTimeout(() => {
        setPlaceStatus((current) => ({ ...current, [round.id]: 'idle' }));
        delete placeResetTimersRef.current[round.id];
      }, MOTION_FEEDBACK_DWELL.success);
    } catch (error) {
      setPlaceStatus((current) => ({ ...current, [round.id]: 'idle' }));
      show(error instanceof Error ? error.message : t.toast.placeFailed, 'negative', { key: `place-error:${round.id}` });
    }
  };

  const downloadPreview = async (round: ConversationRound, previewIndex = 0) => {
    const preview = round.previews[previewIndex];
    if (!preview?.asset) {
      show(t.toast.noPlaceableImage, 'info', { key: 'output-missing-placeable' });
      return;
    }
    try {
      await services.host.saveAssetToFile(preview.asset, {
        suggestedName: suggestedGeneratedImageFileName({
          createdAt: round.createdAt,
          providerName: round.providerName,
          prompt: round.prompt,
          outputIndex: previewIndex,
          outputCount: round.previews.length,
          mimeType: preview.asset.mimeType,
        }),
      });
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'negative', { key: `download-error:${round.id}` });
    }
  };

  return (
    <PageFrame watch="main"><div className="page" onClick={closeAll}>
      <PageHeader
        title=""
        back={<IconButton
          data-testid="main-history-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="history" />}
          tooltip={t.main.history}
          placement="bottom"
          onClick={(event) => { event.stopPropagation(); onNav('history'); }}
        />}
        center={<div className="hdr-center-wrap">
          <IconButton
            ref={providerSelectorRef}
            data-testid="main-provider-selector"
            id="main-provider-selector"
            className={`hdr-center hdr-provider-trigger${providerMenuOpen ? ' open' : ''}`}
            overlayClassName="hdr-provider-chevron"
            aria-haspopup="listbox"
            aria-expanded={providerMenuOpen ? 'true' : 'false'}
            aria-controls="main-provider-menu"
            icon={<Icon name="chevron-down" />}
            iconSize={12}
            iconPlacement="end"
            text={comfyUiMode ? t.settings.comfyUi : selectedProvider?.displayName ?? selectedProviderId}
            tooltip={comfyUiMode ? t.settings.comfyUi : selectedProvider?.displayName ?? selectedProviderId}
            onClick={(event) => {
              event.stopPropagation();
              if (providerMenuOpen) {
                closeProviderMenu();
              } else {
                openProviderMenu();
              }
            }}
            onKeyDown={handleProviderTriggerKeyDown}
          />
          <MotionPresenceView visible={providerMenuOpen} kind="popover">
            {({ ref, state }) => (
            <div
              ref={(element) => {
                ref(element);
                providerListboxRef.current = element;
              }}
              id="main-provider-menu"
              className="model-menu hdr-model-menu"
              data-motion-state={state}
              role="listbox"
              aria-label={t.common.profile}
              aria-hidden={state === 'exiting' ? 'true' : undefined}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={handleProviderListboxKeyDown}
            >
              <List className="popup-list profile-popup-list">
                {comfyUiMode ? (
                  <div
                    data-testid="main-mode-provider"
                    className="model-opt"
                    role="option"
                    aria-selected="false"
                    tabIndex={0}
                    ref={providerMenuInitialFocusId === 'mode:provider' ? focusInitialProviderOptionRef : undefined}
                    onClick={() => selectGenerationMode('provider')}
                  >
                    <span>{t.common.provider}</span>
                  </div>
                ) : (
                  <>
                  {providerListState ? (
                    <ListStateItem
                      className="popup-list-state profile-popup-state"
                      data-testid={`profile-list-state-${providerListState.kind}`}
                      kind={providerListState.kind}
                      title={providerListState.title}
                      action={providerListState.kind === 'empty'
                        ? { label: t.common.addProvider, onPress: () => onNav('provider-picker') }
                        : undefined}
                    />
                  ) : selectableProviders.map((profile) => (
                      <div
                        key={profile.profileId}
                        data-testid={`profile-menu-option-${profile.profileId}`}
                        className={`model-opt${profile.profileId === selectedProviderId ? ' act' : ''}`}
                        role="option"
                        aria-selected={profile.profileId === selectedProviderId ? 'true' : 'false'}
                        tabIndex={profile.profileId === selectedProviderId ? 0 : -1}
                        ref={providerMenuInitialFocusId === `provider:${profile.profileId}` ? focusInitialProviderOptionRef : undefined}
                        onClick={() => selectProvider(profile.profileId)}
                      >
                        <span>{profile.displayName}</span>
                      </div>
                    ))}
                  <div
                    data-testid="main-mode-comfyui"
                    className="model-opt"
                    role="option"
                    aria-selected="false"
                    tabIndex={selectedProviderId ? -1 : 0}
                    ref={providerMenuInitialFocusId === 'mode:comfyui' ? focusInitialProviderOptionRef : undefined}
                    onClick={() => selectGenerationMode('comfyui')}
                  >
                    <span>{t.settings.comfyUi}</span>
                  </div>
                  </>
                )}
              </List>
            </div>
            )}
          </MotionPresenceView>
        </div>}
        right={<IconButton
          data-testid="main-providers-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="settings" />}
          tooltip="Providers"
          placement="bottom"
          onClick={(event) => { event.stopPropagation(); openWorkspaceSettings(); }}
        />}
      />

      <PageScroll ref={convRef}>
        <div className="round-list">
          <div className="day-sep">
            <div className="day-sep-line" /><span className="day-sep-lbl">{t.main.currentSession}</span><div className="day-sep-line" />
          </div>

          {conversation.rounds.length === 0 && (
            <PageState tone="neutral" message={t.main.emptyHint} className="conv-empty" action={<div className="empty-hints">
                <Button className="empty-hint" onClick={() => composerDraft.setInput(t.main.promptSuggestionProductValue)}>
                  {t.main.promptSuggestionProductLabel}
                </Button>
                <Button className="empty-hint" onClick={() => composerDraft.setInput(t.main.promptSuggestionCyberpunkValue)}>
                  {t.main.promptSuggestionCyberpunkLabel}
                </Button>
                <Button className="empty-hint" onClick={() => composerDraft.setInput(t.main.promptSuggestionLayerValue)}>
                  {t.main.promptSuggestionLayerLabel}
                </Button>
              </div>} />
          )}

          {conversation.rounds.map((round) => (
            <div
              key={round.id}
              className={`round-item ${round.status === 'running' ? 'round-item-open' : 'round-item-complete'}`}
              data-round-id={round.id}
              data-testid={`round-${round.id}`}
            >
              <MotionHighlight
                activeKey={
                  highlightedRoundId === round.id
                    ? highlightedRoundId
                    : highlightKey?.startsWith(`place:${round.id}:`)
                      ? highlightKey
                      : null
                }
              />
              <div className="msg-user">
                <div className="user-wrap">
                  <div className="user-bubble">
                    {round.attachments.length > 0 && (
                      <div className="bubble-imgs">
                        {round.attachments.slice(0, 2).map((attachment, index) => (
                          <div key={attachment.id} className="bimg">
                            {attachment.previewUrl
                              ? <img src={attachment.previewUrl} className="bimg-bg" alt={attachment.name} />
                              : (
                                <ImageFallbackContent
                                  density="thumbnail"
                                  state={attachment.previewFallback?.state ?? 'preview-unavailable'}
                                  title={imageFallbackTitle(t.imageFallback, attachment.previewFallback?.state ?? 'preview-unavailable')}
                                />
                              )
                            }
                            {index === 1 && round.attachments.length > 2 && (
                              <div className="bimg-count">+{round.attachments.length - 1}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div
                      className="user-prompt"
                      data-testid={`user-prompt-shell-${round.id}`}
                      data-expanded={expandedPrompts[round.id] ? 'true' : undefined}
                      data-overflowing={overflowingPrompts[round.id] ? 'true' : undefined}
                    >
                      <div
                        ref={promptFoldRef(round.id)}
                        data-testid={`user-prompt-body-${round.id}`}
                        className="user-prompt-body"
                      >
                        <div
                          ref={promptTextRef(round.id)}
                          data-testid={`user-prompt-text-${round.id}`}
                          className="user-prompt-text"
                        >
                          {round.prompt}
                        </div>
                      </div>
                      {overflowingPrompts[round.id] && (
                        <div className="user-prompt-actions">
                          <Button
                            data-testid={`user-prompt-toggle-${round.id}`}
                            className="user-prompt-toggle"
                            onClick={(event) => {
                              event.stopPropagation();
                              setExpandedPrompts((current) => ({ ...current, [round.id]: !current[round.id] }));
                            }}
                          >
                            {expandedPrompts[round.id] ? `${t.main.collapsePrompt} ▴` : `${t.main.expandPrompt} ▾`}
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="user-meta">
                    <span className="msg-time">{round.time}</span>
                    <IconButton
                      data-testid={`round-copy-button-${round.id}`}
                      className={`copy-btn${copied[round.id] ? ' cp' : ''}`}
                      quiet
                      icon={copied[round.id] ? <Icon name="check" /> : <Icon name="copy" />}
                      tooltip={t.main.reusePrompt}
                      onClick={(event) => { event.stopPropagation(); handleCopy(round.id, round); }}
                    />
                  </div>
                </div>
              </div>

              <MotionContent watch={`${round.id}:${round.status}`}>
              {round.status === 'err' && (
                <div className="msg-prov msg-prov-surface">
                  {(() => {
                    const failure = classifyRoundError(round.errorMessage);
                    const requestCopyKey = requestIdCopyKey(round.id);
                    const handlePrimaryErrorAction = () => {
                      switch (failure.primaryAction) {
                        case 'open-provider-settings':
                          if (round.providerId && onEditProfile) {
                            onEditProfile(round.providerId);
                          }
                          return;
                        case 'choose-supported-size':
                          if (ratioSizeProjection.size) setOpenMenu('size');
                          else if (ratioSizeProjection.ratio) setOpenMenu('ratio');
                          return;
                        case 'choose-compatible-model':
                          setOpenMenu('model');
                          return;
                        case 'replace-image':
                          removeAllAttachments();
                          setAttachOpen(true);
                          return;
                        case 'copy-error-details':
                          handleCopyErrorDetails(round, failure);
                          return;
                        case 'fill-composer-from-failed-round':
                          fillComposerFromFailedRound(round);
                          return;
                      }
                    };
                    const showFillComposerSecondary = failure.primaryAction !== 'fill-composer-from-failed-round';
                    return (
                      <div className="err-card">
                        <div className="err-top">
                          <span className="prov-identity-icon err">!</span>
                          <span className="err-title">
                            {t.status.failed} · {round.providerName}
                          </span>
                        </div>
                        <div className="err-category">{t.main.errorCategory}: {t.main.errorCategoryLabel[failure.category] ?? t.main.errorCategoryLabel.unknown}</div>
                        <div className="err-msg">{errorDisplayMessage(t, failure)}</div>
                        {failure.detail ? <div className="err-detail">{failure.detail}</div> : null}
                        {round.comfyUiExecutionError ? (
                          <div className="err-detail" data-testid={`comfyui-execution-error-${round.id}`}>
                            {comfyUiExecutionNodeLabel(round.comfyUiExecutionError) ? <div>{t.main.errorComfyUiNode}: {comfyUiExecutionNodeLabel(round.comfyUiExecutionError)}</div> : null}
                            {round.comfyUiExecutionError.message ? <div>{t.main.errorComfyUiDetail}: {round.comfyUiExecutionError.message}</div> : null}
                          </div>
                        ) : null}
                        {failure.requestId ? (
                          <div className="err-request">
                            <div className="err-request-label">{t.main.requestId}</div>
                            <div className="err-request-row">
                              <div className="err-request-value" data-testid={`error-request-id-${round.id}`}>{failure.requestId}</div>
                              <IconButton
                                data-testid={`error-request-copy-button-${round.id}`}
                                className={`err-copy${copied[requestCopyKey] ? ' cp' : ''}`}
                                quiet
                                icon={copied[requestCopyKey] ? <Icon name="check" /> : <Icon name="copy" />}
                                tooltip={t.main.copyRequestId}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleCopyRequestId(round.id, failure.requestId!);
                                }}
                              />
                            </div>
                          </div>
                        ) : null}
                        <div className="err-actions">
                          <Button
                            data-testid={`error-primary-action-button-${round.id}`}
                            className="err-retry"
                            onClick={handlePrimaryErrorAction}
                          >
                            {primaryActionLabel(t, failure.primaryAction)}
                          </Button>
                          {showFillComposerSecondary ? (
                            <Button
                              data-testid={`error-fill-composer-button-${round.id}`}
                              className="err-retry err-retry-secondary"
                              onClick={() => fillComposerFromFailedRound(round)}
                            >
                              {t.main.errorActionFillComposer}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {round.status === 'queued' && (
                <div className="msg-prov msg-prov-surface">
                  <div className="prov-card" data-testid={`queued-task-${round.id}`}>
                    <div className="prov-top">
                      <ProviderIdentity
                        providerName={round.providerName}
                        modelLabel={visibleLabelForModelId(round.modelId)}
                        disabled={!onEditProfile || !round.providerId}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (round.providerId && onEditProfile) onEditProfile(round.providerId);
                        }}
                      />
                      <div className="prov-status">
                        <span className="sdot info" />
                        <span className="prov-status-text info">
                          {round.queueState === 'starting'
                            ? t.main.queueStarting
                            : t.main.queuePosition(round.queuePosition ?? 1)}
                        </span>
                      </div>
                    </div>
                    <div className="queue-task-row">
                      <span>{round.queueState === 'starting' ? t.main.queueStarting : t.status.queued}</span>
                      {round.removable ? (
                        <IconButton
                          data-testid={`queued-task-remove-${round.id}`}
                          className="queue-task-remove"
                          quiet
                          icon={<Icon name="close" />}
                          tooltip={t.main.removeFromQueue}
                          onClick={(event) => {
                            event.stopPropagation();
                            conversation.removeQueuedTask(round.id);
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
              )}

              {round.status === 'running' && (
                <div className="msg-prov msg-prov-surface">
                  <div className="prov-card">
                    <div className="prov-top">
                      <ProviderIdentity
                        providerName={round.providerName}
                        modelLabel={visibleLabelForModelId(round.modelId)}
                        disabled={!onEditProfile || !round.providerId}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (round.providerId && onEditProfile) {
                            onEditProfile(round.providerId);
                          }
                        }}
                      />
                      <div className="prov-status">
                        <span className="sdot run" />
                        <span className="prov-status-text run">
                          {round.elapsedSeconds <= 0 ? t.main.runningPhaseSubmitting : t.main.runningPhaseGenerating}
                        </span>
                        {round.elapsedSeconds > 0 ? (
                          <span className="prov-status-duration">{round.elapsedSeconds}s</span>
                        ) : null}
                      </div>
                    </div>
                    <div className="prov-loading">
                      <div
                        className="ldots"
                        role="status"
                        aria-live="polite"
                        aria-label={round.elapsedSeconds <= 0 ? t.main.runningPhaseSubmitting : t.main.runningPhaseGenerating}
                      >
                        <MotionActivityDot className="ldot" />
                        <MotionActivityDot className="ldot" />
                        <MotionActivityDot className="ldot" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {round.status === 'ok' && (() => {
                const hasImages = round.previews.length > 0;
                const hasResponseText = Boolean(round.responseText?.trim());
                const showResponseText = hasResponseText;
                const splitResponseTextCard = hasImages && showResponseText;
                const responseExpanded = Boolean(expandedResponses[round.id]);
                const responseOverflows = Boolean(overflowingResponses[round.id]);
                const selectedPreviewIndex = previewIndexForRound(round);
                const preview = round.previews[selectedPreviewIndex];
                const hasMultiplePreviews = round.previews.length > 1;
                const copyKey = responseTextKey(round.id);
                const providerModelLabel = visibleLabelForModelId(round.modelId) ?? selectedModelLabel;
                const canGoPrev = selectedPreviewIndex > 0;
                const canGoNext = selectedPreviewIndex < round.previews.length - 1;
                const previewLayoutMode = previewLayoutModeForRound(round);
                const responseCard = showResponseText && round.responseText ? (
                  <div
                    className={`prov-response${splitResponseTextCard ? ' prov-response-standalone' : ''}`}
                    data-expanded={responseExpanded ? 'true' : undefined}
                    data-overflowing={responseOverflows ? 'true' : undefined}
                  >
                    <div
                      ref={responseFoldRef(round.id)}
                      className="prov-response-body"
                    >
                      <div
                        ref={responseTextRef(round.id)}
                        data-testid={`result-response-text-${round.id}`}
                        className="prov-response-text"
                      >
                        {round.responseText}
                      </div>
                    </div>
                    <div className="prov-response-actions">
                      {responseOverflows && (
                        <Button
                          data-testid={`result-response-toggle-${round.id}`}
                          className="prov-response-toggle"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedResponses((current) => ({ ...current, [round.id]: !responseExpanded }));
                          }}
                        >
                          {responseExpanded ? `${t.main.collapseResponse} ▴` : `${t.main.expandResponse} ▾`}
                        </Button>
                      )}
                      <IconButton
                        data-testid={`result-response-copy-button-${round.id}`}
                        className={`prov-response-copy${copied[copyKey] ? ' cp' : ''}`}
                        quiet
                        icon={copied[copyKey] ? <Icon name="check" /> : <Icon name="copy" />}
                        tooltip={t.main.copyResponse}
                        onClick={(event) => { event.stopPropagation(); handleCopyResponse(round); }}
                      />
                    </div>
                  </div>
                ) : null;
                return (
                <div className={`msg-prov msg-prov-surface${splitResponseTextCard ? ' msg-prov-stack' : ''}`}>
                  {splitResponseTextCard ? (
                    <div className="prov-card prov-card-text-only prov-response-card" data-testid={`result-response-card-${round.id}`}>
                      {responseCard}
                    </div>
                  ) : null}
                  <div
                    className={`prov-card${hasImages ? ' prov-card-media' : ' prov-card-text-only'}`}
                    data-testid={hasImages ? `result-media-card-${round.id}` : undefined}
                  >
                    {hasImages ? (
                      <ProviderMediaHeader
                        providerName={round.providerName}
                        modelLabel={providerModelLabel}
                        statusLabel={t.status.done}
                        durationLabel={round.elapsedLabel}
                        statusTone={statusDot(round.status)}
                        disabled={!onEditProfile || !round.providerId}
                        testIdPrefix={`result-media-card-${round.id}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (round.providerId && onEditProfile) {
                            onEditProfile(round.providerId);
                          }
                        }}
                      />
                    ) : (
                      <div className="prov-top">
                        <ProviderIdentity
                          providerName={round.providerName}
                          modelLabel={providerModelLabel}
                          disabled={!onEditProfile || !round.providerId}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (round.providerId && onEditProfile) {
                              onEditProfile(round.providerId);
                            }
                          }}
                        />
                        <div className="prov-status">
                          <span className={`sdot ${hasImages ? statusDot(round.status) : 'info'}`} />
                          <span className={`prov-status-text ${hasImages ? 'ok' : 'info'}`}>
                            {hasImages ? t.status.done : t.main.textResult} · {round.elapsedLabel}
                          </span>
                        </div>
                      </div>
                    )}
                    {!splitResponseTextCard ? responseCard : null}
                    {hasImages ? (
                      <div className="prov-media-section">
                        <ImageResultStage
                          roundId={round.id}
                          previewIndex={selectedPreviewIndex}
                          preview={preview}
                          requestedLayout={previewLayoutMode}
                          fallbackTitle={imageFallbackTitle(t.imageFallback, preview?.fallback?.state ?? 'preview-unavailable')}
                        >
                            <div className="img-meta">{round.outputSize ?? t.main.assetFallback} · {round.outputFormat ?? t.main.imageFallback}</div>
                            {hasMultiplePreviews && (
                              <>
                                <div className="img-count" data-testid={`result-preview-count-${round.id}`}>
                                  {selectedPreviewIndex + 1} / {round.previews.length}
                                </div>
                                <IconButton
                                  className={`img-nav img-nav-prev${!canGoPrev ? ' is-disabled' : ''}`}
                                  hostClassName="img-nav-host img-nav-host-prev"
                                  data-testid={`result-preview-prev-${round.id}`}
                                  icon={<Icon name="chevron-left" size={13} />}
                                  tooltip="Previous image"
                                  aria-label="Previous image"
                                  iconSize={13}
                                  disabled={!canGoPrev}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    stepPreview(round, -1);
                                  }}
                                />
                                <IconButton
                                  className={`img-nav img-nav-next${!canGoNext ? ' is-disabled' : ''}`}
                                  hostClassName="img-nav-host img-nav-host-next"
                                  data-testid={`result-preview-next-${round.id}`}
                                  icon={<Icon name="chevron-right" size={13} />}
                                  tooltip="Next image"
                                  aria-label="Next image"
                                  iconSize={13}
                                  disabled={!canGoNext}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    stepPreview(round, 1);
                                  }}
                                />
                              </>
                            )}
                            <div className="img-overlay">
                              <MotionButtonSurface>
                                {(() => {
                                  const placeButton = placementButtonState(round.placementIntent, placeStatus[round.id] ?? 'idle', t);
                                  return (
                                <Button
                                  data-testid={`result-place-button-${round.id}`}
                                  className="img-act prim"
                                  data-place-status={placeStatus[round.id] ?? 'idle'}
                                  variant="accent"
                                  title={placeButton.title}
                                  disabled={placeButton.disabled}
                                  onClick={(event) => { event.stopPropagation(); void placeAsset(round, selectedPreviewIndex); }}
                                >
                                  {placeButton.label}
                                </Button>
                                  );
                                })()}
                              </MotionButtonSurface>
                            </div>
                        </ImageResultStage>
                      </div>
                    ) : null}
                    {hasImages && (
                      <div className="prov-actions">
                        <IconButton
                          data-testid={`result-download-button-${round.id}`}
                          className="act-ico act-download"
                          hostClassName="act-download-host"
                          quiet
                          icon={<Icon name="download" />}
                          tooltip={t.main.download}
                          onClick={(event) => { event.stopPropagation(); void downloadPreview(round, previewIndexForRound(round)); }}
                        />
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}
              </MotionContent>
            </div>
          ))}
        </div>
      </PageScroll>

      <footer className="composer" onClick={(event) => event.stopPropagation()}>
          <MotionDimSurface className="cmp-shell cmp-shell-motion" dim={false}>
          <div className="cmp-attach-band">
            <MotionPresenceView visible={layerOpen} kind="popover">
              {({ ref, state }) => (
              <div ref={ref} className="layer-list-wrap" data-motion-state={state} onClick={(event) => event.stopPropagation()}>
                <div className="layer-list-hdr">
                  <IconButton
                    className="layer-back"
                    icon={<Icon name="chevron-left" size={12} />}
                    tooltip={t.common.back}
                    iconSize={12}
                    onClick={() => setLayerOpen(false)}
                  />
                  {t.main.psLayers}
                  <IconButton
                    className="layer-refresh"
                    icon={layersLoading
                      ? <MotionActivityIcon><Icon name="spinner" size={12} /></MotionActivityIcon>
                      : <Icon name="refresh" size={12} />}
                    tooltip={t.common.refresh}
                    iconSize={12}
                    disabled={layersLoading}
                    onClick={() => void reloadLayers()}
                  />
                </div>
                <div className="layer-scroll">
                  <List className="popup-list layer-popup-list" aria-label={t.main.psLayers}>
                  {layerListState ? (
                    <ListStateItem
                      className="popup-list-state layer-popup-state"
                      data-testid={`layer-list-state-${layerListState.kind}`}
                      kind={layerListState.kind}
                      title={layerListState.title}
                      action={layerListState.kind === 'error'
                        ? { label: t.common.refresh, onPress: () => { void reloadLayers(); } }
                        : undefined}
                    />
                  ) : flatLayers.map(({ layer, depth }) => {
                    const kindIcon = layerKindIcon(layer.kind);
                    return (
                      <div key={layer.id} data-testid={`layer-row-${layer.id}`} className="layer-item" onClick={() => void addLayer(layer)}>
                        <LayerThumbnail host={services.host} layerId={layer.id} visible={layer.visible} />
                        <div className="layer-body" style={{ '--ui-layer-depth': depth } as CSSProperties}>
                          <span className="layer-name" title={layer.name}>{layer.name}</span>
                          {layer.kind && (
                            <span className="layer-meta">
                              {kindIcon ? <Icon name={kindIcon} size={10} /> : null}
                              <span className="layer-meta-lbl">{layerKindLabel(layer.kind)}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  </List>
                </div>
              </div>
              )}
            </MotionPresenceView>

            <MotionPresenceView visible={attachOpen && !layerOpen} kind="popover">
              {({ ref, state }) => (
              <div ref={ref} className="attach-picker" data-motion-state={state} onClick={(event) => event.stopPropagation()}>
                <div data-testid="attach-ps-layers-option" className="attach-opt" onClick={openLayerPicker}>
                  <div className="attach-opt-ico">
                    <Icon name="ps-layers" size={13} />
                  </div>
                  <div>
                    <div className="attach-opt-label">{t.main.choosePsLayer}</div>
                    <div className="attach-opt-sub">{t.main.layerCount(flatLayers.length)}</div>
                  </div>
                  <Icon className="attach-opt-chevron" name="chevron-right" />
                </div>
                <div data-testid="attach-upload-option" className="attach-opt" onClick={() => void addFile()}>
                  <div className="attach-opt-ico">
                    <Icon name="upload" size={13} />
                  </div>
                  <div>
                    <div className="attach-opt-label">{t.main.uploadFromComputer}</div>
                    <div className="attach-opt-sub">{t.main.uploadFromComputerFormats}</div>
                    <div className="attach-opt-sub attach-opt-hint">{t.main.uploadFromComputerHint}</div>
                  </div>
                </div>
              </div>
              )}
            </MotionPresenceView>

              <div className="attach-row">
                <IconButton
                  data-testid="composer-add-image-button"
                  className="att-add cmp-add"
                  hostClassName="att-add-host"
                  quiet
                  selected={attachOpen || layerOpen}
                  icon={<Icon name="add" />}
                  tooltip={imageInputDisabled ? imageInputDisabledReason : t.main.addImage}
                  placement="top"
                  disabled={imageInputDisabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    setAttachOpen((open) => !open);
                    setLayerOpen(false);
                    setOpenMenu(null);
                    setProfileMenuOpen(false);
                  }}
                />
                {attachments.map((attachment) => (
                  <MotionPresenceView
                    key={attachment.id}
                    visible
                    kind="attachment"
                  >
                    {({ ref, state }) => (
                      <div ref={ref} className="att-thumb" data-motion-state={state}>
                        <MotionHighlight activeKey={highlightKey === `attachment:${attachment.id}` ? highlightKey : null} />
                        {attachment.previewUrl
                          ? <img src={attachment.previewUrl} className="att-thumb-img" alt={attachment.name} />
                          : (
                            <ImageFallbackContent
                              density="thumbnail"
                              state={attachment.previewFallback?.state ?? 'preview-unavailable'}
                              title={imageFallbackTitle(t.imageFallback, attachment.previewFallback?.state ?? 'preview-unavailable')}
                            />
                          )
                        }
                        <IconButton
                          data-testid={`attachment-remove-button-${attachment.id}`}
                          className="att-rm"
                          hostClassName="att-rm-host"
                          quiet
                          icon={<Icon name="close" size={10} />}
                          tooltip={`Remove ${attachment.name}`}
                          placement="top"
                          onClick={() => removeAttachment(attachment.id)}
                        />
                      </div>
                    )}
                  </MotionPresenceView>
                ))}
              </div>
          </div>
          <div className="cmp-core">
            {attachments.length > 0 && imageInputDisabled && (
              <MotionPresenceView visible kind="inline-notice">
                {({ ref, state }) => (
                  <div ref={ref} className="cmp-conflict" data-testid="composer-image-input-conflict" data-motion-state={state}>
                    {t.main.imageInputConflict}
                    <div className="cmp-conflict-actions">
                      <Button
                        className="cmp-conflict-action"
                        onClick={() => {
                          setOpenMenu('model');
                          setAttachOpen(false);
                          setLayerOpen(false);
                        }}
                      >
                        {t.main.chooseCompatibleModel}
                      </Button>
                      <Button className="cmp-conflict-action" onClick={removeAllAttachments}>
                        {t.main.removeImages}
                      </Button>
                    </div>
                  </div>
                )}
              </MotionPresenceView>
            )}
            <div className="cmp-body">
              <div className="cmp-ta-shell">
                <UxpTextArea
                  data-testid="composer-textarea"
                  controlRef={taRef}
                  className="cmp-ta"
                  placeholder={comfyUiMode || selectedProvider ? t.main.promptPlaceholderReady : t.main.promptPlaceholderNoProfile}
                  value={input}
                  onValue={composerDraft.setInput}
                  nativeEditorSuspended={composerTextAreaNeedsUxpPopupOverlapWorkaround}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !isImeCompositionKey(event)) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                />
              </div>
            <div className="cmp-action-row" data-testid="composer-action-row">
              <div className="cmp-action-left">
                <MotionButtonSurface>
                  <IconButton
                    data-testid="composer-mask-toggle"
                    className="cmp-mask-toggle"
                    hostClassName="cmp-mask-toggle-host"
                    quiet
                    toggles
                    selected={workspace.maskPreference.enabled}
                    icon={<Icon name={workspace.maskPreference.enabled ? 'mask-on-filled' : 'mask-off'} size={13} />}
                    tooltip={t.main.maskToggleLabel(workspace.maskPreference.enabled)}
                    aria-label={t.main.maskToggleLabel(workspace.maskPreference.enabled)}
                    placement="top"
                    iconSize={13}
                    disabled={workspace.maskToggleDisabled}
                    onClick={() => workspace.setMaskEnabled(!workspace.maskPreference.enabled)}
                  />
                </MotionButtonSurface>
                {workspace.maskState.kind === 'error' ? (
                  <Button className="cmp-mask-retry" onClick={workspace.retryMask}>{t.main.retryMask}</Button>
                ) : null}
              </div>
              <div className="cmp-action-right">
                <MotionButtonSurface>
                  <IconButton
                    data-testid="composer-capture-button"
                    className="cmp-capture"
                    hostClassName="cmp-capture-host"
                    icon={captureInFlight
                      ? <MotionActivityIcon className="cmp-capture-icon"><Icon name="spinner" size={13} /></MotionActivityIcon>
                      : <Icon name="capture-selection" size={13} className="cmp-capture-icon" />}
                    tooltip={imageInputDisabled ? imageInputDisabledReason : t.main.captureActionHint}
                    aria-label={imageInputDisabled ? imageInputDisabledReason : t.main.captureActionHint}
                    placement="top"
                    iconSize={13}
                    disabled={!canCapture}
                    onClick={(event) => {
                      event.stopPropagation();
                      setOpenMenu(null);
                      setAttachOpen(false);
                      setLayerOpen(false);
                      void captureFromPhotoshop();
                    }}
                  />
                </MotionButtonSurface>
                <div className="send-wrap">
                  <MotionButtonSurface>
                    <IconButton
                      data-testid="composer-send-button"
                      variant="accent"
                      className="cmp-send"
                      hostClassName="cmp-send-host"
                      overlayClassName="cmp-send-overlay"
                      icon={<Icon name="send" />}
                      tooltip={composerReadinessText}
                      aria-label={composerReadinessText}
                      placement="top"
                      iconSize={13}
                      disabled={!canSend}
                      onClick={() => void handleSend()}
                    />
                  </MotionButtonSurface>
                </div>
              </div>
            </div>
            </div>
            {maskStatusText ? <div className="cmp-readiness" data-testid="composer-mask-status" data-state={workspace.maskState.kind}>{maskStatusText}</div> : null}
            {viewModel.notices.length > 0 ? (
              <div className="cmp-readiness" data-testid="generation-workspace-notices">
                {viewModel.notices.map((notice) => <div key={notice}>{notice}</div>)}
              </div>
            ) : null}
          </div>
          <div className="cmp-footer">
            <div className="cmp-meta-row" data-testid="composer-configuration-summary" title={[configurationSummary.model, ...configurationSummary.details.map(({ value }) => value)].join(' · ')} aria-label={`Current configuration: ${[configurationSummary.model, ...configurationSummary.details.map(({ value }) => value)].join(' · ')}`}>
              <span className="cmp-summary-model">{configurationSummary.model}</span>
              {configurationSummary.details.length ? <span className="cmp-summary-details">{configurationSummary.details.map((detail) => <span key={detail.key} className={`cmp-summary-detail cmp-summary-detail-${detail.key}`} data-kind={detail.key}>{detail.value}</span>)}</span> : null}
              {showFooterReadiness ? <MotionContent watch={composerReadinessState}>
                <HelpText className="cmp-readiness" data-testid="composer-readiness-status" data-state={composerReadinessState}>{composerReadinessText}</HelpText>
              </MotionContent> : null}
            </div>
            <Divider className="cmp-footer-divider" />
            <div className="cmp-toolbar" data-testid="composer-toolbar">
              <div className="cmp-parameter-row cmp-model-row">
              <ComposerParameterField label="Model" className="cmp-model-slot" title={viewModel.target.remotePath ?? viewModel.target.label}>
              <ComposerSelect
                testId="generation-current-target-summary"
                triggerKind="text"
                containerClassName="cmp-select cmp-select-model cmp-select-labeled"
                menuClassName="cmp-select-menu cmp-select-menu-model"
                label={comfyUiMode ? t.settings.comfyUiWorkflowTarget : 'Model'}
                value={selectedModelLabel}
                disabled={comfyUiMode || (!comfyUiMode && modelOptions.length <= 1)}
                open={openMenu === 'model'}
                onOpenChange={(open) => {
                  handleOpenComposerMenu('model', open);
                }}
                options={modelOptions}
                selectedId={selectedModelId}
                onSelect={handleSelectModel}
              />
            </ComposerParameterField>
              </div>
            {!comfyUiMode ? <>
              <div className="cmp-parameter-row cmp-secondary-row">
                <ComposerParameterField label="Prompt" className="cmp-prompt-slot"><ComposerSelect
                  testId="composer-prompt-template-selector"
                  triggerId="composer-prompt-template-trigger"
                  triggerKind="text"
                  label={t.settings.promptTemplates}
                  value={currentTemplate.name}
                  selectedId={currentTemplate.id}
                  open={promptTemplateMenuOpen}
                  onOpenChange={(open) => handleOpenComposerMenu('prompt-template', open)}
                  options={promptSettings.templates.map((template) => ({ id: template.id, label: template.name }))}
                  onSelect={onSelectPromptTemplate}
                /></ComposerParameterField>
                {ratioSizeProjection.ratio ? <ComposerParameterField label="Ratio" className="cmp-ratio-slot"><ComposerSelect
                  testId="composer-ratio-selector"
                  triggerKind="text"
                  label="Ratio"
                  value={ratioSizeProjection.ratio.value}
                  open={openMenu === 'ratio'}
                  onOpenChange={(open) => handleOpenComposerMenu('ratio', open)}
                  options={composerRatioChoices(ratioSizeProjection)}
                  selectedId={ratioSizeProjection.ratio.value}
                  onSelect={(nextRatio) => {
                    const source = resolveComposerRatioSizeSource(ratioSizeProjection, nextRatio, ratioSizeProjection.size?.value ?? '');
                    if (ratioSizeProjection.compositePairs && ratioSizeProjection.sourceName && source) workspace.setCatalogParameter(ratioSizeProjection.sourceName, source);
                    else if (ratioSizeProjection.ratioSourceName) workspace.setCatalogParameter(ratioSizeProjection.ratioSourceName, nextRatio);
                  }}
                /></ComposerParameterField> : null}
                {ratioSizeProjection.size ? <ComposerParameterField label="Size" className="cmp-size-slot"><ComposerSelect
                  testId="composer-size-selector"
                  triggerKind="text"
                  label="Size"
                  value={ratioSizeProjection.size.value}
                  open={openMenu === 'size'}
                  onOpenChange={(open) => handleOpenComposerMenu('size', open)}
                  options={composerSizeChoices(ratioSizeProjection)}
                  selectedId={ratioSizeProjection.size.value}
                  onSelect={(nextSize) => {
                    const source = resolveComposerRatioSizeSource(ratioSizeProjection, ratioSizeProjection.ratio?.value ?? '', nextSize);
                    if (ratioSizeProjection.compositePairs && ratioSizeProjection.sourceName && source) workspace.setCatalogParameter(ratioSizeProjection.sourceName, source);
                    else if (ratioSizeProjection.sizeSourceName) workspace.setCatalogParameter(ratioSizeProjection.sizeSourceName, nextSize);
                  }}
                /></ComposerParameterField> : null}
              </div>
              {Object.keys(catalogParameters).some((name) => !['aspectRatio', 'resolution', 'imageSize'].includes(name)) ? <div className="cmp-advanced-toggle-row"><Button
                  data-testid="composer-advanced-toggle"
                  className="cmp-advanced-toggle"
                  aria-expanded={advancedParametersOpen}
                  aria-controls="composer-advanced-parameters"
                  onClick={() => setAdvancedParametersOpen((current) => !current)}
                ><span className="cmp-advanced-toggle-content">{advancedParametersOpen ? 'Hide advanced inputs' : 'Show advanced inputs'}<Icon name="tune" size={16} /></span></Button></div> : null}
              {advancedParametersOpen ? <div id="composer-advanced-parameters" className="cmp-parameter-row cmp-advanced-row" data-testid="composer-advanced-parameters">
              {Object.entries(catalogParameters).filter(([name]) => !['aspectRatio', 'resolution', 'imageSize'].includes(name)).map(([name, parameter]) => {
                const options = parameter.options.map((option) => ({ id: option.value, label: /provider default/iu.test(option.label) ? 'default' : option.label }));
                const value = catalogParameterValues[name] ?? parameter.default;
                const label = name === 'input_fidelity' ? 'Input fidelity' : name.replace(/_/gu, ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
                return <ComposerParameterField key={name} label={label} className="cmp-advanced-field" testId={`composer-catalog-field-${name}`}><ComposerSelect
                  testId={`composer-catalog-parameter-${name}`}
                  triggerKind="text"
                  containerClassName="cmp-select cmp-select-advanced"
                  menuClassName="cmp-select-menu cmp-select-menu-compact"
                  label={label}
                  value={optionLabel(options, value)}
                  disabled={options.length === 0}
                  open={openMenu === `catalog:${name}`}
                  onOpenChange={(open) => handleOpenComposerMenu(`catalog:${name}`, open)}
                  options={options}
                  selectedId={value}
                  onSelect={(next) => workspace.setCatalogParameter(name, next)}
                /></ComposerParameterField>;
              })}
              </div> : null}
            </> : null}
          </div>
          </div>
          </MotionDimSurface>

        <MotionPresenceView visible={scrolledAway} kind="floating">
          {({ ref, state }) => (
            <IconButton
              ref={ref}
              data-testid="back-to-bottom-button"
              className="back-to-bottom"
              hostClassName="back-to-bottom-host"
              data-motion-state={state}
              icon={<Icon name="chevron-down" size={10} />}
              tooltip="Back to bottom"
              aria-label="Back to bottom"
              iconSize={10}
              onClick={(event) => {
                event.stopPropagation();
                scrollToBottom();
              }}
            />
          )}
        </MotionPresenceView>
      </footer>
    </div></PageFrame>
  );
}
