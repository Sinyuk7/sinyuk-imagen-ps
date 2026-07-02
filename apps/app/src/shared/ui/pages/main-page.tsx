import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderModelInfo, ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import type { LayerInfo } from '../../ports/host-port';
import { assetToPreviewUrl, commandErrorToMessage, modelLabel } from '../../domain/mappers';
import type {
  ConversationAttachment,
  ConversationController,
  ConversationRound,
} from '../hooks/use-conversation';
import { Icon } from '../components/icons';
import { IconSelect } from '../components/icon-select';
import { UxpTextArea } from '../components/uxp-form-controls';
import { useNotice } from '../components/notice';
import { ProviderIdentity } from '../components/provider-identity';
import { ToastHost } from '../components/toast-host';
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
import { MOTION_DURATION } from '../motion';

interface MainPageProps {
  readonly onNav: (view: string) => void;
  readonly profiles: readonly ProviderProfile[];
  readonly profilesLoading: boolean;
  readonly profilesError: string | null;
  readonly selectedProfile: ProviderProfile | undefined;
  readonly selectedProfileId: string | null;
  readonly onSelectProfile: (profileId: string | null) => void;
  readonly models: readonly ProviderModelInfo[];
  readonly modelsLoading: boolean;
  readonly modelsError: string | null;
  readonly selectedModelId: string;
  readonly onSelectModel: (modelId: string) => void;
  readonly layers: readonly LayerInfo[];
  readonly layersError: string | null;
  readonly reloadLayers: () => Promise<void>;
  readonly conversation: ConversationController;
  readonly highlightedRoundId?: string | null;
  readonly onEditProfile?: (profileId: string) => void;
  readonly promptOptimizerProfile?: ProviderProfile | null;
  readonly generationSettings: AppGenerationSettings;
  readonly onChangeOutputSizePreset: (sizePreset: AppOutputSizePreset) => Promise<void>;
}

type OptimizeState =
  | { status: 'idle' }
  | { status: 'optimizing'; source: string }
  | { status: 'optimized'; source: string; result: string };

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

function dedupeById(models: readonly ProviderModelInfo[]): readonly ProviderModelInfo[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) {
      return false;
    }
    seen.add(model.id);
    return true;
  });
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

function releaseAttachment(attachment: ConversationAttachment): void {
  attachment.image.preview.dispose?.();
}

function releaseAttachments(attachments: readonly ConversationAttachment[]): void {
  const released = new Set<ConversationAttachment['image']>();
  for (const attachment of attachments) {
    if (released.has(attachment.image)) {
      continue;
    }
    released.add(attachment.image);
    releaseAttachment(attachment);
  }
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
  selectedModelId,
  onSelectModel,
  layers,
  layersError,
  reloadLayers,
  conversation,
  highlightedRoundId,
  onEditProfile,
  promptOptimizerProfile,
  generationSettings,
  onChangeOutputSizePreset,
}: MainPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<readonly ConversationAttachment[]>([]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<'model' | 'output-size' | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [captureInFlight, setCaptureInFlight] = useState(false);
  const { notice: toast, show, clear, pause, resume } = useNotice({ defaultDurationMs: null });
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [selectedPreviewIndexes, setSelectedPreviewIndexes] = useState<Record<string, number>>({});
  const [placeStatus, setPlaceStatus] = useState<Record<string, PlaceStatus>>({});
  const [expandedResponses, setExpandedResponses] = useState<Record<string, boolean>>({});
  const [overflowingResponses, setOverflowingResponses] = useState<Record<string, boolean>>({});
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [scrolledAway, setScrolledAway] = useState(false);
  const [optimizeState, setOptimizeState] = useState<OptimizeState>({ status: 'idle' });
  const convRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const responseTextRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const attachmentsRef = useRef<readonly ConversationAttachment[]>(attachments);
  const flatLayers = useMemo(() => flattenLayers(layers), [layers]);
  const uniqueModels = useMemo(() => dedupeById(models), [models]);
  const selectableProfiles = useMemo(
    () => profiles.filter((profile) => profile.profileId !== '__prompt-optimizer__'),
    [profiles],
  );
  const modelOptions = useMemo(
    () => uniqueModels.map((model) => ({ id: model.id, label: modelLabel(model) })),
    [uniqueModels],
  );
  const selectedModelLabel = selectedModelId || (modelsLoading ? t.main.modelLoading : t.main.modelUnselected);
  const currentPromptValue = () => taRef.current?.value ?? input;
  const canSend = input.trim().length > 0 && Boolean(selectedProfile) && !conversation.running;
  const optimizerReady = Boolean(promptOptimizerProfile?.enabled);
  const optimizing = optimizeState.status === 'optimizing';
  const showUndo = optimizeState.status === 'optimized' && input === optimizeState.result;
  const canOptimize = optimizerReady && input.trim().length > 0 && !optimizing;
  const canCapture = !conversation.running && !captureInFlight;
  const optimizeButtonLabel = showUndo ? t.main.promptOptimizeUndo : t.main.promptOptimize;
  const responseTextKey = (roundId: string) => `response:${roundId}`;
  const isAtBottom = useCallback(() => {
    const el = convRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 64;
  }, []);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      releaseAttachments(attachmentsRef.current);
      attachmentsRef.current = [];
    };
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

  const measureResponseOverflow = useCallback(() => {
    setOverflowingResponses((current) => {
      let changed = false;
      const next: Record<string, boolean> = {};
      for (const round of conversation.rounds) {
        const element = responseTextRefs.current.get(round.id);
        if (!element) {
          continue;
        }
        const lineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
        const clampHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight * 3 : 54;
        const overflowing = element.scrollHeight > clampHeight + 1;
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

  const restoreRound = (round: ConversationRound) => {
    setInput(round.prompt);
    if (round.modelId && uniqueModels.some((model) => model.id === round.modelId)) {
      onSelectModel(round.modelId);
    }
    if (round.attachments.length > 0) {
      setAttachments(round.attachments);
    }
    taRef.current?.focus();
    show(t.toast.promptFilled, 'info');
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
    setAttachments((current) => [...current, attachment]);
    setHighlightKey(`attachment:${attachment.id}`);
    setAttachOpen(false);
    setLayerOpen(false);
  };

  const removeAttachment = (attachmentId: string) => {
    setAttachments((current) => {
      const removed = current.find((item) => item.id === attachmentId);
      if (removed) {
        releaseAttachment(removed);
      }
      return current.filter((item) => item.id !== attachmentId);
    });
  };

  const selectProfile = (profileId: string) => {
    if (profileId !== selectedProfileId) {
      releaseAttachments(attachments);
      setAttachments([]);
    }
    onSelectProfile(profileId);
    setProfileMenuOpen(false);
  };

  const addLayer = async (layer: LayerInfo) => {
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
    show(t.toast.layerAdded, 'positive', { durationMs: 2800 });
    } catch (error) {
      show(error instanceof Error ? error.message : t.toast.layerReadFailed, 'negative', { durationMs: 7000, dismissible: true });
    }
  };

  const openLayerPicker = () => {
    setLayerOpen(true);
    void reloadLayers();
  };

  const addFile = async () => {
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
      show(t.toast.fileAdded, 'positive', { durationMs: 2800 });
    } catch (error) {
      show(
        isLocalFileNormalizationError(error)
          ? t.toast.fileNeedsNormalization
          : error instanceof Error
            ? error.message
            : t.toast.filePickFailed,
        'negative',
        { durationMs: 7000, dismissible: true },
      );
    }
  };

  const captureFromPhotoshop = async () => {
    if (!canCapture) {
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
      show(t.toast.captureAdded, 'positive', { durationMs: 2800 });
    } catch (error) {
      show(error instanceof Error ? error.message : t.toast.captureFailed, 'negative', { durationMs: 7000, dismissible: true });
    } finally {
      setCaptureInFlight(false);
    }
  };

  const handleSend = async () => {
    if (!selectedProfile) {
      show(t.toast.selectProviderProfileFirst, 'info', { durationMs: 4000 });
      return;
    }
    if (!canSend) {
      return;
    }
    const prompt = currentPromptValue().trim();
    if (prompt.length === 0) {
      return;
    }
    if (/^\/new\b$/i.test(prompt)) {
      if (conversation.running) {
        show(t.toast.waitForRunningTask, 'info', { durationMs: 4000 });
      } else {
        conversation.clear();
        show(t.toast.newSessionStarted, 'info', { durationMs: 3600 });
      }
      return;
    }
    setInput('');
    setAttachments([]);
    await conversation.submit({
      operation: attachments.length > 0 ? 'image-edit' : 'text-to-image',
      prompt,
      profileId: selectedProfile.profileId,
      providerId: selectedProfile.providerId,
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

  const handleOptimize = async () => {
    if (optimizing) {
      return;
    }
    if (!optimizerReady) {
      show(t.main.promptOptimizeNoProfile, 'info', { durationMs: 4000 });
      return;
    }
    const prompt = currentPromptValue().trim();
    if (prompt.length === 0) {
      show(t.main.promptOptimizeEmpty, 'info', { durationMs: 4000 });
      return;
    }
    setOptimizeState({ status: 'optimizing', source: prompt });
    try {
      const result = await services.commands.optimizePrompt({ prompt });
      if (result.ok) {
        const optimized = result.value;
        if (optimized.trim() === prompt.trim()) {
          setOptimizeState({ status: 'idle' });
          show(t.toast.promptOptimizeNoChanges, 'neutral', { durationMs: 3200, icon: 'message' });
          return;
        }
        setInput(optimized);
        setOptimizeState({ status: 'optimized', source: prompt, result: optimized });
        setHighlightKey(`optimize:${Date.now()}`);
        show(t.toast.promptOptimized, 'positive', { durationMs: 2800 });
      } else {
        setOptimizeState({ status: 'idle' });
        show(commandErrorToMessage(result.error), 'negative', { durationMs: 7000, dismissible: true });
      }
    } catch (error) {
      setOptimizeState({ status: 'idle' });
      show(error instanceof Error ? error.message : t.toast.promptOptimizeFailed, 'negative', { durationMs: 7000, dismissible: true });
    }
  };

  const handleUndoOptimize = () => {
    if (optimizeState.status === 'optimized') {
      setInput(optimizeState.source);
      setOptimizeState({ status: 'idle' });
    }
  };

  useEffect(() => {
    if (optimizeState.status === 'optimized' && input !== optimizeState.result) {
      setOptimizeState({ status: 'idle' });
    }
  }, [input, optimizeState]);

  const placeAsset = async (round: ConversationRound, previewIndex = 0) => {
    const asset = round.previews[previewIndex]?.asset;
    if (!asset) {
      show(t.toast.noPlaceableImage, 'info', { durationMs: 4000 });
      return;
    }
    setPlaceStatus((current) => ({ ...current, [round.id]: 'placing' }));
    try {
      await services.host.placeAssetOnCanvas(asset, round.placementIntent);
      setPlaceStatus((current) => ({ ...current, [round.id]: 'placed' }));
      setHighlightKey(`place:${round.id}:${Date.now()}`);
      show(t.toast.placedOnCanvas, 'positive', { durationMs: 2800 });
      window.setTimeout(() => {
        setPlaceStatus((current) => ({ ...current, [round.id]: 'idle' }));
      }, MOTION_DURATION.statusReset);
    } catch (error) {
      setPlaceStatus((current) => ({ ...current, [round.id]: 'idle' }));
      show(error instanceof Error ? error.message : t.toast.placeFailed, 'negative', { durationMs: 7000, dismissible: true });
    }
  };

  const downloadPreview = (round: ConversationRound, previewIndex = 0) => {
    const preview = round.previews[previewIndex];
    const href = preview?.url ?? '';
    if (!href) {
      show(t.toast.noPlaceableImage, 'info', { durationMs: 4000 });
      return;
    }
    const name = preview.asset.name ?? preview.label ?? `imagen-result-${previewIndex + 1}.png`;
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
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
            icon={<Icon name="chevron-down" size={10} className="hdr-provider-chevron" />}
            tooltip={selectedProfile?.displayName ?? t.main.noProviderProfile}
            iconSize={10}
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
                <button className="empty-hint" onClick={() => setInput(t.main.promptSuggestionProductValue)}>
                  {t.main.promptSuggestionProductLabel}
                </button>
                <button className="empty-hint" onClick={() => setInput(t.main.promptSuggestionCyberpunkValue)}>
                  {t.main.promptSuggestionCyberpunkLabel}
                </button>
                <button className="empty-hint" onClick={() => setInput(t.main.promptSuggestionLayerValue)}>
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
                  <div className="err-card">
                    <div className="err-top">
                      <span className="prov-identity-icon err">!</span>
                      <span className="sdot err" />
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--app-color-negative)', fontFamily: 'var(--app-font-family-mono)' }}>
                        {t.status.failed} · {round.providerName}
                      </span>
                    </div>
                    <div className="err-msg">{round.errorMessage}</div>
                    <div className="err-actions">
                      <button data-testid={`error-retry-button-${round.id}`} className="err-retry" disabled={conversation.running} onClick={() => void conversation.retry(round.id)}>{t.history.retry}</button>
                      <IconButton
                        data-testid={`error-copy-button-${round.id}`}
                        className={`err-copy${copied[round.id] ? ' cp' : ''}`}
                        quiet
                        icon={copied[round.id] ? <Icon name="check" /> : <Icon name="copy" />}
                        tooltip={t.main.copyPrompt}
                        onClick={(event) => { event.stopPropagation(); handleCopy(round.id, round); }}
                      />
                    </div>
                  </div>
                </div>
              )}

              {round.status === 'running' && (
                <div className="msg-prov msg-prov-surface" style={{ marginTop: 4 }}>
                  <div className="prov-card">
                    <div className="prov-top">
                      <ProviderIdentity
                        providerName={round.providerName}
                        providerId={round.providerId}
                        modelId={round.modelId}
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
                        <span className="prov-status-text run">{roundStatusElapsed(round)}</span>
                      </div>
                    </div>
                    <div className="prov-loading">
                      <div className="ldots">
                        <MotionActivityDot className="ldot" />
                        <MotionActivityDot className="ldot" />
                        <MotionActivityDot className="ldot" />
                      </div>
                      <span style={{ fontFamily: 'var(--app-font-family-mono)', fontSize: 11, color: 'var(--app-color-text-muted)' }}>{t.main.submitJobRunning}</span>
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
                return (
                <div className="msg-prov msg-prov-surface" style={{ marginTop: 4 }}>
                  <div className={`prov-card${hasImages ? ` prov-card-media media-${mediaShapeFromSize(round.outputSize)}` : ' prov-card-text-only'}`}>
                    <div className="prov-top">
                      <ProviderIdentity
                        providerName={round.providerName}
                        providerId={round.providerId}
                        modelId={round.modelId}
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
                      <div className="prov-response" data-expanded={responseExpanded ? 'true' : undefined}>
                        <div
                          ref={responseTextRef(round.id)}
                          data-testid={`result-response-text-${round.id}`}
                          className="prov-response-text"
                        >
                          {round.responseText}
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
                              <Button
                                data-testid={`result-place-button-${round.id}`}
                                className="img-act prim"
                                data-place-status={placeStatus[round.id] ?? 'idle'}
                                variant="accent"
                                title={placeStatus[round.id] === 'placing'
                                  ? t.main.placingPs
                                  : placeStatus[round.id] === 'placed'
                                    ? t.main.placedPs
                                    : t.main.placePs}
                                disabled={placeStatus[round.id] === 'placing'}
                                onClick={(event) => { event.stopPropagation(); void placeAsset(round, selectedPreviewIndex); }}
                              >
                                {placeStatus[round.id] === 'placing'
                                  ? t.main.placingPs
                                  : placeStatus[round.id] === 'placed'
                                    ? t.main.placedPs
                                    : t.main.placePs}
                              </Button>
                            </MotionButtonSurface>
                          </div>
                        </div>
                      </div>
                    ) : !hasResponseText ? (
                      <div className="prov-img">
                        <div className="img-result">
                          <div className="img-bg" style={{ background: 'var(--app-color-background-layer-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.main.noAssetPreview}</div>
                        </div>
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
                          onClick={(event) => { event.stopPropagation(); downloadPreview(round, previewIndexForRound(round)); }}
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
                    icon={<Icon name="refresh" size={12} />}
                    tooltip={t.common.refresh}
                    iconSize={12}
                    onClick={() => void reloadLayers()}
                  />
                </div>
                <div className="layer-scroll">
                  {layersError && <div className="layer-item"><span className="layer-name">{layersError}</span></div>}
                  {!layersError && flatLayers.length === 0 && <div className="layer-item"><span className="layer-name">{t.main.noAvailableLayers}</span></div>}
                  {flatLayers.map(({ layer, depth }) => (
                    <div key={layer.id} data-testid={`layer-row-${layer.id}`} className="layer-item" onClick={() => void addLayer(layer)}>
                      <div className="layer-swatch" style={{ background: layer.visible === false ? 'var(--app-color-background-layer-1)' : 'var(--app-color-background-layer-2)' }} />
                      <span className="layer-name" style={{ paddingLeft: depth * 10 }}>{layer.name}</span>
                      <span className="layer-meta-lbl">{layer.kind ?? 'layer'}</span>
                    </div>
                  ))}
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
                  tooltip={t.main.addImage}
                  placement="top"
                  disabled={conversation.running}
                  onClick={(event) => {
                    event.stopPropagation();
                    setAttachOpen((open) => !open);
                    setLayerOpen(false);
                    setOpenMenu(null);
                    setProfileMenuOpen(false);
                  }}
                />
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="att-thumb">
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
                ))}
              </div>
          </div>
          <div className="cmp-core">
            <div className="cmp-body">
              <MotionHighlight activeKey={highlightKey?.startsWith('optimize:') ? highlightKey : null} />
              <UxpTextArea
                data-testid="composer-textarea"
                controlRef={taRef}
                className="cmp-ta"
                placeholder={selectedProfile ? t.main.promptPlaceholderReady : t.main.promptPlaceholderNoProfile}
                rows={2}
                value={input}
                onValue={setInput}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
                disabled={conversation.running || optimizing}
              />
            </div>
            <div className="cmp-action-row" data-testid="composer-action-row">
              <div className="cmp-action-left">
                <MotionButtonSurface>
                  <IconButton
                    data-testid="composer-prompt-optimize-button"
                    className="cmp-opt-icon-button"
                    quiet
                    icon={optimizing
                      ? <MotionActivityIcon className="cmp-opt-icon"><Icon name="spinner" size={13} /></MotionActivityIcon>
                      : showUndo
                        ? <Icon name="refresh" size={13} className="cmp-opt-icon" />
                        : <Icon name="magic-wand" size={13} className="cmp-opt-icon" />}
                    tooltip={optimizeButtonLabel}
                    placement="top"
                    iconSize={13}
                    disabled={showUndo ? false : !canOptimize}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (showUndo) {
                        handleUndoOptimize();
                      } else {
                        void handleOptimize();
                      }
                    }}
                  />
                </MotionButtonSurface>
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
                    tooltip={t.main.captureActionHint}
                    aria-label={t.main.captureActionHint}
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
                      tooltip={conversation.running ? t.main.regenerate : t.main.send}
                      aria-label={conversation.running ? t.main.regenerate : t.main.send}
                      placement="top"
                      iconSize={13}
                      disabled={!canSend || optimizing}
                      onClick={() => void handleSend()}
                    />
                  </MotionButtonSurface>
                </div>
              </div>
            </div>
          </div>
          <div className="cmp-toolbar" data-testid="composer-toolbar">
            <div className="cmp-toolbar-left">
              <IconSelect
                testId="main-model-selector"
                containerClassName="cmp-select cmp-select-model"
                menuClassName="cmp-select-menu cmp-select-menu-model"
                label="Model"
                value={selectedModelLabel}
                icon="image-check"
                disabled={conversation.running}
                open={openMenu === 'model'}
                onOpenChange={(open) => {
                  setProfileMenuOpen(false);
                  setOpenMenu(open ? 'model' : null);
                }}
                options={modelOptions}
                selectedId={selectedModelId}
                onSelect={onSelectModel}
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
                  setProfileMenuOpen(false);
                  setOpenMenu(open ? 'output-size' : null);
                }}
                options={[
                  { id: '512', label: '512' },
                  { id: '1k', label: '1K' },
                  { id: '2k', label: '2K' },
                  { id: '4k', label: '4K' },
                ]}
                selectedId={generationSettings.outputSizePreset}
                onSelect={(value) => {
                  void onChangeOutputSizePreset(value as AppOutputSizePreset);
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
      <ToastHost toast={toast} onClose={clear} onPause={pause} onResume={resume} />
    </div>
  );
}
