import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiFormat, ProviderProfile, WorkflowMapping, WorkflowInputCandidate } from '@imagen-ps/application';
import type { AppGenerationSettings } from '../../ports/app-generation-settings';
import type { ModelGenerationSettingsController } from '../hooks/use-model-generation-settings';
import { profileToProviderRow } from '../../domain/mappers';
import { useAppServices } from '../../ports/app-services-context';
import { Icon } from '../components/icons';
import { SettingsListRow } from '../components/settings-list-row';
import { IconButton } from '../primitives/icon-button';
import { ActionButton, Button, Checkbox, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { useI18n } from '../i18n/i18n-context';
import { configurationInstanceLabel, modelInfoFromProfileItem } from '../model-info';
import type { ComfyUiManagementController } from '../hooks/use-comfyui-management';
import { TextSelect } from '../components/text-select';
import { StatusNotice } from '../components/status-notice';

interface SettingsPageProps {
  readonly onNav: (view: string) => void;
  readonly profiles: readonly ProviderProfile[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onOpenProfile: (profileId: string) => void;
  readonly onOpenOnboarding: () => void;
  readonly generationSettings?: AppGenerationSettings;
  readonly modelGenerationSettings?: ModelGenerationSettingsController;
  readonly onOpenGlobalGeneration?: () => void;
  readonly onOpenPromptSettings?: () => void;
  readonly comfyUi: ComfyUiManagementController;
  readonly initialBackendTab?: 'provider' | 'comfyui';
  readonly onBackendTabChange?: (tab: 'provider' | 'comfyui') => void;
}

function ComfyUiSettingsRoot({
  controller,
  onNav,
  activeTab,
  onTabChange,
}: {
  readonly controller: ComfyUiManagementController;
  readonly onNav: (view: string) => void;
  readonly activeTab: 'provider' | 'comfyui';
  readonly onTabChange: (tab: 'provider' | 'comfyui') => void;
}) {
  const [address, setAddress] = useState(controller.baseUrl);
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [mappingMenu, setMappingMenu] = useState<'text' | 'image' | null>(null);
  const [parameterMenu, setParameterMenu] = useState<string | null>(null);
  const current = controller.runtime?.identity;
  const filtered = controller.catalog.filter((item) => `${item.displayName} ${item.remotePath}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const groups = new Map<string, typeof filtered>();
  filtered.forEach((item) => {
    const key = item.groupPath.join('/') || '/';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  const refKey = (ref: { readonly nodeId: string; readonly inputName?: string; readonly widgetIndex?: number }): string => `${ref.nodeId}\u0000${ref.inputName ?? ''}\u0000${ref.widgetIndex ?? ''}`;
  const mapping = controller.mappingProjection;
  const mappingOptions = (candidates: readonly WorkflowInputCandidate[]): readonly { readonly id: string; readonly label: string }[] => [
    { id: 'none', label: 'Do not map' },
    ...candidates.map((candidate) => ({ id: refKey(candidate.ref), label: candidate.label })),
  ];
  const mappingId = (value: WorkflowMapping): string => value ? refKey(value) : 'none';
  useEffect(() => {
    setAddress(controller.baseUrl);
  }, [controller.baseUrl]);
  if (picker) {
    return (
      <div className="page page-enter" data-testid="comfyui-workflow-picker">
        <header className="hdr">
          <IconButton data-testid="comfyui-picker-back" className="hdr-btn" quiet icon={<Icon name="chevron-left" />} tooltip="Back" onClick={() => setPicker(false)} />
          <div className="hdr-title">Workflow Picker</div>
        </header>
        <div className="scroll">
          <TextField aria-label="Search workflows" data-testid="comfyui-workflow-search" className="field-input" type="search" value={search} onValue={setSearch} />
          <div className="sec-lbl">Recent</div>
          {groups.size === 0 ? <div className="settings-empty-state">No workflows found.</div> : Array.from(groups.entries()).map(([group, items]) => (
            <section key={group} className="section" data-testid={`comfyui-workflow-group-${group}`}>
              <div className="sec-lbl">{group}</div>
              {items.map((item) => (
                <SettingsListRow
                  key={item.workflowId}
                  testId={`comfyui-workflow-option-${item.workflowId}`}
                  title={item.displayName}
                  leading={<Icon name="algorithm" size={14} />}
                  meta={<span className="prov-summary-mono">{item.remotePath}</span>}
                  onOpen={() => { void controller.selectWorkflow(item.workflowId).then(() => setPicker(false)); }}
                />
              ))}
            </section>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="page page-enter" data-testid="comfyui-settings-root">
      <header className="hdr">
        <IconButton data-testid="comfyui-settings-back" className="hdr-btn" quiet icon={<Icon name="chevron-left" />} tooltip="Back" onClick={() => onNav('main')} />
        <div className="hdr-title">ComfyUI</div>
      </header>
      <div className="filter-bar settings-backend-segments" role="group" aria-label="Generation backend">
        <ActionButton data-testid="settings-backend-provider" className="fchip" quiet selected={activeTab === 'provider'} onClick={() => onTabChange('provider')}>Provider</ActionButton>
        <ActionButton data-testid="settings-backend-comfyui" className="fchip" quiet selected={activeTab === 'comfyui'} onClick={() => onTabChange('comfyui')}>ComfyUI</ActionButton>
      </div>
      <div className="scroll">
        <section className="section" data-testid="comfyui-connection-section">
          <div className="sec-lbl">Connection</div>
          <FieldLabel htmlFor="comfyui-address">Address</FieldLabel>
          <TextField id="comfyui-address" data-testid="comfyui-address" className="field-input" value={address} onValue={setAddress} />
          <Button data-testid="comfyui-connect" disabled={controller.busy || !address.trim()} onClick={() => void controller.saveBaseUrl(address)}>Connect</Button>
          {controller.baseUrl ? <HelpText data-testid="comfyui-connection-status">{controller.error ?? controller.baseUrl}</HelpText> : null}
        </section>
        <section className="section" data-testid="comfyui-current-workflow-section">
          <div className="sec-lbl">Current Workflow</div>
          {current ? (
            <>
              <div className="settings-section-heading">{current.displayName}</div>
              <div className="prov-summary-mono">{current.remotePath}</div>
              <div className="settings-action-row">
                <Button data-testid="comfyui-change-workflow" onClick={() => setPicker(true)}>Change workflow</Button>
                <Button data-testid="comfyui-refresh-workflow" onClick={() => void controller.refresh()}>Refresh</Button>
                <Button data-testid="comfyui-open-workflow" onClick={() => void controller.openInComfyUi()}>Open in ComfyUI</Button>
              </div>
            </>
          ) : (
            <>
              <HelpText data-testid="comfyui-no-current-workflow">Select a saved workflow.</HelpText>
              <Button data-testid="comfyui-change-workflow" disabled={controller.loading || controller.catalog.length === 0} onClick={() => setPicker(true)}>Choose workflow</Button>
            </>
          )}
        </section>
        {mapping?.showSection ? (
          <section className="section" data-testid="comfyui-input-mapping">
            <div className="sec-lbl">Input Mapping</div>
            {(['text', 'image'] as const).map((kind) => {
              const state = mapping[kind];
              const candidates = kind === 'text' ? mapping.textCandidates : mapping.imageCandidates;
              if (candidates.length === 1 && !state.notice) return null;
              return (
                <div className="field" key={kind}>
                  {candidates.length > 1 ? (
                    <TextSelect
                      testId={`comfyui-${kind}-mapping`}
                      label={kind === 'text' ? 'Prompt input' : 'Image input'}
                      value={state.resolved ? candidates.find((candidate) => refKey(candidate.ref) === mappingId(state.resolved))?.label ?? 'Do not map' : 'Do not map'}
                      open={mappingMenu === kind}
                      onOpenChange={(open) => setMappingMenu(open ? kind : null)}
                      options={mappingOptions(candidates)}
                      selectedId={mappingId(state.resolved)}
                      onSelect={(id) => {
                        const candidate = candidates.find((item) => refKey(item.ref) === id);
                        void controller.setMapping(kind, candidate?.ref ?? null);
                        setMappingMenu(null);
                      }}
                    />
                  ) : null}
                  {state.notice ? <HelpText className="field-hint">{state.notice}</HelpText> : null}
                  {state.ambiguous ? <HelpText className="field-hint">Select one input to map.</HelpText> : null}
                </div>
              );
            })}
          </section>
        ) : null}
        {controller.runtime?.form ? (
          <section className="section" data-testid="comfyui-workflow-parameters">
            <div className="sec-lbl">Workflow Parameters</div>
            {controller.runtime.form.nodes.some((node) => node.visible && node.widgets.some((widget) => widget.visible && widget.writable)) ? controller.runtime.form.nodes.filter((node) => node.visible).flatMap((node) => node.widgets.filter((widget) => widget.visible && widget.writable).map((widget) => (
              <div className="field" key={`${node.nodeId}:${widget.order}`}>
                <FieldLabel htmlFor={`comfyui-parameter-${node.nodeId}-${widget.order}`}>{node.label || widget.label}</FieldLabel>
                {widget.kind === 'boolean' ? (
                  <Checkbox
                    data-testid={`comfyui-parameter-${node.nodeId}-${widget.order}`}
                    checked={Boolean(controller.draftValues[refKey(widget.ref)] ?? widget.workflowValue)}
                    onChecked={(value) => controller.setParameter(widget.ref, value)}
                  />
                ) : widget.kind === 'combo' && widget.options ? (
                  <TextSelect
                    testId={`comfyui-parameter-${node.nodeId}-${widget.order}`}
                    label={widget.label}
                    value={String(controller.draftValues[refKey(widget.ref)] ?? widget.workflowValue ?? '')}
                    open={parameterMenu === `${node.nodeId}:${widget.order}`}
                    onOpenChange={(open) => setParameterMenu(open ? `${node.nodeId}:${widget.order}` : null)}
                    options={widget.options.map((option) => ({ id: option, label: option }))}
                    selectedId={String(controller.draftValues[refKey(widget.ref)] ?? widget.workflowValue ?? '')}
                    onSelect={(value) => {
                      controller.setParameter(widget.ref, value);
                      setParameterMenu(null);
                    }}
                  />
                ) : (
                  <TextField
                    id={`comfyui-parameter-${node.nodeId}-${widget.order}`}
                    type="text"
                    inputMode={widget.kind === 'number' || widget.kind === 'seed' ? 'numeric' : undefined}
                    value={String(controller.draftValues[refKey(widget.ref)] ?? widget.workflowValue ?? '')}
                    onValue={(value) => controller.setParameter(widget.ref, widget.kind === 'number' || widget.kind === 'seed' ? Number(value) : value)}
                  />
                )}
              </div>
            ))) : <HelpText data-testid="comfyui-parameters-empty">This workflow has no exposed parameters.</HelpText>}
          </section>
        ) : null}
        {controller.error ? <section className="section" data-testid="comfyui-diagnostics"><StatusNotice tone="negative" message="ComfyUI needs attention" detail={controller.error} copyText={controller.error} /></section> : null}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'P';
}

function apiFormatMetaLabel(apiFormat: ApiFormat): string {
  if (apiFormat === 'openai-images') {
    return 'OpenAI Images';
  }
  if (apiFormat === 'openai-chat-completions') {
    return 'OpenAI Chat';
  }
  return 'Gemini GenerateContent';
}

interface ProviderListRow {
  readonly profileId: string;
  readonly apiFormat: ApiFormat;
  readonly displayName: string;
  readonly enabled: boolean;
  readonly apiFormatLabel: string;
  readonly modelLabel?: string;
}

interface ProviderListItemProps {
  readonly row: ProviderListRow;
  readonly special?: boolean;
  readonly onOpen: () => void;
  readonly labels: {
    readonly ready: string;
    readonly needsSetup: string;
    readonly configured: string;
  };
}

function ProviderListItem({
  row,
  special = false,
  onOpen,
  labels,
}: ProviderListItemProps) {
  const hasConfiguredModel = Boolean(row.modelLabel);
  const readinessTone = !hasConfiguredModel ? 'warning' : row.enabled ? 'ready' : 'configured';
  const readinessLabel = !hasConfiguredModel ? labels.needsSetup : row.enabled ? labels.ready : labels.configured;

  return (
    <SettingsListRow
      testId={`provider-row-${row.profileId}`}
      watch={`${row.profileId}:${row.enabled}:${row.modelLabel ?? ''}`}
      title={row.displayName}
      special={special}
      disabled={!row.enabled}
      leading={(
        <div
          className="prov-ico"
          style={special
            ? { background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-informative)' }
            : { background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-accent-default)' }}
        >
          {special ? <Icon name="magic-wand" size={14} /> : initials(row.displayName)}
        </div>
      )}
      meta={(
        <>
          <span className="prov-model">{row.modelLabel ?? row.apiFormat}</span>
          <span className="prov-meta-sep">·</span>
          <span className="prov-family">{apiFormatMetaLabel(row.apiFormat)}</span>
        </>
      )}
      end={(
        <div className={`prov-readiness ${readinessTone}`} aria-label={readinessLabel}>
          <span className="prov-readiness-dot" aria-hidden="true" />
          <span className="prov-status-text">{readinessLabel}</span>
        </div>
      )}
      onOpen={onOpen}
    />
  );
}

export function SettingsPage({
  onNav,
  profiles,
  loading,
  error,
  onOpenProfile,
  onOpenOnboarding,
  generationSettings,
  modelGenerationSettings,
  onOpenGlobalGeneration,
  onOpenPromptSettings,
  comfyUi,
  initialBackendTab = 'provider',
  onBackendTabChange,
}: SettingsPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const [modelLabels, setModelLabels] = useState<ReadonlyMap<string, string>>(new Map());
  const [settingsTab, setSettingsTab] = useState<'provider' | 'comfyui'>(initialBackendTab);
  const sequenceRef = useRef(0);

  useEffect(() => {
    setSettingsTab(initialBackendTab);
  }, [initialBackendTab]);

  const changeSettingsTab = (next: 'provider' | 'comfyui') => {
    setSettingsTab(next);
    onBackendTabChange?.(next);
  };
  const settingsTabForRender: 'provider' | 'comfyui' = settingsTab;

  useEffect(() => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    if (profiles.length === 0) {
      setModelLabels(new Map());
      return;
    }
    void Promise.all(
      profiles.map(async (profile) => {
        const result = await services.commands.listProfileModels(profile.profileId);
        const firstConfigured = result.ok ? result.value[0] : undefined;
        if (!firstConfigured) {
          return [profile.profileId, ''] as const;
        }
        return [profile.profileId, configurationInstanceLabel(modelInfoFromProfileItem(firstConfigured))] as const;
      }),
    ).then((entries) => {
      if (sequenceRef.current !== sequence) {
        return;
      }
      setModelLabels(new Map(entries));
    }).catch(() => {
      if (sequenceRef.current !== sequence) {
        return;
      }
      setModelLabels(new Map());
    });
  }, [profiles, services]);

  const rows = useMemo(
    () => profiles.map((profile) => {
      const row = profileToProviderRow(profile);
      return {
        ...row,
        ...(modelLabels.get(row.profileId) ? { modelLabel: modelLabels.get(row.profileId) } : {}),
      };
    }),
    [modelLabels, profiles],
  );
  const labels = {
    ready: t.common.ready,
    needsSetup: t.common.needsSetup,
    configured: t.settings.configured,
  };
  if (settingsTab === 'comfyui') {
    return <ComfyUiSettingsRoot controller={comfyUi} onNav={onNav} activeTab={settingsTab} onTabChange={changeSettingsTab} />;
  }

  return (
    <div className="page page-enter">
      <header className="hdr">
        <IconButton
          data-testid="providers-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={() => onNav('main')}
        />
        <div className="hdr-title">{t.settings.configuration}</div>
        <IconButton
            data-testid="providers-help-button"
            className="hdr-btn"
            quiet
            icon={<Icon name="question" />}
            tooltip={t.settings.onboardingHelp}
            onClick={onOpenOnboarding}
        />
        <IconButton
          data-testid="providers-add-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="add" />}
          tooltip={t.common.addProvider}
          placement="bottom"
          onClick={() => onNav('settings-add')}
        />
      </header>
      <div className="filter-bar settings-backend-segments" role="group" aria-label={t.settings.generationBackend}>
        <ActionButton
          data-testid="settings-backend-provider"
          className="fchip"
          quiet
          selected={settingsTabForRender === 'provider'}
          onClick={() => changeSettingsTab('provider')}
        >
          {t.common.provider}
        </ActionButton>
        <ActionButton
          data-testid="settings-backend-comfyui"
          className="fchip"
          quiet
          selected={settingsTabForRender === 'comfyui'}
          onClick={() => changeSettingsTab('comfyui')}
        >
          {t.settings.comfyUi}
        </ActionButton>
      </div>
      <div className="scroll">
        <div className="sec-lbl">{t.settings.configured}</div>
        <SettingsListRow
          testId="global-generation-settings-row"
          title={t.settings.globalGeneration}
          special
          leading={(
            <div className="prov-ico" style={{ background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-accent-default)' }}>
              <Icon name="settings" size={14} />
            </div>
          )}
          meta={(
            <span className="prov-summary-mono">
              {modelGenerationSettings?.selection
                ? `${modelGenerationSettings.selection.imageSize.toUpperCase()} · ${modelGenerationSettings.selection.outputFormat.toUpperCase()} · ${modelGenerationSettings.selection.ratio}`
                : generationSettings
                  ? generationSettings.providerInputSizePreset.toUpperCase()
                  : t.settings.loading}
            </span>
          )}
          onOpen={() => onOpenGlobalGeneration?.()}
        />
        <SettingsListRow
          testId="prompt-settings-row"
          title={t.settings.promptSettings}
          special
          leading={(
            <div className="prov-ico" style={{ background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-informative)' }}>
              <Icon name="pencil" size={14} />
            </div>
          )}
          meta={<span className="prov-summary">{t.settings.promptSettingsSummary}</span>}
          onOpen={() => onOpenPromptSettings?.()}
        />
        <>
            <div className="sec-lbl">{t.settings.providerProfiles}</div>
            {loading && <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.loading}</div>}
            {error && <div style={{ padding: 16, color: 'var(--app-color-negative)', fontSize: 12 }}>{error}</div>}
            {!loading && rows.length === 0 && (
              <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.noProviderProfile}</div>
            )}
            {rows.map((row) => (
              <ProviderListItem
                key={row.profileId}
                row={row}
                labels={labels}
                onOpen={() => onOpenProfile(row.profileId)}
              />
            ))}
        </>
      </div>
    </div>
  );
}
