import { useEffect, useRef, useState, type MouseEvent } from 'react';
import type {
  ComfyUiConnection,
  ComfyUiDiscoveredWorkflow,
  ComfyUiWorkflowReadiness,
} from '@imagen-ps/application';
import { Icon } from '../components/icons';
import { SettingsListRow } from '../components/settings-list-row';
import { StatusNotice } from '../components/status-notice';
import { useToast } from '../components/toast-host';
import { UxpTextAreaField } from '../components/uxp-form-controls';
import type { ComfyUiManagementController } from '../hooks/use-comfyui-management';
import { useI18n } from '../i18n/i18n-context';
import { IconButton } from '../primitives/icon-button';
import { Button, FieldLabel, HelpText, TextField } from '../primitives/native-controls';

interface ComfyUiConnectionPageProps {
  readonly connectionId: string | null;
  readonly controller: ComfyUiManagementController;
  readonly onBack: () => void;
  readonly onConnectionSaved: (connectionId: string) => void;
}

type WorkflowEditorMode = 'api' | 'frontend' | null;

let entitySequence = 0;

function createEntityId(prefix: 'connection' | 'workflow'): string {
  entitySequence += 1;
  return `${prefix}-${Date.now().toString(36)}-${entitySequence.toString(36)}`;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function ComfyUiConnectionPage({
  connectionId,
  controller,
  onBack,
  onConnectionSaved,
}: ComfyUiConnectionPageProps) {
  const { messages: t } = useI18n();
  const { show } = useToast();
  const generatedConnectionIdRef = useRef(createEntityId('connection'));
  const apiWorkflowIdRef = useRef(createEntityId('workflow'));
  const connection = connectionId
    ? controller.connections.find((item) => item.connectionId === connectionId)
    : undefined;
  const effectiveConnectionId = connectionId ?? generatedConnectionIdRef.current;
  const [displayName, setDisplayName] = useState('');
  const [origin, setOrigin] = useState('');
  const [requestTimeoutMs, setRequestTimeoutMs] = useState('30000');
  const [configureTimeoutMs, setConfigureTimeoutMs] = useState('30000');
  const [observationTimeoutMs, setObservationTimeoutMs] = useState('300000');
  const [mode, setMode] = useState<WorkflowEditorMode>(null);
  const [apiDisplayName, setApiDisplayName] = useState('');
  const [apiGraphJson, setApiGraphJson] = useState('');
  const [discovered, setDiscovered] = useState<readonly ComfyUiDiscoveredWorkflow[]>([]);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [testEvidence, setTestEvidence] = useState<ComfyUiConnection['lastTest']>();

  useEffect(() => {
    if (!connection) {
      return;
    }
    setDisplayName(connection.displayName);
    setOrigin(connection.origin);
    setRequestTimeoutMs(String(connection.requestTimeoutMs));
    setConfigureTimeoutMs(String(connection.configureTimeoutMs));
    setObservationTimeoutMs(String(connection.observationTimeoutMs));
    setTestEvidence(connection.lastTest);
  }, [connection]);

  const workflows = controller.workflows.filter((workflow) => workflow.connectionId === effectiveConnectionId);
  const savedRemotePaths = new Set(workflows.flatMap((workflow) => (
    workflow.source.kind === 'frontend-workflow' ? [workflow.source.remotePath] : []
  )));

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

  const report = (error: unknown, key: string): void => {
    const message = messageOf(error);
    setOperationError(message);
    show(message, 'negative', { key, durationMs: null, copyable: true });
  };

  const saveConnection = async (): Promise<void> => {
    setOperationError(null);
    try {
      const saved = await controller.saveConnection({
        connectionId: effectiveConnectionId,
        displayName,
        origin,
        requestTimeoutMs: Number(requestTimeoutMs),
        configureTimeoutMs: Number(configureTimeoutMs),
        observationTimeoutMs: Number(observationTimeoutMs),
      });
      onConnectionSaved(saved.connectionId);
      show(t.settings.comfyUiConnectionSaved, 'positive', { key: 'comfyui-connection-saved' });
    } catch (error) {
      report(error, 'comfyui-connection-save-error');
    }
  };

  const removeConnection = async (): Promise<void> => {
    if (!connection) {
      return;
    }
    try {
      await controller.deleteConnection(connection.connectionId);
      onBack();
    } catch (error) {
      report(error, 'comfyui-connection-delete-error');
    }
  };

  const testConnection = async (): Promise<void> => {
    if (!connection) {
      return;
    }
    try {
      const evidence = await controller.testConnection(connection.connectionId);
      setTestEvidence(evidence);
      show(evidence.api === 'ready' ? t.settings.comfyUiTestReady : t.settings.comfyUiTestUnavailable, evidence.api === 'ready' ? 'positive' : 'warning', {
        key: 'comfyui-connection-test-result',
      });
    } catch (error) {
      report(error, 'comfyui-connection-test-error');
    }
  };

  const importApiGraph = async (): Promise<void> => {
    if (!connection) {
      return;
    }
    try {
      await controller.importApiGraphJson({
        workflowId: apiWorkflowIdRef.current,
        displayName: apiDisplayName,
        connectionId: connection.connectionId,
        json: apiGraphJson,
      });
      apiWorkflowIdRef.current = createEntityId('workflow');
      setApiDisplayName('');
      setApiGraphJson('');
      setMode(null);
      show(t.settings.comfyUiWorkflowSaved, 'positive', { key: 'comfyui-api-workflow-saved' });
    } catch (error) {
      report(error, 'comfyui-api-import-error');
    }
  };

  const discoverWorkflows = async (): Promise<void> => {
    if (!connection) {
      return;
    }
    setMode('frontend');
    try {
      setDiscovered(await controller.discoverFrontendWorkflows(connection.connectionId));
    } catch (error) {
      report(error, 'comfyui-frontend-discovery-error');
    }
  };

  const saveDiscoveredWorkflow = async (workflow: ComfyUiDiscoveredWorkflow): Promise<void> => {
    if (!connection || savedRemotePaths.has(workflow.remotePath)) {
      return;
    }
    try {
      await controller.saveFrontendWorkflow({
        workflowId: createEntityId('workflow'),
        displayName: workflow.displayName,
        connectionId: connection.connectionId,
        remotePath: workflow.remotePath,
        contract: workflow.contract,
      });
      show(t.settings.comfyUiWorkflowSaved, 'positive', { key: `comfyui-frontend-workflow-saved:${workflow.remotePath}` });
    } catch (error) {
      report(error, 'comfyui-frontend-save-error');
    }
  };

  const removeWorkflow = async (event: MouseEvent<HTMLElement>, workflowId: string): Promise<void> => {
    event.stopPropagation();
    try {
      await controller.deleteWorkflow(workflowId);
    } catch (error) {
      report(error, `comfyui-workflow-delete-error:${workflowId}`);
    }
  };

  const selectWorkflow = async (workflowId: string): Promise<void> => {
    const readiness = controller.readiness.get(workflowId);
    if (readiness?.status !== 'ready') {
      show(readinessLabel(readiness), 'warning', { key: `comfyui-workflow-not-ready:${workflowId}` });
      return;
    }
    try {
      await controller.selectWorkflow(workflowId);
    } catch (error) {
      report(error, `comfyui-workflow-select-error:${workflowId}`);
    }
  };

  if (connectionId && !connection && controller.loading) {
    return (
      <div className="page page-enter settings-page">
        <header className="hdr">
          <IconButton className="hdr-btn" quiet icon={<Icon name="chevron-left" />} tooltip={t.common.back} onClick={onBack} />
          <div className="hdr-title">{t.settings.comfyUiConnection}</div>
          <div style={{ width: 28 }} />
        </header>
        <div className="scroll"><div className="settings-empty-state">{t.settings.loading}</div></div>
      </div>
    );
  }

  return (
    <div className="page page-enter settings-page comfyui-connection-page">
      <header className="hdr">
        <IconButton
          data-testid="comfyui-connection-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={onBack}
        />
        <div className="hdr-title">{connection?.displayName || t.settings.comfyUiConnection}</div>
        {connection ? (
          <IconButton
            data-testid="comfyui-connection-delete-button"
            className="hdr-btn"
            hostClassName="hdr-btn-danger"
            quiet
            icon={<Icon name="trash" />}
            tooltip={t.common.delete}
            disabled={controller.busy}
            onClick={() => void removeConnection()}
          />
        ) : <div style={{ width: 28 }} />}
      </header>

      <div className="scroll scroll-footer-pad">
        <div className="settings-detail-layout">
          <section className="section generation-settings-section">
            <div className="field">
              <FieldLabel htmlFor="comfyui-connection-name">{t.settings.comfyUiConnectionName}</FieldLabel>
              <TextField
                id="comfyui-connection-name"
                data-testid="comfyui-connection-name"
                className="field-input"
                value={displayName}
                onValue={setDisplayName}
                disabled={controller.busy}
              />
            </div>
            <div className="field">
              <FieldLabel htmlFor="comfyui-connection-origin">{t.settings.comfyUiOrigin}</FieldLabel>
              <TextField
                id="comfyui-connection-origin"
                data-testid="comfyui-connection-origin"
                className="field-input"
                type="url"
                value={origin}
                onValue={setOrigin}
                disabled={controller.busy}
              />
            </div>
          </section>

          <section className="section generation-settings-section">
            <div className="comfyui-timeout-grid">
              <div className="field">
                <FieldLabel htmlFor="comfyui-request-timeout">{t.settings.comfyUiRequestTimeout}</FieldLabel>
                <TextField id="comfyui-request-timeout" data-testid="comfyui-request-timeout" className="field-input" value={requestTimeoutMs} onValue={setRequestTimeoutMs} disabled={controller.busy} />
              </div>
              <div className="field">
                <FieldLabel htmlFor="comfyui-configure-timeout">{t.settings.comfyUiConfigureTimeout}</FieldLabel>
                <TextField id="comfyui-configure-timeout" data-testid="comfyui-configure-timeout" className="field-input" value={configureTimeoutMs} onValue={setConfigureTimeoutMs} disabled={controller.busy} />
              </div>
              <div className="field">
                <FieldLabel htmlFor="comfyui-observation-timeout">{t.settings.comfyUiObservationTimeout}</FieldLabel>
                <TextField id="comfyui-observation-timeout" data-testid="comfyui-observation-timeout" className="field-input" value={observationTimeoutMs} onValue={setObservationTimeoutMs} disabled={controller.busy} />
              </div>
            </div>
            <div className="settings-action-row comfyui-connection-actions">
              <Button
                data-testid="comfyui-test-connection-button"
                disabled={!connection || controller.busy}
                onClick={() => void testConnection()}
              >
                {controller.busy ? t.settings.comfyUiWorking : t.settings.testConnection}
              </Button>
              {testEvidence ? (
                <span data-testid="comfyui-connection-test-status" className={`test-status ${testEvidence.api === 'ready' ? 'test-status-positive' : 'test-status-negative'}`}>
                  {testEvidence.api === 'ready' ? t.settings.comfyUiTestReady : t.settings.comfyUiTestUnavailable}
                </span>
              ) : null}
            </div>
          </section>

          {connection ? (
            <section className="section generation-settings-section comfyui-workflow-section">
              <div className="settings-section-header">
                <div className="section-title settings-section-heading">{t.settings.comfyUiWorkflows}</div>
                <div className="settings-section-header-actions">
                  <IconButton
                    data-testid="comfyui-api-import-open-button"
                    variant="secondary"
                    className="settings-inline-icon-command"
                    icon={<Icon name="upload" size={14} />}
                    text={t.settings.comfyUiImportApiGraph}
                    tooltip={t.settings.comfyUiImportApiGraph}
                    disabled={controller.busy}
                    onClick={() => setMode(mode === 'api' ? null : 'api')}
                  />
                  <IconButton
                    data-testid="comfyui-frontend-discover-button"
                    variant="secondary"
                    className="settings-inline-icon-command"
                    icon={<Icon name="refresh" size={14} />}
                    text={t.settings.comfyUiDiscoverFrontend}
                    tooltip={t.settings.comfyUiDiscoverFrontend}
                    disabled={controller.busy}
                    onClick={() => void discoverWorkflows()}
                  />
                </div>
              </div>

              {mode === 'api' ? (
                <div className="comfyui-workflow-editor" data-testid="comfyui-api-import-panel">
                  <div className="field">
                    <FieldLabel htmlFor="comfyui-api-workflow-name">{t.settings.comfyUiWorkflowName}</FieldLabel>
                    <TextField id="comfyui-api-workflow-name" data-testid="comfyui-api-workflow-name" className="field-input" value={apiDisplayName} onValue={setApiDisplayName} disabled={controller.busy} />
                  </div>
                  <div className="field field-textarea">
                    <FieldLabel htmlFor="comfyui-api-graph-json">{t.settings.comfyUiApiGraphJson}</FieldLabel>
                    <UxpTextAreaField
                      id="comfyui-api-graph-json"
                      data-testid="comfyui-api-graph-json"
                      className="field-textarea-input comfyui-api-json-input"
                      value={apiGraphJson}
                      onValue={setApiGraphJson}
                      disabled={controller.busy}
                    />
                  </div>
                  <div className="settings-action-row comfyui-editor-actions">
                    <Button onClick={() => setMode(null)} disabled={controller.busy}>{t.common.cancel}</Button>
                    <Button data-testid="comfyui-api-import-button" variant="accent" onClick={() => void importApiGraph()} disabled={controller.busy || !apiDisplayName.trim() || !apiGraphJson.trim()}>
                      {t.settings.comfyUiImport}
                    </Button>
                  </div>
                </div>
              ) : null}

              {mode === 'frontend' ? (
                <div className="comfyui-workflow-editor" data-testid="comfyui-frontend-discovery-panel">
                  {discovered.length === 0 ? <HelpText className="field-hint">{t.settings.comfyUiNoDiscoveredWorkflows}</HelpText> : null}
                  {discovered.map((workflow) => {
                    const saved = savedRemotePaths.has(workflow.remotePath);
                    return (
                      <SettingsListRow
                        key={workflow.remotePath}
                        testId={`comfyui-discovered-workflow-${workflow.remotePath}`}
                        title={workflow.displayName}
                        leading={(
                          <div className="prov-ico" style={{ background: 'var(--app-color-background-layer-2)', color: 'var(--app-color-informative)' }}>
                            <Icon name="network" size={14} />
                          </div>
                        )}
                        meta={<span className="prov-summary-mono">{workflow.remotePath}</span>}
                        end={saved ? <span className="prov-status-text">{t.settings.saved}</span> : undefined}
                        disabled={saved}
                        onOpen={() => void saveDiscoveredWorkflow(workflow)}
                      />
                    );
                  })}
                </div>
              ) : null}

              {workflows.length === 0 && mode === null ? (
                <div className="settings-empty-state">{t.settings.comfyUiNoWorkflows}</div>
              ) : null}
              {workflows.map((workflow) => {
                const readiness = controller.readiness.get(workflow.workflowId);
                const ready = readiness?.status === 'ready';
                const selected = controller.selection?.kind === 'comfyui' && controller.selection.workflowId === workflow.workflowId;
                return (
                  <SettingsListRow
                    key={workflow.workflowId}
                    testId={`comfyui-workflow-row-${workflow.workflowId}`}
                    watch={`${workflow.workflowId}:${ready}:${selected}`}
                    title={workflow.displayName}
                    leading={(
                      <div className="prov-ico" style={{ background: 'var(--app-color-background-layer-2)', color: ready ? 'var(--app-color-positive)' : 'var(--app-color-notice)' }}>
                        <Icon name={workflow.source.kind === 'api-graph' ? 'algorithm' : 'network'} size={14} />
                      </div>
                    )}
                    meta={(
                      <>
                        <span className="prov-model">{workflow.source.kind === 'api-graph' ? t.settings.comfyUiApiGraph : t.settings.comfyUiFrontend}</span>
                        {workflow.source.kind === 'frontend-workflow' ? (
                          <><span className="prov-meta-sep">·</span><span className="prov-family">{workflow.source.remotePath}</span></>
                        ) : null}
                      </>
                    )}
                    end={(
                      <div className="comfyui-workflow-row-actions">
                        <div className={`prov-readiness ${ready ? 'ready' : 'warning'}`} aria-label={readinessLabel(readiness)}>
                          <span className="prov-readiness-dot" aria-hidden="true" />
                          <span className="prov-status-text">{selected ? t.settings.comfyUiSelected : readinessLabel(readiness)}</span>
                        </div>
                        <IconButton
                          data-testid={`comfyui-workflow-delete-${workflow.workflowId}`}
                          className="settings-icon-button danger"
                          compactSquare
                          icon={<Icon name="trash" size={14} />}
                          tooltip={t.common.delete}
                          disabled={controller.busy}
                          onClick={(event) => void removeWorkflow(event, workflow.workflowId)}
                        />
                      </div>
                    )}
                    onOpen={() => void selectWorkflow(workflow.workflowId)}
                  />
                );
              })}
            </section>
          ) : null}

          {operationError || controller.error ? (
            <section className="section generation-settings-section">
              <StatusNotice
                tone="negative"
                message={t.settings.comfyUiOperationFailed}
                detail={operationError ?? controller.error}
                copyText={operationError ?? controller.error ?? undefined}
              />
            </section>
          ) : null}
        </div>
      </div>

      <footer className="det-footer">
        <div className="settings-detail-footer-inner">
          <div className="settings-detail-footer-help">
            {connection?.lastTest?.checkedAt ? t.settings.comfyUiLastTested : ''}
          </div>
          <Button
            data-testid="comfyui-connection-save-button"
            className="btn-save"
            variant="accent"
            disabled={controller.busy || !displayName.trim() || !origin.trim()}
            onClick={() => void saveConnection()}
          >
            {controller.busy ? t.settings.saving : t.common.save}
          </Button>
        </div>
      </footer>
    </div>
  );
}
