import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import type { HostPort, LayerInfo } from '../../ports/host-port';
import { suggestedGeneratedImageFileName } from '../../domain/asset-file';
import { assetToPreviewUrl } from '../../domain/mappers';
import { formatBalanceChange, formatBillingPrimary, formatBillingPrimaryParts, formatExactTaskCost } from '../../domain/mappers';
import type {
  ConversationAttachment,
  ConversationController,
  ConversationRound,
} from '../hooks/use-conversation';
import { derivePlacementIntent } from '../hooks/use-conversation';
import type { ComposerDraftController } from '../hooks/use-composer-draft';
import { useProfileBilling } from '../hooks/use-profile-billing';
import { descriptorForApiFormat, providerSupportsBalanceQuery, useProviderCatalog } from '../hooks/use-provider-settings';
import { useLayerThumbnail } from '../hooks/use-layer-thumbnail';
import { Icon } from '../components/icons';
import { IconSelect } from '../components/icon-select';
import { UxpTextArea } from '../components/uxp-form-controls';
import { ProviderIdentity } from '../components/provider-identity';
import { useToast } from '../components/toast-host';
import {
  MotionActivityDot,
  MotionActivityIcon,
  MotionButtonSurface,
  MotionContent,
  MotionDimSurface,
  MotionHighlight,
  MotionImage,
  MotionPresenceView,
} from '../components/motion-ui';
import { IconButton } from '../primitives/icon-button';
import { Button } from '../primitives/native-controls';
import { useI18n } from '../i18n/i18n-context';
import type { ProviderInputSizePolicy } from '../../image/resize';
import {
  providerInputSizePresetToMaxSide,
  type AppGenerationSettings,
  type AppOutputSizePreset,
} from '../../ports/app-generation-settings';
import { MOTION_FEEDBACK_DWELL } from '../motion';
import {
  deriveComposerReadiness,
  modelSupportsImageInput,
  modelSupportsOperation,
  modelSupportsOutputSize,
  supportedSizePresetsForOperation,
  type ComposerOperation,
  type ComposerReadinessState,
} from '../composer-readiness';
import { classifyRoundError, type ErrorPrimaryAction } from '../error-action';
import type { BalanceChange, ExactTaskCost } from '@imagen-ps/application';
import { canSelectOutputSize, OUTPUT_SIZE_PRESETS, outputSizeLabel, type OutputSizeSelectionContext } from '../output-size';
import type { UiModelInfo } from '../model-info';

function isImeCompositionKey(event: React.KeyboardEvent): boolean {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { readonly isComposing?: boolean };
  return nativeEvent.isComposing === true || nativeEvent.keyCode === 229;
}

interface MainPageProps {
  readonly onNav: (view: string) => void;
  readonly profiles: readonly ProviderProfile[];
  readonly profilesLoading: boolean;
  readonly profilesError: string | null;
  readonly selectedProfile: ProviderProfile | undefined;
  readonly selectedProfileId: string | null;
  readonly onSelectProfile: (profileId: string | null) => void;
  readonly models: readonly UiModelInfo[];
  readonly modelsLoading: boolean;
  readonly modelsError: string | null;
  readonly selectedModelId: string;
  readonly onSelectModel: (modelId: string) => void;
  readonly layers: readonly LayerInfo[];
  readonly layersError: string | null;
  readonly layersLoading: boolean;
  readonly reloadLayers: () => Promise<void>;
  readonly conversation: ConversationController;
  readonly highlightedRoundId?: string | null;
  readonly onEditProfile?: (profileId: string) => void;
  readonly composerDraft: ComposerDraftController;
  readonly outputSizeContext: OutputSizeSelectionContext;
  readonly generationSettings: AppGenerationSettings;
  readonly onChangeOutputSizePreset: (sizePreset: AppOutputSizePreset) => Promise<void>;
  readonly restoreFailedRoundId?: string | null;
  readonly onFailedRoundRestored?: (roundId: string) => void;
}

type PlaceStatus = 'idle' | 'placing' | 'placed';

type RoundBillingMeta =
  | { readonly kind: 'cost'; readonly cost: ExactTaskCost }
  | { readonly kind: 'balance-change'; readonly change: BalanceChange };

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
      style={{
        background: visible === false
          ? 'var(--app-color-background-layer-1)'
          : 'var(--app-color-background-layer-2)',
      }}
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

function roundStatusElapsed(round: ConversationRound): string {
  if (round.status === 'running') {
    return `${round.elapsedSeconds}s`;
  }
  return round.elapsedLabel ?? '';
}

function statusDot(status: ConversationRound['status']): string {
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
  return model.configured === true && model.selected === true;
}

function firstSupportedSize(model: UiModelInfo | undefined, operation: ComposerOperation): AppOutputSizePreset | null {
  const presets = supportedSizePresetsForOperation(model, operation);
  return presets === 'unknown' ? null : presets[0] ?? null;
}

function readinessMessage(t: ReturnType<typeof useI18n>['messages'], state: ComposerReadinessState): string {
  switch (state) {
    case 'ready':
      return t.main.readinessReady;
    case 'generation-in-progress':
      return t.main.readinessGenerationInProgress;
    case 'select-profile':
      return t.main.readinessSelectProfile;
    case 'checking-profile':
      return t.main.readinessCheckingProfile;
    case 'profile-load-failed':
      return t.main.readinessProfileLoadFailed;
    case 'select-model':
      return t.main.readinessSelectModel;
    case 'loading-models':
      return t.main.readinessLoadingModels;
    case 'model-unavailable':
      return t.main.readinessModelUnavailable;
    case 'preparing-attachment':
      return t.main.readinessPreparingAttachment;
    case 'attachment-failed':
      return t.main.readinessAttachmentFailed;
    case 'model-does-not-support-image-edit':
      return t.main.readinessModelNoImageEdit;
    case 'model-does-not-support-text-to-image':
      return t.main.readinessModelNoTextToImage;
    case 'size-unsupported':
      return t.main.readinessSizeUnsupported;
    case 'resolve-placement-conflict':
      return t.main.readinessPlacementConflict;
    case 'enter-prompt':
      return t.main.readinessEnterPrompt;
  }
}

function modelAvailabilityReason(_model: UiModelInfo | undefined, _t: ReturnType<typeof useI18n>['messages']): string | null {
  return null;
}

function modelCapabilityReason(
  model: UiModelInfo | undefined,
  operation: ComposerOperation,
  outputSizePreset: AppOutputSizePreset,
  t: ReturnType<typeof useI18n>['messages'],
): string | null {
  const operationSupport = modelSupportsOperation(model, operation);
  if (operationSupport === 'unsupported') {
    return operation === 'image-edit'
      ? t.main.modelReasonNoImageEdit
      : t.main.modelReasonNoTextToImage;
  }
  if (modelSupportsOutputSize(model, operation, outputSizePreset) === 'unsupported') {
    return t.main.modelReasonSizeUnsupported(outputSizeLabel(outputSizePreset));
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

function mediaShapeFromSize(size: string | undefined): 'portrait' | 'square' | 'landscape' | 'wide' | 'tall' | 'unknown' {
  const match = size?.match(/(\d+)\s*[x×]\s*(\d+)/i);
  if (!match) {
    return 'unknown';
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return 'unknown';
  }
  const ratio = width / height;
  if (ratio < 0.55) return 'tall';
  if (ratio < 0.9) return 'portrait';
  if (ratio > 2.4) return 'wide';
  if (ratio > 1.15) return 'landscape';
  return 'square';
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
  profiles,
  profilesLoading,
  profilesError,
  selectedProfile,
  selectedProfileId,
  onSelectProfile,
  models,
  modelsLoading,
  modelsError,
  selectedModelId,
  onSelectModel,
  layers,
  layersError,
  layersLoading,
  reloadLayers,
  conversation,
  highlightedRoundId,
  onEditProfile,
  composerDraft,
  outputSizeContext,
  generationSettings,
  onChangeOutputSizePreset,
  restoreFailedRoundId,
  onFailedRoundRestored,
}: MainPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<'model' | 'output-size' | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [captureInFlight, setCaptureInFlight] = useState(false);
  const { show } = useToast();
  const providers = useProviderCatalog(services);
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [selectedPreviewIndexes, setSelectedPreviewIndexes] = useState<Record<string, number>>({});
  const [placeStatus, setPlaceStatus] = useState<Record<string, PlaceStatus>>({});
  const [roundBillingMeta, setRoundBillingMeta] = useState<Record<string, RoundBillingMeta>>({});
  const [sizeUserSelected, setSizeUserSelected] = useState(false);
  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});
  const [overflowingResponses, setOverflowingResponses] = useState<Record<string, boolean>>({});
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [scrolledAway, setScrolledAway] = useState(false);
  const convRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const responseFoldRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const responseTextRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const previousRoundStatusRef = useRef<Record<string, ConversationRound['status']>>({});
  const lastSizeAutoScopeRef = useRef<string>('');
  const flatLayers = useMemo(() => flattenLayers(layers), [layers]);
  const uniqueModels = useMemo(() => dedupeById(models), [models]);
  const { input, attachments } = composerDraft;

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
  const selectedDescriptor = selectedProfile ? descriptorForApiFormat(providers, selectedProfile.apiFormat) : undefined;
  const billing = useProfileBilling(services, selectedProfileId, providerSupportsBalanceQuery(selectedDescriptor, selectedProfile ?? null));
  const billingPrimaryParts = formatBillingPrimaryParts(billing.billing);
  const billingPrimaryHasNumericEmphasis = billingPrimaryParts ? /\d/.test(billingPrimaryParts.primary) : false;
  const billingSummaryText = formatBillingPrimary(billing.billing) ?? t.main.billingUnknown;
  const billingSummaryTitle = `${t.main.billingSummary}: ${billingSummaryText}`;
  const selectableProfiles = profiles;
  const selectedModelLabel = selectedModelId || (modelsLoading ? t.main.modelLoading : t.main.modelUnselected);
  const selectedModelInfo = uniqueModels.find((model) => model.id === selectedModelId);
  const currentOperation = composerDraft.operation;
  const placementIntent = useMemo(() => derivePlacementIntent(attachments), [attachments]);
  const modelOptions = useMemo(
    () => uniqueModels.map((model) => ({
      id: model.id,
      label: model.displayName ?? model.id,
    })),
    [uniqueModels],
  );
  const outputSizeOptions = useMemo(
    () => OUTPUT_SIZE_PRESETS.map((size) => ({
      id: size,
      label: outputSizeLabel(size),
    })),
    [],
  );
  const currentPromptValue = () => taRef.current?.value ?? input;
  const composerTextAreaNeedsUxpPopupOverlapWorkaround = openMenu !== null;
  const syncComposerInputBeforeMenuOpen = useCallback(() => {
    const liveValue = taRef.current?.value;
    if (liveValue !== undefined && liveValue !== input) {
      composerDraft.setInput(liveValue);
    }
    taRef.current?.blur();
  }, [composerDraft, input]);
  const handleOpenComposerMenu = useCallback((menu: 'model' | 'output-size', open: boolean) => {
    setProfileMenuOpen(false);
    if (open) {
      syncComposerInputBeforeMenuOpen();
    }
    setOpenMenu(open ? menu : null);
  }, [syncComposerInputBeforeMenuOpen]);

  const readiness = deriveComposerReadiness({
    running: conversation.running,
    profilesLoading,
    profilesError,
    hasSelectedProfile: Boolean(selectedProfile),
    modelsLoading,
    modelsError,
    selectedModelId,
    selectedModel: selectedModelInfo,
    attachmentPreparing: captureInFlight,
    attachmentFailed: false,
    operation: currentOperation,
    outputSizePreset: generationSettings.outputSizePreset,
    placementIntent,
    prompt: input,
  });
  const readinessText = readinessMessage(t, readiness.state);
  const canSend = readiness.canSend;
  const imageInputSupport = modelSupportsImageInput(selectedModelInfo);
  const imageInputDisabled = imageInputSupport === 'unsupported';
  const imageInputDisabledReason = t.main.imageInputDisabledForModel;
  const canCapture = !conversation.running && !captureInFlight && !imageInputDisabled;
  const responseTextKey = (roundId: string) => `response:${roundId}`;
  const pendingBillingProfileIdRef = useRef<string | null>(null);
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
    const support = modelSupportsOutputSize(selectedModelInfo, currentOperation, generationSettings.outputSizePreset);
    if (support !== 'unsupported') {
      return;
    }
    const fallback = firstSupportedSize(selectedModelInfo, currentOperation);
    if (!fallback) {
      return;
    }
    if (sizeUserSelected && supportedSizePresetsForOperation(selectedModelInfo, currentOperation) !== 'unknown') {
      return;
    }
    if (fallback === generationSettings.outputSizePreset) {
      return;
    }
    const from = outputSizeLabel(generationSettings.outputSizePreset);
    const to = outputSizeLabel(fallback);
    void onChangeOutputSizePreset(fallback).then(() => {
      show(t.main.outputSizeAutoChanged(from, to), 'info', { key: 'output-size-auto-changed' });
    });
  }, [
    currentOperation,
    generationSettings.outputSizePreset,
    onChangeOutputSizePreset,
    selectedModelInfo,
    show,
    sizeUserSelected,
    t.main,
  ]);

  const observeBillingForSubmittedRound = useCallback(async (roundId: string) => {
    const observed = await billing.observeAsyncRefresh();
    if (!observed) {
      return;
    }
    if (observed.lastExactTaskCost) {
      setRoundBillingMeta((current) => ({ ...current, [roundId]: { kind: 'cost', cost: observed.lastExactTaskCost! } }));
      return;
    }
    if (observed.lastBalanceChange) {
      setRoundBillingMeta((current) => ({ ...current, [roundId]: { kind: 'balance-change', change: observed.lastBalanceChange! } }));
    }
  }, [billing]);

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
    setRoundBillingMeta((current) => {
      let changed = false;
      const liveRoundIds = new Set(conversation.rounds.map((round) => round.id));
      const next: Record<string, RoundBillingMeta> = {};
      for (const [roundId, meta] of Object.entries(current)) {
        if (liveRoundIds.has(roundId)) {
          next[roundId] = meta;
        } else {
          changed = true;
        }
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
    measureResponseOverflow();
  }, [conversation.rounds, expandedResponses, measureResponseOverflow]);

  useEffect(() => {
    window.addEventListener('resize', measureResponseOverflow);
    return () => window.removeEventListener('resize', measureResponseOverflow);
  }, [measureResponseOverflow]);

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

  const handleSelectModel = useCallback((modelId: string) => {
    const model = uniqueModels.find((item) => item.id === modelId);
    const availabilityReason = modelAvailabilityReason(model, t);
    const capabilityReason = modelCapabilityReason(model, currentOperation, generationSettings.outputSizePreset, t);
    if (!modelIsSelectable(model) || capabilityReason !== null) {
      show(availabilityReason ?? capabilityReason ?? t.main.readinessModelUnavailable, 'warning', {
        key: `model-select-unavailable:${modelId}`,
      });
      return;
    }
    onSelectModel(modelId);
  }, [currentOperation, generationSettings.outputSizePreset, onSelectModel, show, t, uniqueModels]);

  const restoreRound = (round: ConversationRound) => {
    composerDraft.setInput(round.prompt);
    if (round.modelId && uniqueModels.some((model) => model.id === round.modelId)) {
      onSelectModel(round.modelId);
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

  useEffect(() => {
    const scope = `${selectedModelId}:${currentOperation}`;
    if (lastSizeAutoScopeRef.current === scope) {
      return;
    }
    lastSizeAutoScopeRef.current = scope;
    setSizeUserSelected(false);
  }, [currentOperation, selectedModelId]);

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

  const selectProfile = (profileId: string) => {
    if (profileId !== selectedProfileId) {
      composerDraft.clearAttachments();
    }
    onSelectProfile(profileId);
    setProfileMenuOpen(false);
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
        previewUrl: image.preview.url ?? assetToPreviewUrl(image.asset),
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
    setLayerOpen(true);
    void reloadLayers();
  };

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
        previewUrl: image.preview.url ?? assetToPreviewUrl(image.asset),
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
      addAttachment({
        id: attachmentId('capture'),
        type: 'photoshop-capture',
        name: result.image.asset.name ?? (result.sourceKind === 'selection' ? t.main.captureSelection : t.main.captureLayer),
        image: result.image,
        previewUrl: result.image.preview.url ?? assetToPreviewUrl(result.image.asset),
        photoshopPlacement: result.placement,
      });
      show(t.toast.captureAdded, 'positive', { key: 'attachment-capture-added' });
    } catch (error) {
      show(error instanceof Error ? error.message : t.toast.captureFailed, 'negative', { key: 'attachment-capture-error' });
    } finally {
      setCaptureInFlight(false);
    }
  };

  const handleSend = async () => {
    if (!canSend) {
      if (readiness.state !== 'ready') {
        show(readinessText, readiness.state === 'model-unavailable' ? 'warning' : 'info', { key: 'send-readiness' });
      }
      return;
    }
    if (!selectedProfile) {
      return;
    }
    const prompt = currentPromptValue().trim();
    if (prompt.length === 0) {
      return;
    }
    if (/^\/new\b$/i.test(prompt)) {
      if (conversation.running) {
        show(t.toast.waitForRunningTask, 'info', { key: 'send-wait-running' });
      } else {
        conversation.clear();
        show(t.toast.newSessionStarted, 'info', { key: 'session-new' });
      }
      return;
    }
    composerDraft.reset({ releaseAttachments: false });
    pendingBillingProfileIdRef.current = selectedProfile.profileId;
    await conversation.submit({
      operation: attachments.length > 0 ? 'image-edit' : 'text-to-image',
      prompt,
      profileId: selectedProfile.profileId,
      apiFormat: selectedProfile.apiFormat,
      providerName: selectedProfile.displayName,
      ...(selectedModelId ? { modelId: selectedModelId } : {}),
      attachments,
      output: {
        count: 1,
        sizePreset: generationSettings.outputSizePreset,
        outputFormat: generationSettings.outputFormat,
        aspectRatio: generationSettings.aspectRatio,
      },
      providerInputSizePreset: generationSettings.providerInputSizePreset,
    });
  };

  useEffect(() => {
    if (!billing.error) {
      return;
    }
    if (pendingBillingProfileIdRef.current !== null) {
      return;
    }
    if (billing.billing?.refreshState !== 'error') {
      return;
    }
    // Manual or passive refresh failure should stay isolated from generation success.
  }, [billing.billing?.refreshState, billing.error]);

  useEffect(() => {
    let observedRoundId: string | null = null;
    const next: Record<string, ConversationRound['status']> = {};
    for (const round of conversation.rounds) {
      next[round.id] = round.status;
      const previous = previousRoundStatusRef.current[round.id];
      if (
        pendingBillingProfileIdRef.current &&
        (previous === 'running' || previous === undefined) &&
        round.status === 'ok' &&
        round.profileId === pendingBillingProfileIdRef.current &&
        roundBillingMeta[round.id] === undefined
      ) {
        observedRoundId = round.id;
      }
    }
    previousRoundStatusRef.current = next;
    if (observedRoundId) {
      pendingBillingProfileIdRef.current = null;
      void observeBillingForSubmittedRound(observedRoundId);
    }
  }, [conversation.rounds, observeBillingForSubmittedRound, roundBillingMeta]);

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

  const selectOutputSize = async (nextSize: AppOutputSizePreset) => {
    const result = canSelectOutputSize(outputSizeContext, nextSize, t);
    if (!result.ok) {
      show(result.reason, 'warning', { key: `output-size-rejected:${nextSize}` });
      return;
    }
    await onChangeOutputSizePreset(result.nextSize);
  };

  return (
    <div className="page" onClick={closeAll}>
      <header className="hdr">
        <IconButton
          data-testid="main-history-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="history" />}
          tooltip={t.main.history}
          placement="bottom"
          onClick={(event) => { event.stopPropagation(); onNav('history'); }}
        />
        <div className="hdr-center-wrap">
          <IconButton
            data-testid="main-profile-selector"
            className={`hdr-center hdr-provider-trigger${profileMenuOpen ? ' open' : ''}`}
            aria-haspopup="listbox"
            aria-expanded={profileMenuOpen}
            text={selectedProfile?.displayName ?? t.main.noProviderProfile}
            tooltip={selectedProfile?.displayName ?? t.main.noProviderProfile}
            onClick={(event) => {
              event.stopPropagation();
              setProfileMenuOpen((open) => !open);
              setOpenMenu(null);
            }}
          />
          <MotionPresenceView visible={profileMenuOpen} kind="popover">
            {({ ref, state }) => (
            <div ref={ref} className="model-menu hdr-model-menu" data-motion-state={state} onClick={(event) => event.stopPropagation()}>
              {profilesLoading && <div className="model-opt">{t.main.loadingProfiles}</div>}
              {profilesError && <div className="model-opt">{profilesError}</div>}
              {!profilesLoading && selectableProfiles.length === 0 && (
                <div data-testid="profile-menu-add-provider" className="model-opt" onClick={() => onNav('settings-add')}>{t.main.addProviderProfile}</div>
              )}
              {selectableProfiles.map((profile) => (
                <button
                  key={profile.profileId}
                  type="button"
                  data-testid={`profile-menu-option-${profile.profileId}`}
                  className={`model-opt${profile.profileId === selectedProfileId ? ' act' : ''}`}
                  onClick={() => selectProfile(profile.profileId)}
                >
                  {profile.profileId === selectedProfileId && <Icon name="check" />}
                  <span>{profile.displayName}</span>
                </button>
              ))}
            </div>
            )}
          </MotionPresenceView>
        </div>
        <IconButton
          data-testid="main-providers-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="settings" />}
          tooltip="Providers"
          placement="bottom"
          onClick={(event) => { event.stopPropagation(); onNav('settings'); }}
        />
      </header>

      <div className="scroll" ref={convRef}>
        <div className="round-list">
          <div className="day-sep">
            <div className="day-sep-line" /><span className="day-sep-lbl">{t.main.currentSession}</span><div className="day-sep-line" />
          </div>

          {conversation.rounds.length === 0 && (
            <div className="conv-empty">
              <div style={{ color: 'var(--app-color-text-secondary)', fontSize: 13 }}>{t.main.emptyHint}</div>
              <div className="empty-hints">
                <button className="empty-hint" onClick={() => composerDraft.setInput(t.main.promptSuggestionProductValue)}>
                  {t.main.promptSuggestionProductLabel}
                </button>
                <button className="empty-hint" onClick={() => composerDraft.setInput(t.main.promptSuggestionCyberpunkValue)}>
                  {t.main.promptSuggestionCyberpunkLabel}
                </button>
                <button className="empty-hint" onClick={() => composerDraft.setInput(t.main.promptSuggestionLayerValue)}>
                  {t.main.promptSuggestionLayerLabel}
                </button>
              </div>
            </div>
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
                              : <div className="bimg-bg" style={{ background: 'var(--app-color-background-layer-2)' }} />
                            }
                            {index === 1 && round.attachments.length > 2 && (
                              <div className="bimg-count">+{round.attachments.length - 1}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="user-prompt">{round.prompt}</div>
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
                <div className="msg-prov msg-prov-surface" style={{ marginTop: 4 }}>
                  {(() => {
                    const failure = classifyRoundError(round.errorMessage);
                    const requestCopyKey = requestIdCopyKey(round.id);
                    const handlePrimaryErrorAction = () => {
                      switch (failure.primaryAction) {
                        case 'open-provider-settings':
                          if (round.profileId && onEditProfile) {
                            onEditProfile(round.profileId);
                          }
                          return;
                        case 'choose-supported-size':
                          setOpenMenu('output-size');
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
                          <button
                            data-testid={`error-primary-action-button-${round.id}`}
                            className="err-retry"
                            disabled={conversation.running}
                            onClick={handlePrimaryErrorAction}
                          >
                            {primaryActionLabel(t, failure.primaryAction)}
                          </button>
                          {showFillComposerSecondary ? (
                            <button
                              data-testid={`error-fill-composer-button-${round.id}`}
                              className="err-retry err-retry-secondary"
                              disabled={conversation.running}
                              onClick={() => fillComposerFromFailedRound(round)}
                            >
                              {t.main.errorActionFillComposer}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {round.status === 'running' && (
                <div className="msg-prov msg-prov-surface" style={{ marginTop: 4 }}>
                  <div className="prov-card">
                    <div className="prov-top">
                      <ProviderIdentity
                        providerName={round.providerName}
                        modelLabel={round.modelId}
                        disabled={!onEditProfile || !round.profileId}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (round.profileId && onEditProfile) {
                            onEditProfile(round.profileId);
                          }
                        }}
                      />
                      <div className="prov-status">
                        <span className="sdot run" />
                        <span className="prov-status-text run">
                          {(round.elapsedSeconds <= 0 ? t.main.runningPhaseSubmitting : t.main.runningPhaseGenerating)} · {roundStatusElapsed(round)}
                        </span>
                      </div>
                    </div>
                    <div className="prov-loading">
                      <div className="ldots">
                        <MotionActivityDot className="ldot" />
                        <MotionActivityDot className="ldot" />
                        <MotionActivityDot className="ldot" />
                      </div>
                      <span style={{ fontFamily: 'var(--app-font-family-mono)', fontSize: 11, color: 'var(--app-color-text-muted)' }}>{round.elapsedSeconds <= 0 ? t.main.runningPhaseSubmitting : t.main.runningPhaseGenerating}</span>
                    </div>
                  </div>
                </div>
              )}

              {round.status === 'ok' && (() => {
                const hasImages = round.previews.length > 0;
                const hasResponseText = Boolean(round.responseText?.trim());
                const showResponseText = hasResponseText;
                const responseExpanded = Boolean(expandedResponses[round.id]);
                const responseOverflows = Boolean(overflowingResponses[round.id]);
                const selectedPreviewIndex = previewIndexForRound(round);
                const preview = round.previews[selectedPreviewIndex];
                const hasMultiplePreviews = round.previews.length > 1;
                const copyKey = responseTextKey(round.id);
                const providerModelLabel = round.modelId || selectedModelLabel;
                const canGoPrev = selectedPreviewIndex > 0;
                const canGoNext = selectedPreviewIndex < round.previews.length - 1;
                const billingMeta = roundBillingMeta[round.id];
                return (
                <div className="msg-prov msg-prov-surface" style={{ marginTop: 4 }}>
                  <div className={`prov-card${hasImages ? ` prov-card-media media-${mediaShapeFromSize(round.outputSize)}` : ' prov-card-text-only'}`}>
                    <div className="prov-top">
                      <ProviderIdentity
                        providerName={round.providerName}
                        modelLabel={providerModelLabel}
                        disabled={!onEditProfile || !round.profileId}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (round.profileId && onEditProfile) {
                            onEditProfile(round.profileId);
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
                    {showResponseText && round.responseText && (
                      <div
                        className="prov-response"
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
                            <button
                              type="button"
                              data-testid={`result-response-toggle-${round.id}`}
                              className="prov-response-toggle"
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedResponses((current) => ({ ...current, [round.id]: !responseExpanded }));
                              }}
                            >
                              {responseExpanded ? `${t.main.collapseResponse} ▴` : `${t.main.expandResponse} ▾`}
                            </button>
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
                    )}
                    {hasImages ? (
                      <div className="prov-img">
                        <div className={`img-result media-${mediaShapeFromSize(round.outputSize)}`} data-testid={`result-preview-${round.id}`} data-preview-index={selectedPreviewIndex}>
                          {preview?.url
                            ? <MotionImage key={`${round.id}:${selectedPreviewIndex}`} src={preview.url} className="img-bg" alt={preview.label} />
                            : <div className="img-bg" style={{ background: 'var(--app-color-background-layer-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.main.noAssetPreview}</div>
                          }
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
                        </div>
                      </div>
                    ) : null}
                    {!hasImages && billingMeta ? (
                      <div className="prov-actions prov-actions-text-meta">
                        <span className="round-billing-meta" data-testid={`round-billing-meta-${round.id}`}>
                          {billingMeta.kind === 'cost'
                            ? `${t.main.billingCost}: ${formatExactTaskCost(billingMeta.cost)}`
                            : `${t.main.billingObservedChange}: ${formatBalanceChange(billingMeta.change)}`}
                        </span>
                      </div>
                    ) : null}
                    {hasImages && (
                      <div className="prov-actions">
                        {billingMeta ? (
                          <span className="round-billing-meta" data-testid={`round-billing-meta-${round.id}`}>
                            {billingMeta.kind === 'cost'
                              ? `${t.main.billingCost}: ${formatExactTaskCost(billingMeta.cost)}`
                              : `${t.main.billingObservedChange}: ${formatBalanceChange(billingMeta.change)}`}
                          </span>
                        ) : null}
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
      </div>

      <footer className="composer" onClick={(event) => event.stopPropagation()}>
          <MotionDimSurface className={`cmp-shell cmp-shell-motion${conversation.running ? ' off' : ''}`} dim={conversation.running}>
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
                  {layersError && <div className="layer-item"><span className="layer-name">{layersError}</span></div>}
                  {!layersError && flatLayers.length === 0 && <div className="layer-item"><span className="layer-name">{t.main.noAvailableLayers}</span></div>}
                  {flatLayers.map(({ layer, depth }) => {
                    const kindIcon = layerKindIcon(layer.kind);
                    return (
                      <div key={layer.id} data-testid={`layer-row-${layer.id}`} className="layer-item" onClick={() => void addLayer(layer)}>
                        <LayerThumbnail host={services.host} layerId={layer.id} visible={layer.visible} />
                        <div className="layer-body" style={{ paddingLeft: depth * 10 }}>
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
                  <Icon name="chevron-right" style={{ marginLeft: 'auto' }} />
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
                  disabled={conversation.running || imageInputDisabled}
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
                          ? <img src={attachment.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={attachment.name} />
                          : <div style={{ width: '100%', height: '100%', background: 'var(--app-color-background-layer-1)' }} />
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
                      <button
                        type="button"
                        className="cmp-conflict-action"
                        onClick={() => {
                          setOpenMenu('model');
                          setAttachOpen(false);
                          setLayerOpen(false);
                        }}
                      >
                        {t.main.chooseCompatibleModel}
                      </button>
                      <button type="button" className="cmp-conflict-action" onClick={removeAllAttachments}>
                        {t.main.removeImages}
                      </button>
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
                  placeholder={selectedProfile ? t.main.promptPlaceholderReady : t.main.promptPlaceholderNoProfile}
                  rows={2}
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
            </div>
            <div className="cmp-action-row" data-testid="composer-action-row">
              <div className="cmp-action-left">
                <MotionButtonSurface>
                  <IconButton
                    data-testid="composer-prompt-optimize-button"
                    className="cmp-opt-icon-button"
                    quiet
                    icon={<Icon name="magic-wand" size={13} className="cmp-opt-icon" />}
                    tooltip={t.main.promptOptimizePlaceholder}
                    placement="top"
                    iconSize={13}
                    disabled
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  />
                </MotionButtonSurface>
                <div
                  className="cmp-balance-pill"
                  data-testid="main-billing-summary"
                  title={billingSummaryTitle}
                  aria-label={billingSummaryTitle}
                >
                  <span className="cmp-balance-pill-main">
                    <span
                      className={billingPrimaryHasNumericEmphasis
                        ? 'cmp-balance-pill-primary cmp-balance-pill-primary-accent'
                        : 'cmp-balance-pill-primary'}
                    >
                      {billingPrimaryParts?.primary ?? t.main.billingUnknown}
                    </span>
                    {billingPrimaryParts?.unit && (
                      <span className="cmp-balance-pill-unit"> {billingPrimaryParts.unit}</span>
                    )}
                  </span>
                  {billingPrimaryParts?.secondary && (
                    <span className="cmp-balance-pill-secondary"> · {billingPrimaryParts.secondary}</span>
                  )}
                </div>
              </div>
              <div className="cmp-action-right">
                <MotionButtonSurface>
                  <IconButton
                    data-testid="composer-capture-button"
                    className="cmp-capture"
                    hostClassName="cmp-capture-host"
                    icon={captureInFlight
                      ? <MotionActivityIcon className="cmp-capture-icon"><Icon name="spinner" size={13} /></MotionActivityIcon>
                      : <Icon name="target" size={13} className="cmp-capture-icon" />}
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
                      className="cmp-send"
                      hostClassName="cmp-send-host"
                      overlayClassName="cmp-send-overlay"
                      icon={conversation.running
                        ? <MotionActivityIcon><Icon name="spinner" size={13} /></MotionActivityIcon>
                        : <Icon name="send" />}
                      tooltip={readinessText}
                      aria-label={readinessText}
                      placement="top"
                      iconSize={13}
                      disabled={!canSend}
                      onClick={() => void handleSend()}
                    />
                  </MotionButtonSurface>
                </div>
              </div>
            </div>
            <MotionContent watch={readiness.state}>
              <div className="cmp-readiness" data-testid="composer-readiness-status" data-state={readiness.state}>
                {readinessText}
              </div>
            </MotionContent>
          </div>
          <div className="cmp-toolbar" data-testid="composer-toolbar">
            <div className="cmp-toolbar-left">
              <IconSelect
                testId="main-model-selector"
                containerClassName="cmp-select cmp-select-model"
                menuClassName="cmp-select-menu cmp-select-menu-model"
                label="Model"
                value={selectedModelLabel}
                icon="algorithm"
                disabled={conversation.running}
                open={openMenu === 'model'}
                onOpenChange={(open) => {
                  handleOpenComposerMenu('model', open);
                }}
                options={modelOptions}
                selectedId={selectedModelId}
                onSelect={handleSelectModel}
              />
            </div>
            <div className="cmp-toolbar-right">
              <IconSelect
                testId="composer-output-size-selector"
                containerClassName="cmp-select cmp-select-output-size"
                menuClassName="cmp-select-menu cmp-select-menu-compact"
                label={t.main.outputSize}
                value={generationSettings.outputSizePreset.toUpperCase()}
                disabled={conversation.running}
                open={openMenu === 'output-size'}
                onOpenChange={(open) => {
                  handleOpenComposerMenu('output-size', open);
                }}
                options={outputSizeOptions}
                isOptionSelectable={(value) => canSelectOutputSize(outputSizeContext, value as AppOutputSizePreset, t).ok}
                selectedId={generationSettings.outputSizePreset}
                onSelect={(value) => {
                  setSizeUserSelected(true);
                  void selectOutputSize(value as AppOutputSizePreset);
                }}
                icon="image-auto-mode"
              />
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
    </div>
  );
}
