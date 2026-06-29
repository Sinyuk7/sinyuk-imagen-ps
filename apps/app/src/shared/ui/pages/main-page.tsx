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
import { ComposerSelect } from '../components/composer-select';
import { UxpTextArea } from '../components/uxp-form-controls';
import { useToast, ToastHost } from '../components/toast-host';
import { ActionButton } from '../primitives/spectrum-controls';
import { useI18n } from '../i18n/i18n-context';

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
}

type OptimizeState =
  | { status: 'idle' }
  | { status: 'optimizing'; source: string }
  | { status: 'optimized'; source: string; result: string };

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

function mediaShapeFromSize(size: string | undefined): 'portrait' | 'square' | 'landscape' | 'unknown' {
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
  if (ratio < 0.9) return 'portrait';
  if (ratio > 1.15) return 'landscape';
  return 'square';
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
}: MainPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<readonly ConversationAttachment[]>([]);
  const [aspectRatio, setAspectRatio] = useState('auto');
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [openMenu, setOpenMenu] = useState<'model' | 'aspect' | null>(null);
  const [attachOpen, setAttachOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [captureInFlight, setCaptureInFlight] = useState(false);
  const { toast, show, close } = useToast();
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [scrolledAway, setScrolledAway] = useState(false);
  const [optimizeState, setOptimizeState] = useState<OptimizeState>({ status: 'idle' });
  const convRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const flatLayers = useMemo(() => flattenLayers(layers), [layers]);
  const uniqueModels = useMemo(() => dedupeById(models), [models]);
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
  const captureAttachmentCount = attachments.filter((attachment) => attachment.type === 'photoshop-capture').length;
  const optimizeButtonLabel = showUndo ? t.main.promptOptimizeUndo : t.main.promptOptimize;
  const isAtBottom = useCallback(() => {
    const el = convRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 64;
  }, []);

  useEffect(() => {
    if (convRef.current && isAtBottom()) {
      convRef.current.scrollTop = convRef.current.scrollHeight;
    }
  }, [conversation.rounds, isAtBottom]);

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

  const scrollToBottom = () => {
    if (convRef.current) {
      convRef.current.scrollTop = convRef.current.scrollHeight;
    }
  };

  const addAttachment = (attachment: ConversationAttachment) => {
    setAttachments((current) => [...current, attachment]);
    setAttachOpen(false);
    setLayerOpen(false);
  };

  const addLayer = async (layer: LayerInfo) => {
    try {
      const image = await services.host.readLayerAsAsset(layer.id);
      addAttachment({
        id: attachmentId('layer'),
        type: 'layer',
        name: layer.name,
        image,
        previewUrl: image.preview.url ?? assetToPreviewUrl(image.asset),
        ...(image.photoshopPlacement ? { photoshopPlacement: image.photoshopPlacement } : {}),
      });
      show(t.toast.layerAdded, 'positive');
    } catch (error) {
      show(error instanceof Error ? error.message : t.toast.layerReadFailed, 'negative');
    }
  };

  const openLayerPicker = () => {
    setLayerOpen(true);
    void reloadLayers();
  };

  const addFile = async () => {
    try {
      const image = await services.host.pickImageFile();
      if (!image) {
        return;
      }
      addAttachment({
        id: attachmentId('file'),
        type: 'file',
        name: image.asset.name ?? 'image',
        image,
        previewUrl: image.preview.url ?? assetToPreviewUrl(image.asset),
      });
      show(t.toast.fileAdded, 'positive');
    } catch (error) {
      show(error instanceof Error ? error.message : t.toast.filePickFailed, 'negative');
    }
  };

  const captureFromPhotoshop = async () => {
    if (!canCapture) {
      return;
    }
    setCaptureInFlight(true);
    try {
      const result = await services.host.captureActiveImage();
      addAttachment({
        id: attachmentId('capture'),
        type: 'photoshop-capture',
        name: result.image.asset.name ?? (result.sourceKind === 'selection' ? t.main.captureSelection : t.main.captureLayer),
        image: result.image,
        previewUrl: result.image.preview.url ?? assetToPreviewUrl(result.image.asset),
        photoshopPlacement: result.placement,
      });
      show(t.toast.captureAdded, 'positive');
    } catch (error) {
      show(error instanceof Error ? error.message : t.toast.captureFailed, 'negative');
    } finally {
      setCaptureInFlight(false);
    }
  };

  const handleSend = async () => {
    if (!selectedProfile) {
      show(t.toast.selectProviderProfileFirst, 'info');
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
        show(t.toast.waitForRunningTask, 'info');
      } else {
        conversation.clear();
        show(t.toast.newSessionStarted, 'info');
      }
      return;
    }
    setInput('');
    setAttachments([]);
    await conversation.submit({
      operation: 'image-edit',
      prompt,
      profileId: selectedProfile.profileId,
      providerName: selectedProfile.displayName,
      ...(selectedModelId ? { modelId: selectedModelId } : {}),
      attachments,
    });
  };

  const handleOptimize = async () => {
    if (optimizing) {
      return;
    }
    if (!optimizerReady) {
      show(t.main.promptOptimizeNoProfile, 'info');
      return;
    }
    const prompt = currentPromptValue().trim();
    if (prompt.length === 0) {
      show(t.main.promptOptimizeEmpty, 'info');
      return;
    }
    setOptimizeState({ status: 'optimizing', source: prompt });
    try {
      const result = await services.commands.optimizePrompt({ prompt });
      if (result.ok) {
        const optimized = result.value;
        if (optimized.trim() === prompt.trim()) {
          setOptimizeState({ status: 'idle' });
          show(t.toast.promptOptimizeNoChanges, 'neutral');
          return;
        }
        setInput(optimized);
        setOptimizeState({ status: 'optimized', source: prompt, result: optimized });
        show(t.toast.promptOptimized, 'positive');
      } else {
        setOptimizeState({ status: 'idle' });
        show(commandErrorToMessage(result.error), 'negative');
      }
    } catch (error) {
      setOptimizeState({ status: 'idle' });
      show(error instanceof Error ? error.message : t.toast.promptOptimizeFailed, 'negative');
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
      show(t.toast.noPlaceableImage, 'info');
      return;
    }
    try {
      await services.host.placeAssetOnCanvas(asset, round.placementIntent);
      show(t.toast.placedOnCanvas, 'positive');
    } catch (error) {
      show(error instanceof Error ? error.message : t.toast.placeFailed, 'negative');
    }
  };

  return (
    <div className="page" onClick={closeAll}>
      <header className="hdr">
        <ActionButton
          data-testid="main-history-button"
          className="hdr-btn"
          quiet
          label={t.main.history}
          placement="bottom"
          onClick={(event) => { event.stopPropagation(); onNav('history'); }}
        >
          <Icon name="history" slot="icon" />
        </ActionButton>
        <button
          data-testid="main-profile-selector"
          className="hdr-center"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          onClick={(event) => {
            event.stopPropagation();
            setProfileMenuOpen((open) => !open);
            setOpenMenu(null);
          }}
        >
          <span className="hdr-provider">{selectedProfile?.displayName ?? t.main.noProviderProfile}</span>
        </button>
        <ActionButton
          data-testid="main-providers-button"
          className="hdr-btn"
          quiet
          label="Providers"
          placement="bottom"
          onClick={(event) => { event.stopPropagation(); onNav('settings'); }}
        >
          <Icon name="settings" slot="icon" />
        </ActionButton>
      </header>

      {profileMenuOpen && (
        <div className="model-menu" style={{ top: 52, bottom: 'auto' }} onClick={(event) => event.stopPropagation()}>
          {profilesLoading && <div className="model-opt">{t.main.loadingProfiles}</div>}
          {profilesError && <div className="model-opt">{profilesError}</div>}
          {!profilesLoading && profiles.length === 0 && (
            <div data-testid="profile-menu-add-provider" className="model-opt" onClick={() => onNav('settings-add')}>{t.main.addProviderProfile}</div>
          )}
          {profiles.map((profile) => (
            <div
              key={profile.profileId}
              data-testid={`profile-menu-option-${profile.profileId}`}
              className={`model-opt${profile.profileId === selectedProfileId ? ' act' : ''}`}
              onClick={() => {
                onSelectProfile(profile.profileId);
                setProfileMenuOpen(false);
              }}
            >
              {profile.profileId === selectedProfileId && <Icon name="check" />}
              <span>{profile.displayName}</span>
            </div>
          ))}
        </div>
      )}

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
            <div key={round.id} data-round-id={round.id} data-testid={`round-${round.id}`}>
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
                    <ActionButton
                      data-testid={`round-copy-button-${round.id}`}
                      className={`copy-btn${copied[round.id] ? ' cp' : ''}`}
                      quiet
                      label={t.main.reusePrompt}
                      onClick={(event) => { event.stopPropagation(); handleCopy(round.id, round); }}
                    >
                      {copied[round.id] ? <Icon name="check" slot="icon" /> : <Icon name="copy" slot="icon" />}
                    </ActionButton>
                  </div>
                </div>
              </div>

              {round.status === 'err' && (
                <div className="msg-prov" style={{ marginTop: 4 }}>
                  <div className="av-prov err">!</div>
                  <div className="err-card">
                    <div className="err-top">
                      <span className="sdot err" />
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--app-color-negative)', fontFamily: 'var(--app-font-family-mono)' }}>
                        {t.status.failed} · {round.providerName}
                      </span>
                    </div>
                    <div className="err-msg">{round.errorMessage}</div>
                    <div className="err-actions">
                      <button data-testid={`error-retry-button-${round.id}`} className="err-retry" disabled={conversation.running} onClick={() => void conversation.retry(round.id)}>{t.history.retry}</button>
                      <ActionButton
                        data-testid={`error-copy-button-${round.id}`}
                        className={`err-copy${copied[round.id] ? ' cp' : ''}`}
                        quiet
                        label={t.main.copyPrompt}
                        onClick={(event) => { event.stopPropagation(); handleCopy(round.id, round); }}
                      >
                        {copied[round.id] ? <Icon name="check" slot="icon" /> : <Icon name="copy" slot="icon" />}
                      </ActionButton>
                    </div>
                  </div>
                </div>
              )}

              {round.status === 'running' && (
                <div className="msg-prov" style={{ marginTop: 4 }}>
                  <button
                    className="av-prov"
                    disabled={!onEditProfile || !round.profileId}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (round.profileId && onEditProfile) {
                        onEditProfile(round.profileId);
                      }
                    }}
                  >
                    {round.providerName.slice(0, 1).toUpperCase()}
                  </button>
                  <div className="prov-card">
                    <div className="prov-top">
                      <span className="prov-name-lbl">{round.providerName}</span>
                      <div className="prov-status">
                        <span className="sdot run" />
                        <span style={{ color: 'var(--app-color-notice)' }}>{roundStatusElapsed(round)}</span>
                      </div>
                    </div>
                    <div className="prov-loading">
                      <div className="ldots"><div className="ldot" /><div className="ldot" /><div className="ldot" /></div>
                      <span style={{ fontFamily: 'var(--app-font-family-mono)', fontSize: 11, color: 'var(--app-color-text-muted)' }}>{t.main.submitJobRunning}</span>
                    </div>
                  </div>
                </div>
              )}

              {round.status === 'ok' && (
                <div className="msg-prov" style={{ marginTop: 4 }}>
                  <button
                    className="av-prov"
                    disabled={!onEditProfile || !round.profileId}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (round.profileId && onEditProfile) {
                        onEditProfile(round.profileId);
                      }
                    }}
                  >
                    {round.providerName.slice(0, 1).toUpperCase()}
                  </button>
                  <div className={`prov-card prov-card-media media-${mediaShapeFromSize(round.outputSize)}`}>
                    <div className="prov-top">
                      <span className="prov-name-lbl">{round.providerName}</span>
                      <div className="prov-status">
                        <span className={`sdot ${statusDot(round.status)}`} />
                        <span style={{ color: 'var(--app-color-positive)' }}>{t.status.done} · {round.elapsedLabel}</span>
                      </div>
                    </div>
                    <div className="prov-img">
                      {round.previews.length === 0 ? (
                        <div className="img-result">
                          <div className="img-bg" style={{ background: 'var(--app-color-background-layer-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.main.noAssetPreview}</div>
                        </div>
                      ) : round.previews.map((preview, index) => (
                        <div key={`${round.id}-${index}`} className="img-result">
                          {preview.url
                            ? <img src={preview.url} className="img-bg" alt={preview.label} />
                            : <div className="img-bg" style={{ background: 'var(--app-color-background-layer-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.main.noAssetPreview}</div>
                          }
                          <div className="img-meta">{round.outputSize ?? t.main.assetFallback} · {round.outputFormat ?? t.main.imageFallback}</div>
                          <div className="img-overlay">
                            <button className="img-act prim" onClick={(event) => { event.stopPropagation(); void placeAsset(round, index); }}>
                              <span className="ui-icon-text">
                                <Icon name="place-ps" size={13} className="ui-icon-text-icon" />
                                <span className="ui-icon-text-label">{t.main.placePs}</span>
                              </span>
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="prov-actions">
                      <ActionButton
                        data-testid={`result-place-button-${round.id}`}
                        className="act-ico prim"
                        quiet
                        label={t.main.placePs}
                        onClick={(event) => { event.stopPropagation(); void placeAsset(round, 0); }}
                      >
                        <Icon name="place-ps" slot="icon" />
                      </ActionButton>
                      <ActionButton
                        data-testid={`result-regenerate-button-${round.id}`}
                        className="act-ico"
                        quiet
                        label={t.main.regenerate}
                        disabled={conversation.running}
                        onClick={(event) => { event.stopPropagation(); void conversation.retry(round.id); }}
                      >
                        <Icon name="regenerate" slot="icon" />
                      </ActionButton>
                      <ActionButton
                        data-testid={`result-copy-button-${round.id}`}
                        className="act-ico"
                        quiet
                        label={t.main.copyPrompt}
                        onClick={(event) => { event.stopPropagation(); handleCopy(`${round.id}-copy`, round); }}
                      >
                        {copied[`${round.id}-copy`] ? <Icon name="check" slot="icon" /> : <Icon name="copy" slot="icon" />}
                      </ActionButton>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <footer className="composer" onClick={(event) => event.stopPropagation()}>
        {layerOpen && (
          <div className="layer-list-wrap" onClick={(event) => event.stopPropagation()}>
            <div className="layer-list-hdr">
              <button
                className="layer-back"
                onClick={() => setLayerOpen(false)}
              >
                <Icon name="chevron-left" size={12} />
              </button>
              {t.main.psLayers}
              <button
                className="layer-refresh"
                onClick={() => void reloadLayers()}
              >
                <Icon name="refresh" size={12} />
              </button>
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

        {attachOpen && !layerOpen && (
          <div className="attach-picker" onClick={(event) => event.stopPropagation()}>
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
                <div className="attach-opt-sub">PNG / JPG / WebP</div>
              </div>
            </div>
          </div>
        )}

        <div className={`cmp-shell${conversation.running ? ' off' : ''}`}>
          {attachments.length > 0 && (
            <div className="cmp-attach-band">
              <div className="attach-row">
                {attachments.map((attachment) => (
                  <div key={attachment.id} className="att-thumb">
                    {attachment.previewUrl
                      ? <img src={attachment.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={attachment.name} />
                      : <div style={{ width: '100%', height: '100%', background: 'var(--app-color-background-layer-1)' }} />
                    }
                    <button data-testid={`attachment-remove-button-${attachment.id}`} className="att-rm" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}>x</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="cmp-core">
            <div className="cmp-body">
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
                <ActionButton
                  data-testid="composer-add-image-button"
                  className="cmp-add"
                  quiet
                  selected={attachOpen || layerOpen}
                  label={t.main.addImage}
                  placement="top"
                  disabled={conversation.running}
                  onClick={(event) => {
                    event.stopPropagation();
                    setAttachOpen((open) => !open);
                    setLayerOpen(false);
                    setOpenMenu(null);
                    setProfileMenuOpen(false);
                  }}
                  >
                  <Icon name="add" slot="icon" />
                </ActionButton>
              </div>
              <div className="cmp-action-right">
                <ActionButton
                  data-testid="composer-capture-button"
                  className="cmp-capture"
                  label={t.main.capture}
                  placement="top"
                  disabled={!canCapture}
                  onClick={(event) => {
                    event.stopPropagation();
                    setOpenMenu(null);
                    setAttachOpen(false);
                    setLayerOpen(false);
                    void captureFromPhotoshop();
                  }}
                >
                  {captureInFlight
                    ? <Icon name="spinner" size={13} className="cmp-capture-icon spin" slot="icon" />
                    : <Icon name={captureAttachmentCount > 0 ? 'image-check' : 'target'} size={13} className="cmp-capture-icon" slot="icon" />}
                  <span className="cmp-action-label">{t.main.capture}</span>
                  {captureAttachmentCount > 0 ? (
                    <span className="cmp-capture-badge" aria-label={t.main.captureCount(captureAttachmentCount)}>
                      {captureAttachmentCount}
                    </span>
                  ) : null}
                </ActionButton>
                <div className="send-wrap">
                  <ActionButton
                    data-testid="composer-send-button"
                    className="cmp-send"
                    disabled={!canSend || optimizing}
                    label={t.main.send}
                    placement="top"
                    onClick={() => void handleSend()}
                  >
                    {conversation.running
                      ? <Icon name="spinner" size={13} className="spin" slot="icon" />
                      : <Icon name="send" slot="icon" />
                    }
                  </ActionButton>
                </div>
              </div>
            </div>
          </div>
          <div className="cmp-toolbar" data-testid="composer-toolbar">
            <div className="cmp-toolbar-left">
              <ComposerSelect
                testId="main-model-selector"
                containerClassName="cmp-select cmp-select-model"
                menuClassName="cmp-select-menu cmp-select-menu-model"
                label="Model"
                value={selectedModelLabel}
                disabled={conversation.running}
                open={openMenu === 'model'}
                onOpenChange={(open) => setOpenMenu(open ? 'model' : null)}
                options={modelOptions}
                selectedId={selectedModelId}
                onSelect={onSelectModel}
                leadingIcon="magic-wand"
              />
            </div>
            <div className="cmp-toolbar-right">
              <ComposerSelect
                testId="composer-aspect-ratio-selector"
                containerClassName="cmp-select cmp-select-aspect"
                menuClassName="cmp-select-menu cmp-select-menu-compact"
                label={t.main.aspectRatio}
                value={aspectRatio === 'auto' ? t.main.aspectRatioAuto : t.main.aspectRatioSquare}
                disabled={conversation.running}
                open={openMenu === 'aspect'}
                onOpenChange={(open) => setOpenMenu(open ? 'aspect' : null)}
                options={[
                  { id: 'auto', label: t.main.aspectRatioAuto, icon: 'image-auto-mode' },
                  { id: '1:1', label: t.main.aspectRatioSquare },
                ]}
                selectedId={aspectRatio}
                onSelect={setAspectRatio}
                leadingIcon="image-auto-mode"
              />
              <ActionButton
                data-testid="composer-prompt-optimize-button"
                className="cmp-opt"
                label={optimizeButtonLabel}
                placement="top"
                disabled={showUndo ? false : !canOptimize}
                onClick={(event) => {
                  event.stopPropagation();
                  if (showUndo) {
                    handleUndoOptimize();
                  } else {
                    void handleOptimize();
                  }
                }}
              >
                {optimizing
                  ? <Icon name="spinner" size={13} className="cmp-opt-icon spin" slot="icon" />
                  : showUndo
                    ? <Icon name="refresh" size={13} className="cmp-opt-icon" slot="icon" />
                    : <Icon name="magic-wand" size={13} className="cmp-opt-icon" slot="icon" />}
                <span className="cmp-action-label">{showUndo ? t.main.promptOptimizeUndo : t.main.promptRefine}</span>
              </ActionButton>
            </div>
          </div>
        </div>

        {scrolledAway && (
          <button
            data-testid="back-to-bottom-button"
            className="back-to-bottom"
            onClick={(event) => {
              event.stopPropagation();
              scrollToBottom();
            }}
          >
            <Icon name="chevron-down" size={10} />
          </button>
        )}
      </footer>
      <ToastHost toast={toast} onClose={close} />
    </div>
  );
}
