import { useEffect, useState, type ReactNode } from 'react';
import { Icon } from './icons';
import { useI18n } from '../i18n/i18n-context';
import { TextField, FieldLabel, HelpText, Checkbox } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import {
  createProviderEndpointDraft,
  sanitizeProviderDisplayName,
  sanitizeProviderEndpointUrl,
  sanitizeProviderSecretValue,
  type ProviderConnectionDraft,
  type ProviderEndpointDraft,
} from '../hooks/use-provider-settings';
import type { EndpointMeasurementResult } from '@imagen-ps/application';

type ProviderConnectionUpdater = (connection: ProviderConnectionDraft) => ProviderConnectionDraft;

interface ProviderProfileEditorProps {
  readonly connectionTitle: string;
  readonly aliasValue: string;
  readonly onAliasValue: (value: string) => void;
  readonly aliasError?: string | null;
  readonly aliasPlaceholder?: string;
  readonly apiFormatLabel?: string;
  readonly apiFormatDetail?: string | null;
  readonly apiFormatTone?: 'neutral' | 'positive' | 'negative' | 'warning';
  readonly detectInputValue?: string;
  readonly onDetectInputValue?: (value: string) => void;
  readonly detectInputPlaceholder?: string;
  readonly pathSettings?: ReactNode;
  readonly connection: ProviderConnectionDraft;
  readonly onConnectionChange: (updater: ProviderConnectionUpdater) => void;
  readonly baseUrlPlaceholder?: string;
  readonly endpointErrors?: ReadonlyMap<string, string>;
  readonly measurementResults?: ReadonlyMap<string, EndpointMeasurementResult>;
  readonly resolvedEndpointId?: string;
  readonly measurementBusy?: boolean;
  readonly measurementSupported?: boolean;
  readonly onMeasure?: () => void;
  readonly apiKeyValue: string;
  readonly onApiKeyValue: (value: string) => void;
  readonly apiKeyPlaceholder: string;
  readonly showKey: boolean;
  readonly onShowKeyChange: (shown: boolean) => void;
  readonly apiKeySaved?: boolean;
  readonly apiKeySavedHint?: string | null;
  readonly apiKeyRemovalPending?: boolean;
  readonly onApiKeyRemove?: () => void;
  readonly disabled?: boolean;
}

function removeEndpoint(
  connection: ProviderConnectionDraft,
  endpointId: string,
): ProviderConnectionDraft {
  const endpoints = connection.endpoints.filter((endpoint) => endpoint.id !== endpointId);
  return {
    ...connection,
    endpoints,
    selectedEndpointId:
      connection.selectedEndpointId === endpointId
        ? endpoints.find((endpoint) => endpoint.enabled)?.id
        : connection.selectedEndpointId,
  };
}

function updateEndpoint(
  connection: ProviderConnectionDraft,
  endpointId: string,
  updater: (endpoint: ProviderEndpointDraft) => ProviderEndpointDraft,
): ProviderConnectionDraft {
  const endpoints = connection.endpoints.map((endpoint) => (
    endpoint.id === endpointId ? updater(endpoint) : endpoint
  ));
  const selectedStillEnabled = endpoints.some((endpoint) => endpoint.id === connection.selectedEndpointId && endpoint.enabled);
  return {
    ...connection,
    endpoints,
    selectedEndpointId:
      connection.selectionMode === 'manual'
        ? selectedStillEnabled
          ? connection.selectedEndpointId
          : endpoints.find((endpoint) => endpoint.enabled)?.id
        : undefined,
  };
}

function isMinimallyValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function summarizeLatency(result: EndpointMeasurementResult | undefined, messages: ReturnType<typeof useI18n>['messages']): string | null {
  if (!result) {
    return null;
  }
  if (result.status === 'success') {
    return typeof result.latencyMs === 'number' ? `${result.latencyMs}ms` : 'OK';
  }
  if (result.failureKind === 'timeout') {
    return messages.settings.endpointTimeout;
  }
  if (result.failureKind === 'dns') {
    return messages.settings.endpointDns;
  }
  return messages.settings.endpointFailed;
}

export function ProviderProfileEditor({
  connectionTitle,
  aliasValue,
  onAliasValue,
  aliasError = null,
  aliasPlaceholder,
  apiFormatLabel,
  apiFormatDetail = null,
  apiFormatTone = 'neutral',
  detectInputValue,
  onDetectInputValue,
  detectInputPlaceholder,
  pathSettings,
  connection,
  onConnectionChange,
  baseUrlPlaceholder,
  endpointErrors,
  measurementResults,
  resolvedEndpointId,
  measurementBusy = false,
  measurementSupported = true,
  onMeasure,
  apiKeyValue,
  onApiKeyValue,
  apiKeyPlaceholder,
  showKey,
  onShowKeyChange,
  apiKeySaved = false,
  apiKeySavedHint = null,
  apiKeyRemovalPending = false,
  onApiKeyRemove,
  disabled = false,
}: ProviderProfileEditorProps) {
  const { messages: t } = useI18n();
  const [apiKeyEditing, setApiKeyEditing] = useState(false);
  const [hoveredEndpointId, setHoveredEndpointId] = useState<string | null>(null);
  const [draftEndpointVisible, setDraftEndpointVisible] = useState(false);
  const [draftEndpointUrl, setDraftEndpointUrl] = useState('');
  const [draftEndpointError, setDraftEndpointError] = useState<string | null>(null);
  const multiEndpoint = connection.endpoints.length > 1;

  useEffect(() => {
    setApiKeyEditing(!apiKeySaved || apiKeyValue.length > 0);
  }, [apiKeySaved, apiKeyValue.length]);

  const startApiKeyEdit = () => {
    setApiKeyEditing(true);
  };

  const commitDraftEndpoint = () => {
    const value = sanitizeProviderEndpointUrl(draftEndpointUrl);
    if (!value) {
      setDraftEndpointUrl('');
      setDraftEndpointError(null);
      setDraftEndpointVisible(false);
      return;
    }
    if (!isMinimallyValidUrl(value)) {
      setDraftEndpointError(t.settings.baseUrlHint);
      return;
    }
    if (connection.endpoints.some((endpoint) => endpoint.url === value)) {
      setDraftEndpointError(t.settings.duplicateEndpointUrl);
      return;
    }
    onConnectionChange((current) => ({
      ...current,
      endpoints: [...current.endpoints, createProviderEndpointDraft(value)],
    }));
    setDraftEndpointUrl('');
    setDraftEndpointError(null);
    setDraftEndpointVisible(false);
  };

  const apiKeyInputVisible = apiKeyEditing || apiKeyRemovalPending || !apiKeySaved;
  const showApiKeyToggle = apiKeyInputVisible && apiKeyValue.length > 0;

  return (
    <div className="settings-detail-layout">
      <div className="section">
        <div className="section-title settings-section-heading">{connectionTitle}</div>
        <div className="field">
          <FieldLabel htmlFor="provider-alias-input">{t.settings.alias}</FieldLabel>
          <TextField
            data-testid="provider-alias-input"
            id="provider-alias-input"
            className="field-input ui-field-control"
            placeholder={aliasPlaceholder}
            value={aliasValue}
            disabled={disabled}
            onValue={onAliasValue}
            onBlur={() => onAliasValue(sanitizeProviderDisplayName(aliasValue))}
          />
          {aliasError ? (
            <HelpText data-testid="provider-alias-error" className="field-hint" variant="negative">
              {aliasError}
            </HelpText>
          ) : null}
        </div>

        <div className="field">
          <FieldLabel htmlFor="provider-api-format-status">{t.settings.apiFormat}</FieldLabel>
          <div
            data-testid="provider-api-format-status"
            id="provider-api-format-status"
            className={`test-status test-status-${apiFormatTone === 'positive' ? 'positive' : apiFormatTone === 'negative' ? 'negative' : 'neutral'}`}
          >
            {apiFormatLabel ?? t.settings.apiFormatAuto}
          </div>
          {apiFormatDetail ? (
            <HelpText
              data-testid="provider-api-format-detail"
              className="field-hint"
              variant={apiFormatTone === 'negative' ? 'negative' : undefined}
            >
              {apiFormatDetail}
            </HelpText>
          ) : null}
        </div>

        {onDetectInputValue ? (
          <div className="field">
            <FieldLabel htmlFor="provider-endpoint-detect-input">{t.settings.endpointOrPath}</FieldLabel>
            <TextField
              data-testid="provider-endpoint-detect-input"
              id="provider-endpoint-detect-input"
              className="field-input mono ui-field-control"
              placeholder={detectInputPlaceholder ?? 'https://api.example.com/v1/chat/completions'}
              value={detectInputValue ?? ''}
              disabled={disabled}
              onValue={onDetectInputValue}
            />
            <HelpText className="field-hint">{t.settings.endpointOrPathHint}</HelpText>
          </div>
        ) : null}

        <div className="field">
          <div className="settings-subsection-header">
            <div className="section-title settings-subsection-heading">{t.settings.requestAddresses}</div>
            <div className="settings-field-header-actions">
              {measurementSupported !== false ? (
                <IconButton
                  data-testid="provider-speed-test-button"
                  className="settings-icon-button"
                  compactSquare
                  icon={measurementBusy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="network" size={16} />}
                  tooltip={measurementBusy ? t.settings.testingSpeed : t.settings.speedTest}
                  aria-label={measurementBusy ? t.settings.testingSpeed : t.settings.speedTest}
                  disabled={disabled || measurementBusy}
                  onClick={() => onMeasure?.()}
                />
              ) : null}
              <IconButton
                data-testid="provider-endpoint-add"
                className="settings-icon-button"
                compactSquare
                icon={<Icon name="add" size={16} />}
                tooltip={t.settings.addEndpoint}
                aria-label={t.settings.addEndpoint}
                disabled={disabled}
                onClick={() => {
                  setDraftEndpointVisible(true);
                  setDraftEndpointUrl('');
                  setDraftEndpointError(null);
                }}
              />
            </div>
          </div>

          <div className="field provider-endpoint-list">
            {connection.endpoints.map((endpoint, index) => {
              const measurement = measurementResults?.get(endpoint.id);
              const endpointError = endpointErrors?.get(endpoint.id);
              const isCurrent = connection.selectionMode === 'manual'
                ? connection.selectedEndpointId === endpoint.id
                : resolvedEndpointId === endpoint.id;
              const canDelete = multiEndpoint;
              const showDelete = hoveredEndpointId === endpoint.id && canDelete && !measurementBusy;
              const statusSummary = summarizeLatency(measurement, t);
              return (
                <div
                  key={endpoint.id}
                  data-testid={`provider-endpoint-row-${index}`}
                  className={`provider-endpoint-row${isCurrent ? ' provider-endpoint-row-current' : ''}${index > 0 ? ' provider-endpoint-row-spaced' : ''}${connection.selectionMode === 'auto' ? ' provider-endpoint-row-auto' : ''}`}
                  onMouseEnter={() => setHoveredEndpointId(endpoint.id)}
                  onMouseLeave={() => setHoveredEndpointId((current) => (current === endpoint.id ? null : current))}
                  onClick={(event) => {
                    if (connection.selectionMode !== 'manual' || disabled) {
                      return;
                    }
                    const target = event.target as HTMLElement;
                    if (target.closest('input,button,label')) {
                      return;
                    }
                    onConnectionChange((current) => ({ ...current, selectedEndpointId: endpoint.id }));
                  }}
                >
                  <div className="provider-endpoint-header">
                    <div className="provider-endpoint-title-row">
                      {isCurrent ? (
                        <span
                          data-testid={`provider-endpoint-current-dot-${index}`}
                          className="provider-endpoint-preferred-dot"
                          role="img"
                          aria-label={t.settings.endpointCurrent}
                          title={t.settings.endpointCurrent}
                        />
                      ) : null}
                      {isCurrent ? <span className="provider-endpoint-meta provider-endpoint-meta-current">{t.settings.endpointCurrent}</span> : null}
                      {showDelete ? (
                        <IconButton
                          data-testid={`provider-endpoint-remove-${index}`}
                          className="settings-icon-button danger provider-endpoint-remove"
                          compactSquare
                          icon={<Icon name="trash" size={16} />}
                          tooltip={t.common.delete}
                          aria-label={t.common.delete}
                          disabled={disabled || !canDelete}
                          onClick={() => onConnectionChange((current) => removeEndpoint(current, endpoint.id))}
                        />
                      ) : statusSummary ? (
                        <span
                          className={`provider-endpoint-meta${measurement?.status === 'failed' ? ' provider-endpoint-meta-failed' : ''}`}
                          title={measurement?.errorMessage ?? statusSummary}
                        >
                          {statusSummary}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <TextField
                    className="field-input mono ui-field-control provider-endpoint-input"
                    data-testid={`provider-endpoint-url-${index}`}
                    id={`provider-endpoint-url-${endpoint.id}`}
                    placeholder={baseUrlPlaceholder ?? t.settings.baseUrlHint}
                    value={endpoint.url}
                    disabled={disabled}
                    onValue={(value) => onConnectionChange((current) => updateEndpoint(current, endpoint.id, (endpointDraft) => ({ ...endpointDraft, url: sanitizeProviderEndpointUrl(value) })))}
                  />
                  {endpointError ? (
                    <HelpText data-testid={`provider-endpoint-error-${index}`} className="field-hint" variant="negative">
                      {endpointError}
                    </HelpText>
                  ) : null}
                  <div className="provider-endpoint-controls">
                    <Checkbox
                      data-testid={`provider-endpoint-enabled-${index}`}
                      checked={endpoint.enabled}
                      disabled={disabled}
                      onChecked={(checked) => onConnectionChange((current) => updateEndpoint(current, endpoint.id, (endpointDraft) => ({ ...endpointDraft, enabled: checked })))}
                    >
                      {t.settings.endpointEnabled}
                    </Checkbox>
                  </div>
                </div>
              );
            })}

            {draftEndpointVisible ? (
              <div className="provider-endpoint-row provider-endpoint-row-draft">
                <TextField
                  className="field-input mono ui-field-control provider-endpoint-input"
                  data-testid={`provider-endpoint-url-${connection.endpoints.length}`}
                  id="provider-endpoint-url-draft"
                  placeholder={baseUrlPlaceholder ?? t.settings.baseUrlHint}
                  value={draftEndpointUrl}
                  disabled={disabled}
                  onValue={(value) => {
                    setDraftEndpointUrl(sanitizeProviderEndpointUrl(value));
                    setDraftEndpointError(null);
                  }}
                  onBlur={commitDraftEndpoint}
                />
                {draftEndpointError ? (
                  <HelpText data-testid="provider-endpoint-error-draft" className="field-hint" variant="negative">
                    {draftEndpointError}
                  </HelpText>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="field provider-connection-options">
          <Checkbox
            data-testid="provider-selection-mode-auto"
            className="provider-connection-option"
            checked={connection.selectionMode === 'auto'}
            disabled={disabled}
            onChecked={(checked) => onConnectionChange((current) => ({
              ...current,
              selectionMode: checked ? 'auto' : 'manual',
              selectedEndpointId: checked ? undefined : current.selectedEndpointId ?? current.endpoints.find((endpoint) => endpoint.enabled)?.id,
            }))}
          >
            {t.settings.autoSelect}
          </Checkbox>
          {connection.selectionMode === 'auto' ? (
            <HelpText className="field-hint">{t.settings.autoSelectManaged}</HelpText>
          ) : null}
        </div>

        {pathSettings}

        <div className="field">
          <div className="settings-field-header">
            <FieldLabel htmlFor="provider-api-key-input">API Key</FieldLabel>
            <div className="settings-field-header-actions">
              {apiKeySaved && !apiKeyRemovalPending ? (
                <span data-testid="provider-api-key-saved-meta" className="settings-secret-meta-inline">
                  {apiKeySavedHint}
                </span>
              ) : null}
              {!apiKeyInputVisible && apiKeySaved ? (
                <IconButton
                  data-testid="provider-api-key-edit"
                  className="settings-icon-button"
                  compactSquare
                  icon={<Icon name="pencil" size={16} />}
                  tooltip={t.settings.editApiKey}
                  aria-label={t.settings.editApiKey}
                  disabled={disabled}
                  onClick={startApiKeyEdit}
                />
              ) : null}
              {apiKeySaved ? (
                <IconButton
                  data-testid="provider-api-key-remove"
                  className="settings-icon-button danger"
                  compactSquare
                  icon={<Icon name="trash" size={16} />}
                  tooltip={t.settings.removeSecret}
                  aria-label={t.settings.removeSecret}
                  disabled={disabled}
                  onClick={() => onApiKeyRemove?.()}
                />
              ) : null}
            </div>
          </div>
          {apiKeyInputVisible ? (
            <div className="field-input-affordance">
              <TextField
                data-testid="provider-api-key-input"
                id="provider-api-key-input"
                type={showKey ? 'text' : 'password'}
                className="field-input mono ui-field-control field-input-embedded"
                placeholder={apiKeySaved ? t.settings.apiKeyReplacePlaceholder : apiKeyPlaceholder}
                value={apiKeyValue}
                disabled={disabled}
                onValue={(value) => onApiKeyValue(sanitizeProviderSecretValue(value))}
              />
              {showApiKeyToggle ? (
                <IconButton
                  data-testid="provider-api-key-toggle"
                  className="field-input-action"
                  compactSquare
                  icon={<Icon name={showKey ? 'eye-off' : 'eye'} size={14} />}
                  tooltip={showKey ? t.settings.hideApiKey : t.settings.showApiKey}
                  aria-label={showKey ? t.settings.hideApiKey : t.settings.showApiKey}
                  onClick={() => onShowKeyChange(!showKey)}
                />
              ) : null}
            </div>
          ) : null}
          {apiKeyRemovalPending ? (
            <HelpText data-testid="provider-api-key-removal-pending" className="field-hint" variant="negative">
              {t.settings.secretRemovalPending}
            </HelpText>
          ) : null}
        </div>
      </div>
    </div>
  );
}
