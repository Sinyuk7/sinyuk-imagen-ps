import { useEffect, useState } from 'react';
import { StatusNotice } from './status-notice';
import { Icon } from './icons';
import { useI18n } from '../i18n/i18n-context';
import { TextField, FieldLabel, HelpText, Checkbox, Radio } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import type { NoticeState } from './notice';
import {
  createProviderEndpointDraft,
  sanitizeProviderDisplayName,
  sanitizeProviderEndpointUrl,
  sanitizeProviderSecretValue,
  type ProviderConnectionDraft,
  type ProviderEndpointDraft,
} from '../hooks/use-provider-settings';
import type { EndpointProbeResult } from '@imagen-ps/application';

type ProviderConnectionUpdater = (connection: ProviderConnectionDraft) => ProviderConnectionDraft;

interface ProviderProfileEditorProps {
  readonly connectionTitle: string;
  readonly aliasValue: string;
  readonly onAliasValue: (value: string) => void;
  readonly aliasError?: string | null;
  readonly aliasPlaceholder?: string;
  readonly connection: ProviderConnectionDraft;
  readonly onConnectionChange: (updater: ProviderConnectionUpdater) => void;
  readonly baseUrlPlaceholder?: string;
  readonly endpointErrors?: ReadonlyMap<string, string>;
  readonly probeResults?: ReadonlyMap<string, EndpointProbeResult>;
  readonly suggestedEndpointId?: string;
  readonly apiKeyValue: string;
  readonly onApiKeyValue: (value: string) => void;
  readonly apiKeyPlaceholder: string;
  readonly showKey: boolean;
  readonly onShowKeyChange: (shown: boolean) => void;
  readonly connectionStatus?: NoticeState | null;
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
    preferredEndpointId:
      connection.preferredEndpointId === endpointId
        ? endpoints.find((endpoint) => endpoint.enabled)?.id
        : connection.preferredEndpointId,
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
  const preferredStillEnabled = endpoints.some((endpoint) => endpoint.id === connection.preferredEndpointId && endpoint.enabled);
  return {
    ...connection,
    endpoints,
    preferredEndpointId:
      connection.selectionMode === 'manual'
        ? preferredStillEnabled
          ? connection.preferredEndpointId
          : endpoints.find((endpoint) => endpoint.enabled)?.id
        : undefined,
  };
}

function renderStatusNotice(notice: NoticeState) {
  const {
    key: _key,
    action: _action,
    priority: _priority,
    urgent: _urgent,
    ...props
  } = notice;
  return <StatusNotice {...props} />;
}

export function ProviderProfileEditor({
  connectionTitle,
  aliasValue,
  onAliasValue,
  aliasError = null,
  aliasPlaceholder,
  connection,
  onConnectionChange,
  baseUrlPlaceholder,
  endpointErrors,
  probeResults,
  suggestedEndpointId,
  apiKeyValue,
  onApiKeyValue,
  apiKeyPlaceholder,
  showKey,
  onShowKeyChange,
  connectionStatus = null,
  apiKeySaved = false,
  apiKeySavedHint = null,
  apiKeyRemovalPending = false,
  onApiKeyRemove,
  disabled = false,
}: ProviderProfileEditorProps) {
  const { messages: t } = useI18n();
  const [apiKeyEditing, setApiKeyEditing] = useState(false);
  const [preferredRadioName] = useState(() => (
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? `provider-preferred-endpoint-${crypto.randomUUID()}`
      : `provider-preferred-endpoint-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  ));
  const multiEndpoint = connection.endpoints.length > 1;

  useEffect(() => {
    setApiKeyEditing(!apiKeySaved || apiKeyValue.length > 0);
  }, [apiKeySaved]);

  const startApiKeyEdit = () => {
    setApiKeyEditing(true);
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
          <div className="settings-subsection-header">
            <div className="section-title settings-subsection-heading">{t.settings.requestAddresses}</div>
            <IconButton
              data-testid="provider-endpoint-add"
              className="settings-icon-button"
              compactSquare
              icon={<Icon name="add" size={16} />}
              tooltip={t.settings.addEndpoint}
              aria-label={t.settings.addEndpoint}
              disabled={disabled}
              onClick={() => onConnectionChange((current) => ({
                ...current,
                endpoints: [
                  ...current.endpoints,
                  createProviderEndpointDraft(),
                ],
              }))}
            />
          </div>
          <div className="field provider-endpoint-list">
            {connection.endpoints.map((endpoint, index) => {
              const probe = probeResults?.get(endpoint.id);
              const endpointError = endpointErrors?.get(endpoint.id);
              const isPreferred = connection.preferredEndpointId === endpoint.id;
              const isSuggested = suggestedEndpointId === endpoint.id;
              const canDelete = multiEndpoint;
              return (
                <div
                  key={endpoint.id}
                  data-testid={`provider-endpoint-row-${index}`}
                  className={`provider-endpoint-row${index > 0 ? ' provider-endpoint-row-spaced' : ''}`}
                >
                  <div className="provider-endpoint-header">
                    <div className="provider-endpoint-title-row">
                      {isPreferred ? (
                        <span
                          data-testid={`provider-endpoint-preferred-dot-${index}`}
                          className="provider-endpoint-preferred-dot"
                          role="img"
                          aria-label={t.settings.endpointPreferred}
                          title={t.settings.endpointPreferred}
                        />
                      ) : null}
                      <span className="provider-endpoint-label">{t.settings.endpointLabel(index + 1)}</span>
                      {isSuggested ? <span data-testid={`provider-endpoint-suggested-badge-${index}`} className="provider-endpoint-meta">{t.settings.endpointSuggested}</span> : null}
                      {probe ? <span className="provider-endpoint-meta">{probe.status}</span> : null}
                    </div>
                    <IconButton
                      data-testid={`provider-endpoint-remove-${index}`}
                      className="settings-icon-button danger"
                      compactSquare
                      icon={<Icon name="trash" size={16} />}
                      tooltip={t.common.delete}
                      aria-label={t.common.delete}
                      disabled={disabled || !canDelete}
                      onClick={() => onConnectionChange((current) => removeEndpoint(current, endpoint.id))}
                    />
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
                    {multiEndpoint && (
                      <Radio
                        data-testid={`provider-endpoint-preferred-${index}`}
                        name={preferredRadioName}
                        checked={isPreferred}
                        disabled={disabled || connection.selectionMode !== 'manual' || !endpoint.enabled}
                        onChecked={(checked) => {
                          if (!checked) {
                            return;
                          }
                          onConnectionChange((current) => ({
                            ...current,
                            preferredEndpointId: endpoint.id,
                          }));
                        }}
                      >
                        {t.settings.endpointPreferred}
                      </Radio>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {multiEndpoint && (
          <div className="field provider-connection-options">
            <Checkbox
              data-testid="provider-selection-mode-auto"
              className="provider-connection-option"
              checked={connection.selectionMode === 'auto'}
              disabled={disabled}
              onChecked={(checked) => onConnectionChange((current) => ({
                ...current,
                selectionMode: checked ? 'auto' : 'manual',
                preferredEndpointId: checked ? undefined : current.preferredEndpointId ?? current.endpoints.find((endpoint) => endpoint.enabled)?.id,
              }))}
            >
              {t.settings.autoSelect}
            </Checkbox>
            <Checkbox
              data-testid="provider-failover-enabled"
              className="provider-connection-option"
              checked={connection.failoverEnabled}
              disabled={disabled}
              onChecked={(checked) => onConnectionChange((current) => ({ ...current, failoverEnabled: checked }))}
            >
              {t.settings.failoverEnabled}
            </Checkbox>
          </div>
        )}
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
        {connectionStatus ? renderStatusNotice(connectionStatus) : null}
      </div>
    </div>
  );
}
