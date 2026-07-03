import type { ReactNode } from 'react';
import { StatusNotice } from './status-notice';
import { Icon } from './icons';
import { useI18n } from '../i18n/i18n-context';
import { Button, TextField, FieldLabel, HelpText, Divider, Checkbox } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import type { NoticeState } from './notice';
import {
  sanitizeProviderDisplayName,
  sanitizeProviderEndpointUrl,
  sanitizeProviderSecretValue,
  type ProviderConnectionDraft,
  type ProviderEndpointDraft,
} from '../hooks/use-provider-settings';
import type { EndpointProbeResult } from '@imagen-ps/application';

interface ProviderProfileEditorProps {
  readonly connectionTitle: string;
  readonly aliasValue: string;
  readonly onAliasValue: (value: string) => void;
  readonly aliasError?: string | null;
  readonly aliasPlaceholder?: string;
  readonly connection: ProviderConnectionDraft;
  readonly onConnectionChange: (connection: ProviderConnectionDraft) => void;
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
  readonly extraSections?: ReactNode;
  readonly defaultModelSection?: ReactNode;
  readonly testBusy: boolean;
  readonly onTest: () => void;
  readonly testMeta?: string | null;
  readonly testStatus?: NoticeState | null;
  readonly apiKeySaved?: boolean;
  readonly apiKeySavedHint?: string | null;
  readonly apiKeyRemovalPending?: boolean;
  readonly onApiKeyReplace?: () => void;
  readonly onApiKeyRemove?: () => void;
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
  extraSections,
  defaultModelSection,
  testBusy,
  onTest,
  testMeta = null,
  testStatus = null,
  apiKeySaved = false,
  apiKeySavedHint = null,
  apiKeyRemovalPending = false,
  onApiKeyReplace,
  onApiKeyRemove,
}: ProviderProfileEditorProps) {
  const { messages: t } = useI18n();

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
          <div className="section-title settings-subsection-heading">{t.settings.requestAddresses}</div>
          <div className="field provider-endpoint-list">
            {connection.endpoints.map((endpoint, index) => {
              const probe = probeResults?.get(endpoint.id);
              const endpointError = endpointErrors?.get(endpoint.id);
              const isPreferred = connection.preferredEndpointId === endpoint.id;
              const isSuggested = suggestedEndpointId === endpoint.id;
              const canDelete = connection.endpoints.length > 1;
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
                      className="provider-endpoint-remove"
                      quiet
                      disabled={!canDelete}
                      icon={<Icon name="trash" />}
                      tooltip={t.common.delete}
                      onClick={() => onConnectionChange(removeEndpoint(connection, endpoint.id))}
                    />
                  </div>
                  <TextField
                    className="field-input mono ui-field-control provider-endpoint-input"
                    data-testid={`provider-endpoint-url-${index}`}
                    id={`provider-endpoint-url-${endpoint.id}`}
                    placeholder={baseUrlPlaceholder}
                    value={endpoint.url}
                    onValue={(value) => onConnectionChange(updateEndpoint(connection, endpoint.id, (current) => ({ ...current, url: sanitizeProviderEndpointUrl(value) })))}
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
                      onChecked={(checked) => onConnectionChange(updateEndpoint(connection, endpoint.id, (current) => ({ ...current, enabled: checked })))}
                    >
                      {t.settings.endpointEnabled}
                    </Checkbox>
                    <Checkbox
                      data-testid={`provider-endpoint-preferred-${index}`}
                      checked={isPreferred}
                      disabled={connection.selectionMode !== 'manual' || !endpoint.enabled}
                      onChecked={(checked) => onConnectionChange({
                        ...connection,
                        preferredEndpointId: checked ? endpoint.id : connection.preferredEndpointId,
                      })}
                    >
                      {t.settings.endpointPreferred}
                    </Checkbox>
                  </div>
                </div>
              );
            })}
            <Button
              data-testid="provider-endpoint-add"
              className="provider-endpoint-add"
              variant="secondary"
              onClick={() => onConnectionChange({
                ...connection,
                endpoints: [
                  ...connection.endpoints,
                  {
                    id: typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                      ? `endpoint-${crypto.randomUUID()}`
                      : `endpoint-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                    url: '',
                    enabled: true,
                  },
                ],
              })}
            >
              {t.settings.addEndpoint}
            </Button>
          </div>
          <HelpText className="field-hint">{t.settings.baseUrlHint}</HelpText>
        </div>
        <div className="field provider-connection-options">
          <Checkbox
            data-testid="provider-selection-mode-auto"
            className="provider-connection-option"
            checked={connection.selectionMode === 'auto'}
            onChecked={(checked) => onConnectionChange({
              ...connection,
              selectionMode: checked ? 'auto' : 'manual',
              preferredEndpointId: checked ? undefined : connection.preferredEndpointId ?? connection.endpoints.find((endpoint) => endpoint.enabled)?.id,
            })}
          >
            {t.settings.autoSelect}
          </Checkbox>
          <Checkbox
            data-testid="provider-failover-enabled"
            className="provider-connection-option"
            checked={connection.failoverEnabled}
            onChecked={(checked) => onConnectionChange({ ...connection, failoverEnabled: checked })}
          >
            {t.settings.failoverEnabled}
          </Checkbox>
        </div>
        <div className="field">
          <FieldLabel htmlFor="provider-api-key-input">API Key</FieldLabel>
          {apiKeySaved && apiKeySavedHint && !apiKeyRemovalPending ? (
            <div data-testid="provider-api-key-saved-meta" className="settings-secret-meta">
              {apiKeySavedHint}
            </div>
          ) : null}
          {apiKeySaved && !apiKeyRemovalPending ? (
            <div className="settings-secret-actions">
              <Button data-testid="provider-api-key-replace" className="settings-secret-action" variant="secondary" onClick={onApiKeyReplace}>
                {t.settings.replaceSecret}
              </Button>
              <Button data-testid="provider-api-key-remove" className="settings-secret-action" variant="secondary" onClick={onApiKeyRemove}>
                {t.settings.removeSecret}
              </Button>
            </div>
          ) : null}
          <div className="field-input-affordance">
            <TextField
              data-testid="provider-api-key-input"
              id="provider-api-key-input"
              type={showKey ? 'text' : 'password'}
              className="field-input mono ui-field-control field-input-embedded"
              placeholder={apiKeySaved && !apiKeyValue ? t.settings.apiKeyReplacePlaceholder : apiKeyPlaceholder}
              value={apiKeyValue}
              onValue={(value) => onApiKeyValue(sanitizeProviderSecretValue(value))}
            />
            <IconButton
              data-testid="provider-api-key-toggle"
              className="field-input-action"
              quiet
              icon={<Icon name={showKey ? 'eye-off' : 'eye'} />}
              tooltip={showKey ? t.settings.hideApiKey : t.settings.showApiKey}
              onClick={() => onShowKeyChange(!showKey)}
            />
          </div>
          {apiKeyRemovalPending ? (
            <HelpText data-testid="provider-api-key-removal-pending" className="field-hint" variant="negative">
              {t.settings.secretRemovalPending}
            </HelpText>
          ) : apiKeySaved && apiKeySavedHint ? (
            <HelpText className="field-hint">{apiKeySavedHint}</HelpText>
          ) : null}
        </div>
        {connectionStatus ? renderStatusNotice(connectionStatus) : null}
      </div>

      {extraSections}

      {defaultModelSection && (
        <>
          <Divider />
          <div className="section">
            <div className="section-title settings-section-heading">{t.settings.defaultModel}</div>
            {defaultModelSection}
          </div>
        </>
      )}

      <div className="test-area">
        <div className="settings-action-row">
          <Button data-testid="provider-test-button" className="test-btn settings-action-emphasis" variant="secondary" disabled={testBusy} onClick={() => void onTest()}>
            {testBusy
              ? (
                <span className="ui-button-content">
                  <Icon name="spinner" size={13} className="ui-icon-text-icon spin" />
                  <span className="ui-button-label">{t.settings.testingConnection}</span>
                </span>
              )
              : (
                <span className="ui-button-content">
                  <Icon name="check" size={13} className="ui-icon-text-icon" />
                  <span className="ui-button-label">{t.settings.testConnection}</span>
                </span>
              )
            }
          </Button>
        </div>
        {testMeta ? <div className="test-meta">{testMeta}</div> : null}
        {testStatus ? renderStatusNotice(testStatus) : null}
      </div>
    </div>
  );
}
