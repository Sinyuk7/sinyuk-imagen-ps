import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ProviderModelInfo, ProviderProfile } from '@imagen-ps/application';
import { useAppServices } from '../../ports/app-services-context';
import type { LayerInfo } from '../../ports/host-port';
import { assetToPreviewUrl, modelLabel } from '../../domain/mappers';
import type {
  ConversationAttachment,
  ConversationController,
  ConversationRound,
} from '../hooks/use-conversation';
import { Icon } from '../components/icons';
import { Tip } from '../components/tip';
import { UxpTextArea } from '../components/uxp-form-controls';
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
}

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
  reloadLayers,
  conversation,
}: MainPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<readonly ConversationAttachment[]>([]);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [layerOpen, setLayerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const convRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const flatLayers = useMemo(() => flattenLayers(layers), [layers]);
  const selectedModelLabel = selectedModelId || (modelsLoading ? t.main.modelLoading : t.main.modelUnselected);
  const currentPromptValue = () => taRef.current?.value ?? input;
  const canSend = input.trim().length > 0 && Boolean(selectedProfile) && !conversation.running;

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2000);
  }, []);

  useEffect(() => {
    if (convRef.current) {
      convRef.current.scrollTop = convRef.current.scrollHeight;
    }
  }, [conversation.rounds]);

  const closeAll = () => {
    setProfileMenuOpen(false);
    setModelMenuOpen(false);
    setAttachOpen(false);
    setLayerOpen(false);
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard?.writeText(text).catch(() => undefined);
    setCopied((current) => ({ ...current, [id]: true }));
    window.setTimeout(() => setCopied((current) => ({ ...current, [id]: false })), 1500);
    setInput(text);
    taRef.current?.focus();
    showToast(t.toast.promptFilled);
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
      });
      showToast(t.toast.layerAdded);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t.toast.layerReadFailed);
    }
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
      showToast(t.toast.fileAdded);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t.toast.filePickFailed);
    }
  };

  const handleSend = async () => {
    if (!selectedProfile) {
      showToast(t.toast.selectProviderProfileFirst);
      return;
    }
    if (!canSend) {
      return;
    }
    const prompt = currentPromptValue().trim();
    if (prompt.length === 0) {
      return;
    }
    setInput('');
    setAttachments([]);
    await conversation.submit({
      prompt,
      profileId: selectedProfile.profileId,
      providerName: selectedProfile.displayName,
      ...(selectedModelId ? { modelId: selectedModelId } : {}),
      attachments,
    });
  };

  const placeAsset = async (round: ConversationRound) => {
    const asset = round.previews[0]?.asset;
    if (!asset) {
      showToast(t.toast.noPlaceableImage);
      return;
    }
    try {
      await services.host.placeAssetOnCanvas(asset);
      showToast(t.toast.placedOnCanvas);
    } catch (error) {
      showToast(error instanceof Error ? error.message : t.toast.placeFailed);
    }
  };

  return (
    <div className="page" onClick={closeAll}>
      <header className="hdr">
        <Tip label={t.main.history}>
          <button data-testid="main-history-button" className="hdr-btn" onClick={(event) => { event.stopPropagation(); onNav('history'); }}>
            <Icon name="history" />
          </button>
        </Tip>
        <button
          data-testid="main-profile-selector"
          className="hdr-center"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
          onClick={(event) => {
            event.stopPropagation();
            setProfileMenuOpen((open) => !open);
            setModelMenuOpen(false);
          }}
        >
          <span className="hdr-provider">{selectedProfile?.displayName ?? t.main.noProviderProfile}</span>
          <span className="hdr-model">{selectedModelLabel}</span>
        </button>
        <Tip label="Providers" right>
          <button data-testid="main-providers-button" className="hdr-btn" onClick={(event) => { event.stopPropagation(); onNav('settings'); }}>
            <Icon name="settings" />
          </button>
        </Tip>
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
              <div style={{ color: 'var(--txm)', fontSize: 13 }}>{t.main.emptyHint}</div>
              <div className="empty-hints">
                <button className="empty-hint" onClick={() => setInput(t.main.promptSuggestionProductValue)}>
                  {t.main.promptSuggestionProductLabel}
                </button>
                <button className="empty-hint" onClick={() => setInput(t.main.promptSuggestionCyberpunkValue)}>
                  {t.main.promptSuggestionCyberpunkLabel}
                </button>
              </div>
            </div>
          )}

          {conversation.rounds.map((round) => (
            <div key={round.id}>
              <div className="msg-user">
                <div className="user-wrap">
                  <div className="user-bubble">
                    {round.attachments.length > 0 && (
                      <div className="bubble-imgs">
                        {round.attachments.slice(0, 2).map((attachment, index) => (
                          <div key={attachment.id} className="bimg">
                            {attachment.previewUrl
                              ? <img src={attachment.previewUrl} className="bimg-bg" alt={attachment.name} />
                              : <div className="bimg-bg" style={{ background: 'var(--s2)' }} />
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
                    <Tip label={t.main.reusePrompt}>
                      <button
                        data-testid={`round-copy-button-${round.id}`}
                        className={`copy-btn${copied[round.id] ? ' cp' : ''}`}
                        onClick={(event) => { event.stopPropagation(); handleCopy(round.id, round.prompt); }}
                      >
                        {copied[round.id]
                          ? <Icon name="check" />
                          : <Icon name="copy" />
                        }
                      </button>
                    </Tip>
                  </div>
                </div>
              </div>

              {round.status === 'err' && (
                <div className="msg-prov" style={{ marginTop: 4 }}>
                  <div className="av-prov err">!</div>
                  <div className="err-card">
                    <div className="err-top">
                      <span className="sdot err" />
                      <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--er)', fontFamily: 'var(--fM)' }}>
                        {t.status.failed} · {round.providerName}
                      </span>
                    </div>
                    <div className="err-msg">{round.errorMessage}</div>
                    <button data-testid={`error-retry-button-${round.id}`} className="err-retry" disabled={conversation.running} onClick={() => void conversation.retry(round.id)}>{t.history.retry}</button>
                  </div>
                </div>
              )}

              {round.status === 'running' && (
                <div className="msg-prov" style={{ marginTop: 4 }}>
                  <div className="av-prov">{round.providerName.slice(0, 1).toUpperCase()}</div>
                  <div className="prov-card">
                    <div className="prov-top">
                      <span className="prov-name-lbl">{round.providerName}</span>
                      <div className="prov-status">
                        <span className="sdot run" />
                        <span style={{ color: 'var(--wa)' }}>{roundStatusElapsed(round)}</span>
                      </div>
                    </div>
                    <div className="prov-loading">
                      <div className="ldots"><div className="ldot" /><div className="ldot" /><div className="ldot" /></div>
                      <span style={{ fontFamily: 'var(--fM)', fontSize: 11, color: 'var(--txd)' }}>{t.main.submitJobRunning}</span>
                    </div>
                  </div>
                </div>
              )}

              {round.status === 'ok' && (
                <div className="msg-prov" style={{ marginTop: 4 }}>
                  <div className="av-prov">{round.providerName.slice(0, 1).toUpperCase()}</div>
                  <div className="prov-card">
                    <div className="prov-top">
                      <span className="prov-name-lbl">{round.providerName}</span>
                      <div className="prov-status">
                        <span className={`sdot ${statusDot(round.status)}`} />
                        <span style={{ color: 'var(--ok)' }}>{t.status.done} · {round.elapsedLabel}</span>
                      </div>
                    </div>
                    <div className="prov-img">
                      <div className="img-result">
                        {round.previews[0]?.url
                          ? <img src={round.previews[0].url} className="img-bg" style={{ height: 158, objectFit: 'cover' }} alt={round.previews[0].label} />
                          : <div className="img-bg" style={{ height: 158, background: 'var(--s2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--txd)', fontSize: 12 }}>{t.main.noAssetPreview}</div>
                        }
                        <div className="img-meta">{round.outputSize ?? t.main.assetFallback} · {round.outputFormat ?? t.main.imageFallback}</div>
                        <div className="img-overlay">
                          <button className="img-act prim" onClick={(event) => { event.stopPropagation(); void placeAsset(round); }}>
                            <Icon name="place-ps" />
                            {t.main.placePs}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="prov-actions">
                      <Tip label={t.main.placePs}>
                        <button data-testid={`result-place-button-${round.id}`} className="act-ico prim" onClick={(event) => { event.stopPropagation(); void placeAsset(round); }}>
                          <Icon name="place-ps" />
                        </button>
                      </Tip>
                      <Tip label={t.main.regenerate}>
                        <button data-testid={`result-regenerate-button-${round.id}`} className="act-ico" disabled={conversation.running} onClick={(event) => { event.stopPropagation(); void conversation.retry(round.id); }}>
                          <Icon name="regenerate" />
                        </button>
                      </Tip>
                      <Tip label={t.main.copyPrompt}>
                        <button data-testid={`result-copy-button-${round.id}`} className="act-ico" onClick={(event) => { event.stopPropagation(); handleCopy(`${round.id}-copy`, round.prompt); }}>
                          <Icon name="copy" />
                        </button>
                      </Tip>
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
                  <div className="layer-swatch" style={{ background: layer.visible === false ? 'var(--s1)' : 'var(--s2)' }} />
                  <span className="layer-name" style={{ paddingLeft: depth * 10 }}>{layer.name}</span>
                  <span className="layer-meta-lbl">{layer.kind ?? 'layer'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {attachOpen && !layerOpen && (
          <div className="attach-picker" onClick={(event) => event.stopPropagation()}>
            <div data-testid="attach-ps-layers-option" className="attach-opt" onClick={() => setLayerOpen(true)}>
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

        {modelMenuOpen && (
          <div className="model-menu" onClick={(event) => event.stopPropagation()}>
            {modelsError && <div className="model-opt">{modelsError}</div>}
            {modelsLoading && <div className="model-opt">{t.main.loadingModels}</div>}
            {!modelsLoading && models.length === 0 && <div className="model-opt">{t.main.noModelCandidates}</div>}
            {models.map((model) => (
              <div
                key={model.id}
                data-testid={`model-menu-option-${model.id}`}
                className={`model-opt${model.id === selectedModelId ? ' act' : ''}`}
                onClick={() => {
                  onSelectModel(model.id);
                  setModelMenuOpen(false);
                }}
              >
                {model.id === selectedModelId && <Icon name="check" />}
                <span>{modelLabel(model)}</span>
              </div>
            ))}
          </div>
        )}

        <div className={`cmp-inner${conversation.running ? ' off' : ''}`}>
          {attachments.length > 0 && (
            <div className="attach-row">
              {attachments.map((attachment) => (
                <div key={attachment.id} className="att-thumb">
                  {attachment.previewUrl
                    ? <img src={attachment.previewUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt={attachment.name} />
                    : <div style={{ width: '100%', height: '100%', background: 'var(--s1)' }} />
                  }
                  <button data-testid={`attachment-remove-button-${attachment.id}`} className="att-rm" onClick={() => setAttachments((current) => current.filter((item) => item.id !== attachment.id))}>x</button>
                </div>
              ))}
            </div>
          )}
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
            disabled={conversation.running}
          />
          <div className="cmp-bar">
            <Tip label={t.main.addImage}>
              <button
                data-testid="composer-add-image-button"
                className={`cmp-add${attachOpen || layerOpen ? ' open' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  setAttachOpen((open) => !open);
                  setLayerOpen(false);
                  setModelMenuOpen(false);
                  setProfileMenuOpen(false);
                }}
              >
                <Icon name="add" />
              </button>
            </Tip>
            <div
              data-testid="main-model-selector"
              className={`cmp-chip${modelMenuOpen ? ' open' : ''}`}
              onClick={(event) => {
                event.stopPropagation();
                setModelMenuOpen((open) => !open);
                setAttachOpen(false);
                setLayerOpen(false);
                setProfileMenuOpen(false);
              }}
            >
              <span className="cmp-dot" />
              <span>{selectedModelLabel}</span>
              <Icon name="chevron-down" size={9} />
            </div>
            <div className="cmp-sp" />
            <div className="send-wrap">
              <button data-testid="composer-send-button" className="cmp-send" disabled={!canSend} onClick={() => void handleSend()} title={t.main.send}>
                {conversation.running
                  ? <Icon name="spinner" size={13} className="spin" />
                  : <Icon name="send" />
                }
              </button>
            </div>
          </div>
        </div>
      </footer>

      {toast && <div data-testid="toast" className="toast">{toast}</div>}
    </div>
  );
}
