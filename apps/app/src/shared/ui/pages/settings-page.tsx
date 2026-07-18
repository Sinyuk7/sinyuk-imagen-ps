import { useEffect, useMemo, useRef, useState } from 'react';
import type { ApiFormat, ComfyUiWorkflowReadiness, ProviderProfile } from '@imagen-ps/application';
import type { AppGenerationSettings } from '../../ports/app-generation-settings';
import type { ModelGenerationSettingsController } from '../hooks/use-model-generation-settings';
import { profileToProviderRow } from '../../domain/mappers';
import { useAppServices } from '../../ports/app-services-context';
import { Icon } from '../components/icons';
import { SettingsListRow } from '../components/settings-list-row';
import { IconButton } from '../primitives/icon-button';
import { ActionButton, FieldLabel, HelpText } from '../primitives/native-controls';
import { useI18n } from '../i18n/i18n-context';
import { configurationInstanceLabel, modelInfoFromProfileItem } from '../model-info';
import type { ComfyUiManagementController } from '../hooks/use-comfyui-management';
import { TextSelect } from '../components/text-select';
import { StatusNotice } from '../components/status-notice';
import { useToast } from '../components/toast-host';

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
  readonly selectedProviderTarget?: { readonly profileId: string; readonly modelId?: string };
  readonly onOpenComfyUiConnection: (connectionId: string) => void;
  readonly onAddComfyUiConnection: () => void;
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
  selectedProviderTarget,
  onOpenComfyUiConnection,
  onAddComfyUiConnection,
}: SettingsPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const { show } = useToast();
  const [modelLabels, setModelLabels] = useState<ReadonlyMap<string, string>>(new Map());
  const [workflowMenuOpen, setWorkflowMenuOpen] = useState(false);
  const sequenceRef = useRef(0);

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
  const selectedWorkflowId = comfyUi.selection?.kind === 'comfyui' ? comfyUi.selection.workflowId : '';
  const selectedWorkflow = comfyUi.workflows.find((workflow) => workflow.workflowId === selectedWorkflowId);
  const readinessLabel = (value: ComfyUiWorkflowReadiness | undefined): string => {
    if (value?.status === 'ready') {
      return t.common.ready;
    }
    if (value?.reason === 'bridge') {
      return t.settings.comfyUiReadinessBridge;
    }
    if (value?.reason === 'workflow') {
      return t.settings.comfyUiReadinessWorkflow;
    }
    return t.common.needsSetup;
  };
  const workflowOptions = comfyUi.workflows.map((workflow) => {
    const connection = comfyUi.connections.find((item) => item.connectionId === workflow.connectionId);
    return {
      id: workflow.workflowId,
      label: workflow.displayName,
      description: connection?.displayName,
      badges: [
        workflow.source.kind === 'api-graph' ? t.settings.comfyUiApiGraph : t.settings.comfyUiFrontend,
        readinessLabel(comfyUi.readiness.get(workflow.workflowId)),
      ],
    };
  });

  const run = (action: Promise<unknown>, key: string): void => {
    void action.catch((actionError) => {
      show(actionError instanceof Error ? actionError.message : String(actionError), 'negative', {
        key,
        durationMs: null,
        copyable: true,
      });
    });
  };

  return (
    <div className="page page-enter" onClick={() => setWorkflowMenuOpen(false)}>
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
        {comfyUi.backendMode === 'provider' ? (
          <IconButton
            data-testid="providers-help-button"
            className="hdr-btn"
            quiet
            icon={<Icon name="question" />}
            tooltip={t.settings.onboardingHelp}
            onClick={onOpenOnboarding}
          />
        ) : null}
        <IconButton
          data-testid="providers-add-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="add" />}
          tooltip={comfyUi.backendMode === 'provider' ? t.common.addProvider : t.settings.comfyUiAddConnection}
          placement="bottom"
          onClick={comfyUi.backendMode === 'provider'
            ? () => onNav('settings-add')
            : onAddComfyUiConnection}
        />
      </header>
      <div className="filter-bar settings-backend-segments" role="group" aria-label={t.settings.generationBackend}>
        <ActionButton
          data-testid="settings-backend-provider"
          className="fchip"
          quiet
          selected={comfyUi.backendMode === 'provider'}
          onClick={() => run(comfyUi.selectBackend('provider', selectedProviderTarget), 'settings-backend-provider')}
        >
          {t.common.provider}
        </ActionButton>
        <ActionButton
          data-testid="settings-backend-comfyui"
          className="fchip"
          quiet
          selected={comfyUi.backendMode === 'comfyui'}
          onClick={() => run(comfyUi.selectBackend('comfyui'), 'settings-backend-comfyui')}
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
        {comfyUi.backendMode === 'provider' ? (
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
        ) : (
          <>
            <section className="section settings-page comfyui-target-section">
              <div className="field">
                <FieldLabel htmlFor="comfyui-workflow-target-trigger">{t.settings.comfyUiWorkflowTarget}</FieldLabel>
                <TextSelect
                  testId="comfyui-workflow-target-selector"
                  triggerId="comfyui-workflow-target-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-compact"
                  label={t.settings.comfyUiWorkflowTarget}
                  value={selectedWorkflow?.displayName ?? t.settings.comfyUiSelectWorkflow}
                  disabled={comfyUi.loading || comfyUi.workflows.length === 0}
                  open={workflowMenuOpen}
                  onOpenChange={setWorkflowMenuOpen}
                  options={workflowOptions}
                  selectedId={selectedWorkflowId}
                  isOptionSelectable={(workflowId) => comfyUi.readiness.get(workflowId)?.status === 'ready'}
                  onSelect={(workflowId) => {
                    const workflowReadiness = comfyUi.readiness.get(workflowId);
                    if (workflowReadiness?.status !== 'ready') {
                      show(readinessLabel(workflowReadiness), 'warning', { key: `comfyui-workflow-not-ready:${workflowId}` });
                      return;
                    }
                    run(comfyUi.selectWorkflow(workflowId), `comfyui-workflow-select:${workflowId}`);
                  }}
                />
                {selectedWorkflow ? (
                  <HelpText className="field-hint" data-testid="comfyui-selected-workflow-readiness">
                    {readinessLabel(comfyUi.readiness.get(selectedWorkflow.workflowId))}
                  </HelpText>
                ) : null}
              </div>
            </section>
            <div className="sec-lbl">{t.settings.comfyUiConnections}</div>
            {comfyUi.loading && (
              <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.loading}</div>
            )}
            {comfyUi.error ? (
              <div className="comfyui-settings-notice">
                <StatusNotice tone="negative" message={t.settings.comfyUiLoadFailed} detail={comfyUi.error} copyText={comfyUi.error} />
              </div>
            ) : null}
            {!comfyUi.loading && comfyUi.connections.length === 0 ? (
              <div style={{ padding: 16, color: 'var(--app-color-text-muted)', fontSize: 12 }}>{t.settings.comfyUiNoConnections}</div>
            ) : null}
            {comfyUi.connections.map((connection) => {
              const connectionReady = connection.lastTest?.api === 'ready';
              return (
                <SettingsListRow
                  key={connection.connectionId}
                  testId={`comfyui-connection-row-${connection.connectionId}`}
                  watch={`${connection.connectionId}:${connection.lastTest?.checkedAt ?? ''}`}
                  title={connection.displayName}
                  leading={(
                    <div className="prov-ico" style={{ background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-informative)' }}>
                      <Icon name="plug" size={14} />
                    </div>
                  )}
                  meta={<span className="prov-summary-mono">{connection.origin}</span>}
                  end={(
                    <div className={`prov-readiness ${connectionReady ? 'ready' : 'warning'}`} aria-label={connectionReady ? t.common.ready : t.common.needsSetup}>
                      <span className="prov-readiness-dot" aria-hidden="true" />
                      <span className="prov-status-text">{connectionReady ? t.common.ready : t.common.needsSetup}</span>
                    </div>
                  )}
                  onOpen={() => onOpenComfyUiConnection(connection.connectionId)}
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
