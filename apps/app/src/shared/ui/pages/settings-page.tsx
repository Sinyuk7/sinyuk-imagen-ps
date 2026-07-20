import { useEffect, useRef, useState } from 'react';
import type { ApiFormat, ComfyUiMaskBinding, ProviderProfile, WorkflowInputCandidate, WorkflowMapping } from '@imagen-ps/application';
import type { AppGenerationSettings } from '../../ports/app-generation-settings';
import type { ModelGenerationSettingsController } from '../hooks/use-model-generation-settings';
import { profileToProviderRow } from '../../domain/mappers';
import { useAppServices } from '../../ports/app-services-context';
import { Icon } from '../components/icons';
import { SettingsListRow } from '../components/settings-list-row';
import { ActionButton, Button, Checkbox, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import { useI18n } from '../i18n/i18n-context';
import type { ComfyUiManagementController } from '../hooks/use-comfyui-management';
import { TextSelect } from '../components/text-select';
import { StatusNotice } from '../components/status-notice';
import type { SettingsTab } from '../settings-route';

interface SettingsPageProps {
  readonly activeTab: SettingsTab;
  readonly onSelectTab: (tab: SettingsTab) => void;
  readonly onBack: () => void;
  readonly profiles: readonly ProviderProfile[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onOpenProfile: (profileId: string) => void;
  readonly onOpenProviderOutput: () => void;
  readonly onOpenProviderNew: () => void;
  readonly onOpenGlobalSettings: () => void;
  readonly onOpenPromptSettings: () => void;
  readonly generationSettings: AppGenerationSettings;
  readonly modelGenerationSettings: ModelGenerationSettingsController;
  readonly comfyUi: ComfyUiManagementController;
}

function apiFormatMetaLabel(apiFormat: ApiFormat): string {
  if (apiFormat === 'openai-images') return 'OpenAI Images';
  if (apiFormat === 'openai-chat-completions') return 'OpenAI Chat';
  return 'Gemini GenerateContent';
}

function providerEndpointHost(profile: ProviderProfile): string | undefined {
  const connection = profile.config.connection as {
    readonly selectedEndpointId?: unknown;
    readonly endpoints?: readonly { readonly id?: unknown; readonly url?: unknown; readonly enabled?: unknown }[];
  } | undefined;
  const endpoints = connection?.endpoints;
  if (!Array.isArray(endpoints)) return undefined;
  const endpoint = endpoints.find((item) => item.id === connection?.selectedEndpointId)
    ?? endpoints.find((item) => item.enabled && typeof item.url === 'string' && item.url.trim().length > 0)
    ?? endpoints.find((item) => typeof item.url === 'string' && item.url.trim().length > 0);
  if (typeof endpoint?.url !== 'string' || endpoint.url.trim().length === 0) return undefined;
  try {
    return new URL(endpoint.url).host || endpoint.url;
  } catch {
    return endpoint.url;
  }
}

function ProviderListItem({
  profile,
  modelCount,
  onOpen,
}: {
  readonly profile: ProviderProfile;
  readonly modelCount: number;
  readonly onOpen: () => void;
}) {
  const { messages: t } = useI18n();
  const row = profileToProviderRow(profile);
  const host = providerEndpointHost(profile);
  const configured = profile.enabled && Boolean(host) && modelCount > 0;
  return (
    <SettingsListRow
      testId={`provider-row-${profile.profileId}`}
      watch={`${profile.profileId}:${profile.updatedAt}:${modelCount}`}
      title={row.displayName}
      leading={<div className="prov-ico">{row.displayName.slice(0, 2).toUpperCase()}</div>}
      meta={(
        <>
          <span className="prov-family">{apiFormatMetaLabel(row.apiFormat)}</span>
          <span className="prov-meta-sep">·</span>
          <span className="prov-family">{host ?? t.common.needsSetup}</span>
        </>
      )}
      end={(
        <div className={`prov-readiness ${configured ? 'untested' : 'warning'}`} aria-label={configured ? t.settings.notTested : t.common.needsSetup}>
          <span className="prov-status-text">{t.settings.configuredModelCount(modelCount)}</span>
          <span className="prov-readiness-dot" aria-hidden="true" />
          <span className="prov-status-text">{configured ? t.settings.notTested : t.common.needsSetup}</span>
        </div>
      )}
      onOpen={onOpen}
    />
  );
}

function ProviderRoot({
  profiles,
  loading,
  error,
  modelCounts,
  onOpenOutput,
  onOpenProfile,
  onOpenNew,
}: {
  readonly profiles: readonly ProviderProfile[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly modelCounts: ReadonlyMap<string, number>;
  readonly onOpenOutput: () => void;
  readonly onOpenProfile: (profileId: string) => void;
  readonly onOpenNew: () => void;
}) {
  const { messages: t } = useI18n();
  return (
    <div className="scroll">
      <div className="settings-detail-layout">
        <div className="sec-lbl">{t.settings.providerOutput}</div>
        <SettingsListRow
          testId="provider-output-settings-row"
          title={t.settings.providerOutput}
          special
          leading={<div className="prov-ico"><Icon name="settings" size={14} /></div>}
          meta={<span className="prov-summary-mono">{t.settings.providerOutputSummary}</span>}
          onOpen={onOpenOutput}
        />
        <div className="sec-lbl">{t.settings.configuredProviders}</div>
        {loading ? <div className="settings-empty-state">{t.settings.loading}</div> : null}
        {error ? <div className="settings-empty-state">{error}</div> : null}
        {!loading && profiles.length === 0 ? (
          <div className="settings-empty-state" data-testid="provider-empty-state">
            {t.settings.noProviderProfile}
            <Button className="settings-empty-action" onClick={onOpenNew}>{t.common.addProvider}</Button>
          </div>
        ) : null}
        {profiles.map((profile) => <ProviderListItem key={profile.profileId} profile={profile} modelCount={modelCounts.get(profile.profileId) ?? 0} onOpen={() => onOpenProfile(profile.profileId)} />)}
      </div>
    </div>
  );
}

function GeneralRoot({
  onOpenGlobalSettings,
  onOpenPromptSettings,
}: {
  readonly onOpenGlobalSettings: () => void;
  readonly onOpenPromptSettings: () => void;
}) {
  const { messages: t } = useI18n();
  return (
    <div className="scroll">
      <div className="settings-detail-layout">
        <div className="sec-lbl">{t.settings.globalSettings}</div>
        <SettingsListRow testId="global-settings-row" title={t.settings.globalSettings} special leading={<div className="prov-ico"><Icon name="settings" size={14} /></div>} meta={<span className="prov-summary">{t.settings.globalSettingsSummary}</span>} onOpen={onOpenGlobalSettings} />
        <div className="sec-lbl">{t.settings.promptSettings}</div>
        <SettingsListRow testId="prompt-settings-row" title={t.settings.promptSettings} special leading={<div className="prov-ico"><Icon name="pencil" size={14} /></div>} meta={<span className="prov-summary">{t.settings.promptSettingsSummary}</span>} onOpen={onOpenPromptSettings} />
      </div>
    </div>
  );
}

function ComfyUiRoot({
  controller,
  address,
  onAddressChange,
}: {
  readonly controller: ComfyUiManagementController;
  readonly address: string;
  readonly onAddressChange: (value: string) => void;
}) {
  const { messages: t } = useI18n();
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [mappingMenu, setMappingMenu] = useState<'text' | 'image' | 'mask' | 'mask-polarity' | null>(null);
  const [parameterMenu, setParameterMenu] = useState<string | null>(null);
  const current = controller.runtime?.identity;
  const mapping = controller.mappingProjection;
  const filtered = controller.catalog.filter((item) => `${item.displayName} ${item.remotePath}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const groups = new Map<string, typeof filtered>();
  filtered.forEach((item) => {
    const key = item.groupPath.join('/') || '/';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  const refKey = (ref: { readonly nodeId: string; readonly inputName?: string; readonly widgetIndex?: number }) => `${ref.nodeId}\u0000${ref.inputName ?? ''}\u0000${ref.widgetIndex ?? ''}`;
  const mappingId = (value: WorkflowMapping) => value ? refKey(value) : 'none';
  const mappingOptions = (candidates: readonly WorkflowInputCandidate[]) => [{ id: 'none', label: 'Do not map' }, ...candidates.map((candidate) => ({ id: refKey(candidate.ref), label: candidate.label }))];
  const maskBinding = mapping?.mask.binding;
  const maskSelectionId = maskBinding ? refKey(maskBinding.inputRef) : 'none';
  const setMaskBinding = (candidate: WorkflowInputCandidate | undefined, polarity: ComfyUiMaskBinding['polarity'] = maskBinding?.polarity ?? 'white-edit') => {
    void controller.setMaskBinding(candidate === undefined ? undefined : {
      transport: 'separate-image-input', inputRef: candidate.ref, polarity,
    });
  };

  if (picker) {
    return (
      <div className="scroll" data-testid="comfyui-workflow-picker">
        <div className="settings-detail-layout">
          <div className="settings-section-header"><div className="section-title settings-section-heading">Workflow</div><IconButton className="settings-icon-button" quiet icon={<Icon name="chevron-left" />} tooltip={t.common.back} onClick={() => setPicker(false)} /></div>
          <TextField aria-label="Search workflows" data-testid="comfyui-workflow-search" className="field-input" type="search" value={search} onValue={setSearch} />
          {Array.from(groups.entries()).map(([group, items]) => <section key={group} data-testid={`comfyui-workflow-group-${group}`}>{items.map((item) => <SettingsListRow key={item.workflowId} testId={`comfyui-workflow-option-${item.workflowId}`} title={item.displayName} leading={<div className="prov-ico"><Icon name="algorithm" size={14} /></div>} meta={<span className="prov-summary-mono">{item.remotePath}</span>} onOpen={() => { void controller.selectWorkflow(item.workflowId).then(() => setPicker(false)); }} />)}</section>)}
        </div>
      </div>
    );
  }

  return (
    <div className="scroll">
      <div className="settings-detail-layout" data-testid="comfyui-settings-root">
        <section className="section" data-testid="comfyui-connection-section">
          <div className="section-title settings-section-heading">{t.settings.comfyUiConnection}</div>
          <div className="field">
            <FieldLabel htmlFor="comfyui-address">{t.settings.comfyUiAddress}</FieldLabel>
            <div className="settings-field-action-row">
              <TextField id="comfyui-address" data-testid="comfyui-address" className="field-input" value={address} onValue={onAddressChange} />
              <Button data-testid="comfyui-connect" disabled={controller.busy || !address.trim()} onClick={() => void controller.saveBaseUrl(address)}>Connect</Button>
            </div>
            {controller.baseUrl ? <HelpText data-testid="comfyui-connection-status" className="field-hint">{controller.error ?? controller.baseUrl}</HelpText> : null}
          </div>
        </section>
        <section className="section" data-testid="comfyui-current-workflow-section">
          <div className="section-title settings-section-heading">{t.settings.comfyUiCurrentWorkflow}</div>
          <SettingsListRow testId="comfyui-change-workflow" title={current?.displayName ?? t.settings.comfyUiChooseWorkflow} leading={<div className="prov-ico"><Icon name="algorithm" size={14} /></div>} meta={<span className="prov-summary-mono">{current?.remotePath ?? t.settings.comfyUiNoWorkflowSelected}</span>} onOpen={() => setPicker(true)} />
          {current ? <div className="settings-action-row"><Button data-testid="comfyui-refresh-workflow" onClick={() => void controller.refresh()}>Refresh</Button><Button data-testid="comfyui-open-workflow" onClick={() => void controller.openInComfyUi()}>Open in ComfyUI</Button></div> : null}
        </section>
        {mapping?.showSection ? <section className="section" data-testid="comfyui-input-mapping"><div className="section-title settings-section-heading">Input Mapping</div>{(['text', 'image'] as const).map((kind) => {
          const state = mapping[kind]; const candidates = kind === 'text' ? mapping.textCandidates : mapping.imageCandidates;
          return candidates.length > 1 ? <TextSelect key={kind} testId={`comfyui-${kind}-mapping`} label={kind === 'text' ? 'Prompt input' : 'Image input'} value={state.resolved ? candidates.find((candidate) => refKey(candidate.ref) === mappingId(state.resolved))?.label ?? 'Do not map' : 'Do not map'} open={mappingMenu === kind} onOpenChange={(open) => setMappingMenu(open ? kind : null)} options={mappingOptions(candidates)} selectedId={mappingId(state.resolved)} onSelect={(id) => { const candidate = candidates.find((item) => refKey(item.ref) === id); void controller.setMapping(kind, candidate?.ref ?? null); setMappingMenu(null); }} /> : state.notice ? <HelpText key={kind} className="field-hint">{state.notice}</HelpText> : null;
        })}{mapping.mask.requiresExplicitSelection ? <><TextSelect testId="comfyui-mask-mapping" label="Mask input" value={maskBinding ? mapping.maskCandidates.find((candidate) => refKey(candidate.ref) === maskSelectionId)?.label ?? 'Do not map' : 'Do not map'} open={mappingMenu === 'mask'} onOpenChange={(open) => setMappingMenu(open ? 'mask' : null)} options={mappingOptions(mapping.maskCandidates)} selectedId={maskSelectionId} onSelect={(id) => { setMaskBinding(mapping.maskCandidates.find((item) => refKey(item.ref) === id)); setMappingMenu(null); }} />{maskBinding ? <TextSelect testId="comfyui-mask-polarity" label="Mask polarity" value={maskBinding.polarity === 'white-edit' ? 'White edits' : 'Black edits'} open={mappingMenu === 'mask-polarity'} onOpenChange={(open) => setMappingMenu(open ? 'mask-polarity' : null)} options={[{ id: 'white-edit', label: 'White edits' }, { id: 'black-edit', label: 'Black edits' }]} selectedId={maskBinding.polarity} onSelect={(polarity) => { const candidate = mapping.maskCandidates.find((item) => refKey(item.ref) === maskSelectionId); if (candidate) setMaskBinding(candidate, polarity as ComfyUiMaskBinding['polarity']); setMappingMenu(null); }} /> : null}</> : null}</section> : null}
        {controller.runtime?.form ? <section className="section" data-testid="comfyui-workflow-parameters"><div className="section-title settings-section-heading">Workflow Parameters</div>{controller.runtime.form.nodes.some((node) => node.visible && node.widgets.some((widget) => widget.visible && widget.writable)) ? controller.runtime.form.nodes.flatMap((node) => node.visible ? node.widgets.filter((widget) => widget.visible && widget.writable).map((widget) => <div className="field" key={`${node.nodeId}:${widget.order}`}><FieldLabel htmlFor={`comfyui-parameter-${node.nodeId}-${widget.order}`}>{node.label || widget.label}</FieldLabel>{widget.kind === 'boolean' ? <Checkbox data-testid={`comfyui-parameter-${node.nodeId}-${widget.order}`} checked={Boolean(controller.draftValues[refKey(widget.ref)] ?? widget.workflowValue)} onChecked={(value) => controller.setParameter(widget.ref, value)} /> : widget.kind === 'combo' && widget.options ? <TextSelect testId={`comfyui-parameter-${node.nodeId}-${widget.order}`} label={widget.label} value={String(controller.draftValues[refKey(widget.ref)] ?? widget.workflowValue ?? '')} open={parameterMenu === `${node.nodeId}:${widget.order}`} onOpenChange={(open) => setParameterMenu(open ? `${node.nodeId}:${widget.order}` : null)} options={widget.options.map((option) => ({ id: option, label: option }))} selectedId={String(controller.draftValues[refKey(widget.ref)] ?? widget.workflowValue ?? '')} onSelect={(value) => { controller.setParameter(widget.ref, value); setParameterMenu(null); }} /> : <TextField id={`comfyui-parameter-${node.nodeId}-${widget.order}`} value={String(controller.draftValues[refKey(widget.ref)] ?? widget.workflowValue ?? '')} onValue={(value) => controller.setParameter(widget.ref, widget.kind === 'number' || widget.kind === 'seed' ? Number(value) : value)} />}</div>) : [] ) : <HelpText data-testid="comfyui-parameters-empty">This workflow has no exposed parameters.</HelpText>}</section> : null}
        {controller.error ? <section className="section" data-testid="comfyui-diagnostics"><StatusNotice tone="negative" message="ComfyUI needs attention" detail={controller.error} copyText={controller.error} /></section> : null}
      </div>
    </div>
  );
}

export function SettingsPage(props: SettingsPageProps) {
  const { messages: t } = useI18n();
  const services = useAppServices();
  const [modelCounts, setModelCounts] = useState<ReadonlyMap<string, number>>(new Map());
  const [comfyAddressDraft, setComfyAddressDraft] = useState(props.comfyUi.baseUrl);
  const sequenceRef = useRef(0);
  useEffect(() => setComfyAddressDraft(props.comfyUi.baseUrl), [props.comfyUi.baseUrl]);
  useEffect(() => {
    const sequence = ++sequenceRef.current;
    void Promise.all(props.profiles.map(async (profile) => {
      const result = await services.commands.listProfileModels(profile.profileId);
      return [profile.profileId, result.ok ? result.value.length : 0] as const;
    })).then((entries) => { if (sequence === sequenceRef.current) setModelCounts(new Map(entries)); }).catch(() => { if (sequence === sequenceRef.current) setModelCounts(new Map()); });
  }, [props.profiles, services]);
  const title = props.activeTab === 'provider' ? t.common.provider : props.activeTab === 'comfyui' ? t.settings.comfyUi : t.settings.configuration;
  return (
    <div className="page page-enter settings-page">
      <header className="hdr">
        <IconButton data-testid="settings-back-button" className="hdr-btn" quiet icon={<Icon name="chevron-left" />} tooltip={t.common.back} onClick={props.onBack} />
        <div className="hdr-title">{title}</div>
        {props.activeTab === 'provider' ? <IconButton data-testid="providers-add-button" className="hdr-btn" quiet icon={<Icon name="add" />} tooltip={t.common.addProvider} onClick={props.onOpenProviderNew} /> : <div className="hdr-btn" />}
      </header>
      <div className="filter-bar settings-backend-segments" role="tablist" aria-label={t.settings.generationBackend}>
        <ActionButton data-testid="settings-backend-provider" className="fchip" quiet selected={props.activeTab === 'provider'} onClick={() => props.onSelectTab('provider')}>{t.common.provider}</ActionButton>
        <ActionButton data-testid="settings-backend-comfyui" className="fchip" quiet selected={props.activeTab === 'comfyui'} onClick={() => props.onSelectTab('comfyui')}>{t.settings.comfyUi}</ActionButton>
        <ActionButton data-testid="settings-backend-general" className="fchip" quiet selected={props.activeTab === 'general'} onClick={() => props.onSelectTab('general')}>{t.settings.configuration}</ActionButton>
      </div>
      {props.activeTab === 'provider' ? <ProviderRoot profiles={props.profiles} loading={props.loading} error={props.error} modelCounts={modelCounts} onOpenOutput={props.onOpenProviderOutput} onOpenProfile={props.onOpenProfile} onOpenNew={props.onOpenProviderNew} /> : null}
      {props.activeTab === 'general' ? <GeneralRoot onOpenGlobalSettings={props.onOpenGlobalSettings} onOpenPromptSettings={props.onOpenPromptSettings} /> : null}
      {props.activeTab === 'comfyui' ? <ComfyUiRoot controller={props.comfyUi} address={comfyAddressDraft} onAddressChange={setComfyAddressDraft} /> : null}
    </div>
  );
}
