import { useEffect, useRef, useState } from 'react';
import type { ApiFormat, ComfyUiMaskBinding, ProviderProfile, WorkflowInputCandidate, WorkflowMapping } from '@imagen-ps/application';
import type { AppGenerationSettings } from '../../ports/app-generation-settings';
import type { ModelGenerationSettingsController } from '../hooks/use-model-generation-settings';
import { profileToProviderRow } from '../../domain/mappers';
import { useAppServices } from '../../ports/app-services-context';
import { useI18n } from '../i18n/i18n-context';
import type { ComfyUiManagementController } from '../hooks/use-comfyui-management';
import type { SettingsTab } from '../settings-route';
import { Button, Checkbox, FieldGroup, FooterActions, HelpText, Icon, IconButton, PageFrame, PageHeader, PageScroll, PageState, SegmentedTabs, SettingsFormSection, SettingsListRow, SettingsListSection, StatusNotice, TextField, TextSelect } from '../ui-system';

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
    <div>
      <div className="settings-detail-layout">
        <SettingsListSection title={t.settings.providerOutput}><SettingsListRow
          testId="provider-output-settings-row"
          title={t.settings.providerOutput}
          special
          leading={<div className="prov-ico"><Icon name="settings" size={14} /></div>}
          meta={<span className="prov-summary-mono">{t.settings.providerOutputSummary}</span>}
          onOpen={onOpenOutput}
        /></SettingsListSection>
        <SettingsListSection title={t.settings.configuredProviders}>
        {loading ? <PageState tone="neutral" message={t.settings.loading} /> : null}
        {error ? <PageState tone="negative" message={error} /> : null}
        {!loading && profiles.length === 0 ? (
          <div data-testid="provider-empty-state"><PageState tone="neutral" message={t.settings.noProviderProfile} action={<Button onClick={onOpenNew}>{t.common.addProvider}</Button>} /></div>
        ) : null}
        {profiles.map((profile) => <ProviderListItem key={profile.profileId} profile={profile} modelCount={modelCounts.get(profile.profileId) ?? 0} onOpen={() => onOpenProfile(profile.profileId)} />)}
        </SettingsListSection>
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
    <div>
      <div className="settings-detail-layout">
        <SettingsListSection title={t.settings.globalSettings}><SettingsListRow testId="global-settings-row" title={t.settings.globalSettings} special leading={<div className="prov-ico"><Icon name="settings" size={14} /></div>} meta={<span className="prov-summary">{t.settings.globalSettingsSummary}</span>} onOpen={onOpenGlobalSettings} /></SettingsListSection>
        <SettingsListSection title={t.settings.promptSettings}><SettingsListRow testId="prompt-settings-row" title={t.settings.promptSettings} special leading={<div className="prov-ico"><Icon name="pencil" size={14} /></div>} meta={<span className="prov-summary">{t.settings.promptSettingsSummary}</span>} onOpen={onOpenPromptSettings} /></SettingsListSection>
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
      <div data-testid="comfyui-workflow-picker">
        <div className="settings-detail-layout">
          <PageHeader title="Workflow" back={<IconButton className="settings-icon-button" quiet icon={<Icon name="chevron-left" />} tooltip={t.common.back} onClick={() => setPicker(false)} />} />
          <TextField aria-label="Search workflows" data-testid="comfyui-workflow-search" className="field-input" type="search" value={search} onValue={setSearch} />
          {Array.from(groups.entries()).map(([group, items]) => <SettingsListSection key={group} title={group} testId={`comfyui-workflow-group-${group}`}>{items.map((item) => <SettingsListRow key={item.workflowId} testId={`comfyui-workflow-option-${item.workflowId}`} title={item.displayName} leading={<div className="prov-ico"><Icon name="algorithm" size={14} /></div>} meta={<span className="prov-summary-mono">{item.remotePath}</span>} onOpen={() => { void controller.selectWorkflow(item.workflowId).then(() => { setPicker(false); }); }} />)}</SettingsListSection>)}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="settings-detail-layout" data-testid="comfyui-settings-root">
        <SettingsFormSection title={t.settings.comfyUiConnection} testId="comfyui-connection-section">
          <FieldGroup label={t.settings.comfyUiAddress} htmlFor="comfyui-address">
            <div className="settings-field-action-row">
              <TextField id="comfyui-address" data-testid="comfyui-address" className="field-input" value={address} onValue={onAddressChange} />
              <Button data-testid="comfyui-connect" disabled={controller.busy || !address.trim()} onClick={() => void controller.saveBaseUrl(address)}>Connect</Button>
            </div>
            {controller.baseUrl ? <HelpText data-testid="comfyui-connection-status" className="field-hint">{controller.error ?? controller.baseUrl}</HelpText> : null}
          </FieldGroup>
        </SettingsFormSection>
        <SettingsFormSection title={t.settings.comfyUiCurrentWorkflow} testId="comfyui-current-workflow-section">
          <SettingsListRow testId="comfyui-change-workflow" title={current?.displayName ?? t.settings.comfyUiChooseWorkflow} leading={<div className="prov-ico"><Icon name="algorithm" size={14} /></div>} meta={<span className="prov-summary-mono">{current?.remotePath ?? t.settings.comfyUiNoWorkflowSelected}</span>} onOpen={() => setPicker(true)} />
          {current ? <FooterActions><Button data-testid="comfyui-refresh-workflow" onClick={() => void controller.refresh()}>Refresh</Button><Button data-testid="comfyui-open-workflow" onClick={() => void controller.openInComfyUi()}>Open in ComfyUI</Button></FooterActions> : null}
        </SettingsFormSection>
        {mapping?.showSection ? <SettingsFormSection title="Input Mapping" testId="comfyui-input-mapping">{(['text', 'image'] as const).map((kind) => {
          const state = mapping[kind]; const candidates = kind === 'text' ? mapping.textCandidates : mapping.imageCandidates;
          return candidates.length > 1 ? <TextSelect key={kind} testId={`comfyui-${kind}-mapping`} label={kind === 'text' ? 'Prompt input' : 'Image input'} value={state.resolved ? candidates.find((candidate) => refKey(candidate.ref) === mappingId(state.resolved))?.label ?? 'Do not map' : 'Do not map'} open={mappingMenu === kind} onOpenChange={(open) => setMappingMenu(open ? kind : null)} options={mappingOptions(candidates)} selectedId={mappingId(state.resolved)} onSelect={(id) => { const candidate = candidates.find((item) => refKey(item.ref) === id); void controller.setMapping(kind, candidate?.ref ?? null); setMappingMenu(null); }} /> : state.notice ? <HelpText key={kind} className="field-hint">{state.notice}</HelpText> : null;
        })}{mapping.mask.requiresExplicitSelection ? <><TextSelect testId="comfyui-mask-mapping" label="Mask input" value={maskBinding ? mapping.maskCandidates.find((candidate) => refKey(candidate.ref) === maskSelectionId)?.label ?? 'Do not map' : 'Do not map'} open={mappingMenu === 'mask'} onOpenChange={(open) => setMappingMenu(open ? 'mask' : null)} options={mappingOptions(mapping.maskCandidates)} selectedId={maskSelectionId} onSelect={(id) => { setMaskBinding(mapping.maskCandidates.find((item) => refKey(item.ref) === id)); setMappingMenu(null); }} />{maskBinding ? <TextSelect testId="comfyui-mask-polarity" label="Mask polarity" value={maskBinding.polarity === 'white-edit' ? 'White edits' : 'Black edits'} open={mappingMenu === 'mask-polarity'} onOpenChange={(open) => setMappingMenu(open ? 'mask-polarity' : null)} options={[{ id: 'white-edit', label: 'White edits' }, { id: 'black-edit', label: 'Black edits' }]} selectedId={maskBinding.polarity} onSelect={(polarity) => { const candidate = mapping.maskCandidates.find((item) => refKey(item.ref) === maskSelectionId); if (candidate) setMaskBinding(candidate, polarity as ComfyUiMaskBinding['polarity']); setMappingMenu(null); }} /> : null}</> : null}</SettingsFormSection> : null}
        {controller.runtime?.form ? <SettingsFormSection title="Workflow Parameters" testId="comfyui-workflow-parameters">{controller.runtime.form.nodes.some((node) => node.visible && node.widgets.some((widget) => widget.visible && widget.writable)) ? controller.runtime.form.nodes.flatMap((node) => node.visible ? node.widgets.filter((widget) => widget.visible && widget.writable).map((widget) => {
          const parameterId = `comfyui-parameter-${node.nodeId}-${widget.order}`;
          const value = String(controller.draftValues[refKey(widget.ref)] ?? widget.workflowValue ?? '');
          return <FieldGroup key={`${node.nodeId}:${widget.order}`} label={node.label || widget.label} htmlFor={parameterId}>{widget.kind === 'boolean' ? <Checkbox id={parameterId} data-testid={parameterId} checked={Boolean(controller.draftValues[refKey(widget.ref)] ?? widget.workflowValue)} onChecked={(next) => controller.setParameter(widget.ref, next)} /> : widget.kind === 'combo' && widget.options ? <TextSelect triggerId={parameterId} testId={parameterId} label={widget.label} value={value} open={parameterMenu === `${node.nodeId}:${widget.order}`} onOpenChange={(open) => setParameterMenu(open ? `${node.nodeId}:${widget.order}` : null)} options={widget.options.map((option) => ({ id: option, label: option }))} selectedId={value} onSelect={(next) => { controller.setParameter(widget.ref, next); setParameterMenu(null); }} /> : <TextField id={parameterId} value={value} onValue={(next) => controller.setParameter(widget.ref, widget.kind === 'number' || widget.kind === 'seed' ? Number(next) : next)} />}</FieldGroup>;
        }) : [] ) : <HelpText data-testid="comfyui-parameters-empty">This workflow has no exposed parameters.</HelpText>}</SettingsFormSection> : null}
        {controller.error ? <SettingsFormSection title="Diagnostics" testId="comfyui-diagnostics"><StatusNotice tone="negative" message="ComfyUI needs attention" detail={controller.error} copyText={controller.error} /></SettingsFormSection> : null}
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
    <PageFrame watch={`settings:${props.activeTab}`}>
      <div className="settings-page">
      <PageHeader title={title} backLabel={t.common.back} backTestId="settings-back-button" onBack={props.onBack} right={props.activeTab === 'provider' ? <IconButton data-testid="providers-add-button" className="hdr-btn" quiet icon={<Icon name="add" />} tooltip={t.common.addProvider} onClick={props.onOpenProviderNew} /> : undefined} />
      <SegmentedTabs tabs={[{ id: 'provider', label: t.common.provider, testId: 'settings-backend-provider' }, { id: 'comfyui', label: t.settings.comfyUi, testId: 'settings-backend-comfyui' }, { id: 'general', label: t.settings.configuration, testId: 'settings-backend-general' }]} selectedId={props.activeTab} onSelect={(tab) => props.onSelectTab(tab as SettingsTab)} />
      <PageScroll>
        {props.activeTab === 'provider' ? <ProviderRoot profiles={props.profiles} loading={props.loading} error={props.error} modelCounts={modelCounts} onOpenOutput={props.onOpenProviderOutput} onOpenProfile={props.onOpenProfile} onOpenNew={props.onOpenProviderNew} /> : null}
        {props.activeTab === 'general' ? <GeneralRoot onOpenGlobalSettings={props.onOpenGlobalSettings} onOpenPromptSettings={props.onOpenPromptSettings} /> : null}
        {props.activeTab === 'comfyui' ? <ComfyUiRoot controller={props.comfyUi} address={comfyAddressDraft} onAddressChange={setComfyAddressDraft} /> : null}
      </PageScroll>
      </div>
    </PageFrame>
  );
}
