import { useState } from 'react';
import type { ComfyUiConnectionErrorCode, ComfyUiMaskBinding, WorkflowInputCandidate, WorkflowMapping } from '@imagen-ps/application';
import type { AppGenerationSettings } from '../../ports/app-generation-settings';
import { useI18n } from '../i18n/i18n-context';
import type { ComfyUiManagementController } from '../hooks/use-comfyui-management';
import type { SettingsTab } from '../settings-route';
import { Button, Checkbox, FieldGroup, HelpText, Icon, IconButton, List, ListStateItem, MotionActivityIcon, PageFrame, PageHeader, PageScroll, SegmentedTabs, SettingsFormSection, SettingsListRow, SettingsListSection, StatusNotice, TextField, TextSelect } from '../ui-system';

interface SettingsPageProps {
  readonly activeTab: SettingsTab;
  readonly onSelectTab: (tab: SettingsTab) => void;
  readonly onBack: () => void;
  readonly accounts: readonly import('@imagen-ps/application').ProviderAccount[];
  readonly loading: boolean;
  readonly error: string | null;
  readonly onOpenProviderAccounts: (providerId: 'grsai' | 'runninghub') => void;
  readonly onOpenGlobalSettings: () => void;
  readonly onOpenPromptSettings: () => void;
  readonly generationSettings: AppGenerationSettings;
  readonly comfyUi: ComfyUiManagementController;
}

function ProviderRoot({
  onOpenAccounts,
}: {
  readonly onOpenAccounts: (providerId: 'grsai' | 'runninghub') => void;
}) {
  const { messages: t } = useI18n();
  return (
    <div>
      <div className="settings-detail-layout">
        <SettingsListSection title="Providers">
          <List aria-label={t.settings.configuredProviders}>
            <SettingsListRow testId="provider-grsai-row" title="GRSAI" leading={<div className="prov-ico"><img className="provider-brand-icon provider-brand-icon-grsai" src="/assets/providers/grsai-favicon.png" alt="" /></div>} meta={<span className="prov-summary">GPT image relay</span>} onOpen={() => onOpenAccounts('grsai')} />
            <SettingsListRow testId="provider-runninghub-row" title="RunningHub" leading={<div className="prov-ico"><img className="provider-brand-icon provider-brand-icon-runninghub" src="/assets/providers/runninghub-favicon.png" alt="" /></div>} meta={<span className="prov-summary">Workflow image provider</span>} onOpen={() => onOpenAccounts('runninghub')} />
          </List>
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
        <SettingsListSection>
          <List aria-label={t.settings.globalSettings}>
            <SettingsListRow testId="global-settings-row" title={t.settings.globalSettings} special leading={<div className="prov-ico"><Icon name="settings" size={14} /></div>} meta={<span className="prov-summary">{t.settings.globalSettingsSummary}</span>} onOpen={onOpenGlobalSettings} />
          </List>
        </SettingsListSection>
        <SettingsListSection>
          <List aria-label={t.settings.promptSettings}>
            <SettingsListRow testId="prompt-settings-row" title={t.settings.promptSettings} special leading={<div className="prov-ico"><Icon name="pencil" size={14} /></div>} meta={<span className="prov-summary">{t.settings.promptSettingsSummary}</span>} onOpen={onOpenPromptSettings} />
          </List>
        </SettingsListSection>
      </div>
    </div>
  );
}

function ComfyUiRoot({ controller }: { readonly controller: ComfyUiManagementController }) {
  const { messages: t } = useI18n();
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState('');
  const [mappingMenu, setMappingMenu] = useState<'text' | 'image' | 'mask' | 'mask-polarity' | null>(null);
  const [parameterMenu, setParameterMenu] = useState<string | null>(null);
  const current = controller.runtime?.identity;
  const connection = controller.connectionUiState;
  const address = controller.draftBaseUrl;
  const mapping = controller.mappingProjection;
  const filtered = controller.catalog.filter((item) => `${item.displayName} ${item.remotePath}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const groups = new Map<string, typeof filtered>();
  filtered.forEach((item) => {
    const key = item.groupPath.join('/') || '/';
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });
  const refKey = (ref: { readonly nodeId: string; readonly inputName?: string; readonly widgetIndex?: number }) => `${ref.nodeId}\u0000${ref.inputName ?? ''}\u0000${ref.widgetIndex ?? ''}`;
  const mappingOptionId = (index: number) => `candidate-${index}`;
  const mappingLabel = (candidate: WorkflowInputCandidate) => `${candidate.sectionLabel} / ${candidate.label}`;
  const mappingBadge = (candidate: WorkflowInputCandidate) => candidate.ref.inputName === undefined
    ? `Node ${candidate.ref.nodeId} / Widget ${candidate.ref.widgetIndex}`
    : `Node ${candidate.ref.nodeId} / ${candidate.ref.inputName}`;
  const mappingId = (candidates: readonly WorkflowInputCandidate[], value: WorkflowMapping) => {
    if (!value) return 'none';
    const index = candidates.findIndex((candidate) => refKey(candidate.ref) === refKey(value));
    return index < 0 ? 'none' : mappingOptionId(index);
  };
  const mappingCandidate = (candidates: readonly WorkflowInputCandidate[], id: string) => {
    const match = /^candidate-(\d+)$/u.exec(id);
    return match ? candidates[Number(match[1])] : undefined;
  };
  const mappingOptions = (candidates: readonly WorkflowInputCandidate[]) => [
    { id: 'none', label: 'Do not map' },
    ...candidates.map((candidate, index) => ({
      id: mappingOptionId(index),
      label: mappingLabel(candidate),
      badges: [mappingBadge(candidate)],
    })),
  ];
  const maskBinding = mapping?.mask.binding;
  const maskSelectionId = mappingId(mapping?.maskCandidates ?? [], maskBinding?.inputRef ?? null);
  const setMaskBinding = (candidate: WorkflowInputCandidate | undefined, polarity: ComfyUiMaskBinding['polarity'] = maskBinding?.polarity ?? 'white-edit') => {
    void controller.setMaskBinding(candidate === undefined ? undefined : {
      transport: 'separate-image-input', inputRef: candidate.ref, polarity,
    });
  };
  const failureMessage = (code: ComfyUiConnectionErrorCode): string => {
    if (code === 'API_UNREACHABLE') return t.settings.comfyUiApiUnreachable;
    if (code === 'API_INVALID_RESPONSE') return t.settings.comfyUiApiInvalidResponse;
    if (code === 'WEBVIEW_LOAD_FAILED') return t.settings.comfyUiWebViewLoadFailed;
    if (code === 'BRIDGE_HANDSHAKE_TIMEOUT') return t.settings.comfyUiBridgeHandshakeTimeout;
    if (code === 'BRIDGE_CONTRACT_MISMATCH') return t.settings.comfyUiBridgeContractMismatch;
    return t.settings.comfyUiPersistenceFailed;
  };
  const phaseMessage = connection.kind === 'connecting'
    ? connection.phase === 'api'
      ? t.settings.comfyUiCheckingServer
      : connection.phase === 'frontend'
        ? t.settings.comfyUiLoadingBridge
        : connection.phase === 'bridge'
          ? t.settings.comfyUiValidatingBridge
          : t.settings.comfyUiSavingConnection
    : undefined;
  const statusLines = connection.kind === 'invalid'
    ? [t.settings.comfyUiAddressInvalid, ...(connection.activeBaseUrl ? [t.settings.comfyUiStillConnectedTo(connection.activeBaseUrl)] : [])]
    : connection.kind === 'ready'
      ? connection.activeBaseUrl ? [t.settings.comfyUiSwitchFrom(connection.activeBaseUrl)] : ['']
      : connection.kind === 'connecting'
        ? [phaseMessage ?? t.settings.comfyUiConnecting, ...(connection.activeBaseUrl ? [t.settings.comfyUiStillConnectedTo(connection.activeBaseUrl)] : [])]
        : connection.kind === 'connected'
          ? [t.settings.comfyUiConnectedTo(connection.baseUrl)]
          : [failureMessage(connection.failure.code), ...(connection.activeBaseUrl ? [t.settings.comfyUiStillConnectedTo(connection.activeBaseUrl)] : [])];
  const actionLabel = connection.action === 'connecting'
    ? t.settings.comfyUiConnecting
    : connection.action === 'reconnect'
      ? t.settings.comfyUiReconnect
      : connection.action === 'retry'
        ? t.settings.comfyUiRetry
        : t.settings.comfyUiConnect;
  const activateConnection = (): void => {
    if (connection.disabled) return;
    void controller.connect().catch(() => undefined);
  };

  if (picker) {
    return (
      <div className="comfyui-workflow-picker" data-testid="comfyui-workflow-picker">
        <div className="settings-detail-layout">
          <SettingsFormSection
            title={(
              <span className="comfyui-workflow-picker-heading">
                <IconButton data-testid="comfyui-workflow-picker-back" className="settings-icon-button" quiet icon={<Icon name="chevron-left" />} tooltip={t.common.back} onClick={() => setPicker(false)} />
                <span>Workflow</span>
              </span>
            )}
            testId="comfyui-workflow-picker-section"
          >
            <TextField aria-label="Search workflows" placeholder="Search workflows" data-testid="comfyui-workflow-search" className="field-input" type="search" value={search} onValue={setSearch} />
            {controller.catalog.length === 0 ? (
              <List aria-label="Workflow">
                <ListStateItem data-testid="comfyui-workflow-empty" kind="empty" title={t.settings.comfyUiNoWorkflowSelected} />
              </List>
            ) : filtered.length === 0 ? (
              <List aria-label="Workflow">
                <ListStateItem data-testid="comfyui-workflow-search-empty" kind="empty" title={t.settings.comfyUiNoWorkflowSelected} />
              </List>
            ) : Array.from(groups.entries()).map(([group, items]) => (
              <div key={group} className="comfyui-workflow-picker-group" data-testid={`comfyui-workflow-group-${group}`}>
                <h3 className="comfyui-workflow-picker-group-title">{group}</h3>
                <List aria-label={group}>
                  {items.map((item) => <SettingsListRow key={item.workflowId} testId={`comfyui-workflow-option-${item.workflowId}`} title={item.displayName} leading={<div className="prov-ico"><Icon name="algorithm" size={14} /></div>} meta={<span className="prov-summary">{item.remotePath}</span>} onOpen={() => { void controller.selectWorkflow(item.workflowId).then(() => { setPicker(false); }); }} />)}
                </List>
              </div>
            ))}
          </SettingsFormSection>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="settings-detail-layout" data-testid="comfyui-settings-root">
        <SettingsFormSection title={t.settings.comfyUiConnection} testId="comfyui-connection-section">
          <div className="comfyui-connection-field">
            <FieldGroup label={t.settings.comfyUiAddress} htmlFor="comfyui-address">
              <div className="settings-field-action-row comfyui-connection-controls">
                <TextField
                  id="comfyui-address"
                  data-testid="comfyui-address"
                  className="field-input"
                  value={address}
                  onValue={controller.setDraftBaseUrl}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' || connection.disabled) return;
                    event.preventDefault();
                    activateConnection();
                  }}
                  aria-invalid={connection.kind === 'invalid' || undefined}
                  aria-describedby="comfyui-connection-status"
                  title={address}
                />
                <Button data-testid="comfyui-connect" disabled={connection.disabled} onClick={activateConnection}>
                  {connection.kind === 'connecting' ? <span className="comfyui-connection-spinner" role="img" aria-label={t.settings.comfyUiConnecting}><MotionActivityIcon><Icon name="spinner" size={13} /></MotionActivityIcon></span> : null}
                  <span>{actionLabel}</span>
                </Button>
              </div>
              <HelpText
                id="comfyui-connection-status"
                data-testid="comfyui-connection-status"
                className="field-hint comfyui-connection-status"
                variant={connection.kind === 'failed' ? 'negative' : undefined}
                role={connection.kind === 'failed' ? 'alert' : 'status'}
                aria-live={connection.kind === 'failed' ? 'assertive' : 'polite'}
                title={statusLines.filter(Boolean).join(' ')}
              >
                {statusLines.map((line, index) => <span key={`${index}:${line}`} className="comfyui-connection-status-line">{line || '\u00a0'}</span>)}
              </HelpText>
            </FieldGroup>
          </div>
        </SettingsFormSection>
        <SettingsFormSection title={t.settings.comfyUiCurrentWorkflow} testId="comfyui-current-workflow-section">
          <List className="comfyui-workflow-list" aria-label={t.settings.comfyUiCurrentWorkflow}>
            <SettingsListRow testId="comfyui-change-workflow" title={current?.displayName ?? t.settings.comfyUiChooseWorkflow} leading={<div className="prov-ico"><Icon name="algorithm" size={14} /></div>} meta={<span className="prov-summary">{current?.remotePath ?? t.settings.comfyUiNoWorkflowSelected}</span>} onOpen={() => setPicker(true)} />
          </List>
        </SettingsFormSection>
        {mapping?.showSection ? <SettingsFormSection title="Input Mapping" testId="comfyui-input-mapping">{(['text', 'image'] as const).map((kind) => {
          const state = mapping[kind]; const candidates = kind === 'text' ? mapping.textCandidates : mapping.imageCandidates;
          const selectedId = mappingId(candidates, state.resolved);
          const selected = mappingCandidate(candidates, selectedId);
          return candidates.length > 1 ? <TextSelect key={kind} testId={`comfyui-${kind}-mapping`} label={kind === 'text' ? 'Prompt input' : 'Image input'} value={selected ? mappingLabel(selected) : 'Do not map'} open={mappingMenu === kind} onOpenChange={(open) => setMappingMenu(open ? kind : null)} options={mappingOptions(candidates)} selectedId={selectedId} onSelect={(id) => { void controller.setMapping(kind, mappingCandidate(candidates, id)?.ref ?? null); setMappingMenu(null); }} /> : state.notice ? <HelpText key={kind} className="field-hint">{state.notice}</HelpText> : null;
        })}{mapping.mask.requiresExplicitSelection ? <><TextSelect testId="comfyui-mask-mapping" label="Mask input" value={maskBinding ? mappingLabel(mappingCandidate(mapping.maskCandidates, maskSelectionId) ?? mapping.maskCandidates[0]) : 'Do not map'} open={mappingMenu === 'mask'} onOpenChange={(open) => setMappingMenu(open ? 'mask' : null)} options={mappingOptions(mapping.maskCandidates)} selectedId={maskSelectionId} onSelect={(id) => { setMaskBinding(mappingCandidate(mapping.maskCandidates, id)); setMappingMenu(null); }} />{maskBinding ? <TextSelect testId="comfyui-mask-polarity" label="Mask polarity" value={maskBinding.polarity === 'white-edit' ? 'White edits' : 'Black edits'} open={mappingMenu === 'mask-polarity'} onOpenChange={(open) => setMappingMenu(open ? 'mask-polarity' : null)} options={[{ id: 'white-edit', label: 'White edits' }, { id: 'black-edit', label: 'Black edits' }]} selectedId={maskBinding.polarity} onSelect={(polarity) => { const candidate = mappingCandidate(mapping.maskCandidates, maskSelectionId); if (candidate) setMaskBinding(candidate, polarity as ComfyUiMaskBinding['polarity']); setMappingMenu(null); }} /> : null}</> : null}</SettingsFormSection> : null}
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
  const title = props.activeTab === 'provider' ? t.common.provider : props.activeTab === 'comfyui' ? t.settings.comfyUi : t.settings.configuration;
  const right = props.activeTab === 'provider'
    ? <IconButton data-testid="providers-add-button" className="hdr-btn" quiet icon={<Icon name="settings" />} tooltip="Provider accounts" onClick={() => props.onOpenProviderAccounts('grsai')} />
    : props.activeTab === 'comfyui' && props.comfyUi.runtime
      ? <><IconButton data-testid="comfyui-refresh-workflow" className="hdr-btn" quiet icon={<Icon name="refresh" />} tooltip={t.common.refresh} onClick={() => { void props.comfyUi.refresh().catch(() => undefined); }} /><IconButton data-testid="comfyui-open-workflow" className="hdr-btn" quiet icon={<Icon name="arrow-right" />} tooltip="Open in ComfyUI" onClick={() => { void props.comfyUi.openInComfyUi().catch(() => undefined); }} /></>
      : undefined;
  return (
    <PageFrame watch="settings">
      <div className="settings-page">
      <PageHeader title={title} backLabel={t.common.back} backTestId="settings-back-button" onBack={props.onBack} right={right} />
      <SegmentedTabs className="settings-backend-segments" tabs={[{ id: 'provider', label: t.common.provider, testId: 'settings-backend-provider' }, { id: 'comfyui', label: t.settings.comfyUi, testId: 'settings-backend-comfyui' }, { id: 'general', label: t.settings.configuration, testId: 'settings-backend-general' }]} selectedId={props.activeTab} onSelect={(tab) => props.onSelectTab(tab as SettingsTab)} />
      <PageScroll>
        {props.activeTab === 'provider' ? <ProviderRoot onOpenAccounts={props.onOpenProviderAccounts} /> : null}
        {props.activeTab === 'general' ? <GeneralRoot onOpenGlobalSettings={props.onOpenGlobalSettings} onOpenPromptSettings={props.onOpenPromptSettings} /> : null}
        {props.activeTab === 'comfyui' ? <ComfyUiRoot controller={props.comfyUi} /> : null}
      </PageScroll>
      </div>
    </PageFrame>
  );
}
