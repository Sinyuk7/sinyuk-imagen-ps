import type { ReactNode } from 'react';
import { StatusNotice } from './status-notice';
import { Icon } from './icons';
import { useI18n } from '../i18n/i18n-context';
import { Button, TextField, FieldLabel, HelpText, Divider } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import type { ProviderStatus } from '../provider-status';

interface ProviderProfileEditorProps {
  readonly connectionTitle: string;
  readonly aliasValue: string;
  readonly onAliasValue: (value: string) => void;
  readonly aliasPlaceholder?: string;
  readonly baseUrlValue: string;
  readonly onBaseUrlValue: (value: string) => void;
  readonly baseUrlPlaceholder?: string;
  readonly apiKeyValue: string;
  readonly onApiKeyValue: (value: string) => void;
  readonly apiKeyPlaceholder: string;
  readonly showKey: boolean;
  readonly onShowKeyChange: (shown: boolean) => void;
  readonly connectionStatus?: ProviderStatus | null;
  readonly extraSections?: ReactNode;
  readonly defaultModelSection?: ReactNode;
  readonly testBusy: boolean;
  readonly onTest: () => void;
  readonly testMeta?: string | null;
  readonly testStatus?: ProviderStatus | null;
}

export function ProviderProfileEditor({
  connectionTitle,
  aliasValue,
  onAliasValue,
  aliasPlaceholder,
  baseUrlValue,
  onBaseUrlValue,
  baseUrlPlaceholder,
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
}: ProviderProfileEditorProps) {
  const { messages: t } = useI18n();

  return (
    <div className="settings-detail-layout">
      <div className="section">
        <div className="section-title">{connectionTitle}</div>
        <div className="field">
          <FieldLabel htmlFor="provider-alias-input">{t.settings.alias}</FieldLabel>
          <TextField
            data-testid="provider-alias-input"
            id="provider-alias-input"
            className="field-input ui-field-control"
            placeholder={aliasPlaceholder}
            value={aliasValue}
            onValue={onAliasValue}
          />
        </div>
        <div className="field">
          <FieldLabel htmlFor="provider-base-url-input">Base URL</FieldLabel>
          <TextField
            data-testid="provider-base-url-input"
            id="provider-base-url-input"
            className="field-input mono ui-field-control"
            placeholder={baseUrlPlaceholder}
            value={baseUrlValue}
            onValue={onBaseUrlValue}
          />
          <HelpText className="field-hint">{t.settings.baseUrlHint}</HelpText>
        </div>
        <div className="field">
          <FieldLabel htmlFor="provider-api-key-input">API Key</FieldLabel>
          <div className="field-input-affordance">
            <TextField
              data-testid="provider-api-key-input"
              id="provider-api-key-input"
              type={showKey ? 'text' : 'password'}
              className="field-input mono ui-field-control field-input-embedded"
              placeholder={apiKeyPlaceholder}
              value={apiKeyValue}
              onValue={onApiKeyValue}
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
        </div>
        {connectionStatus && <StatusNotice tone={connectionStatus.tone} message={connectionStatus.message} />}
      </div>

      {extraSections}

      {defaultModelSection && (
        <>
          <Divider />
          <div className="section">
            <div className="section-title">{t.settings.defaultModel}</div>
            {defaultModelSection}
          </div>
        </>
      )}

      <div className="test-area">
        <Button data-testid="provider-test-button" className="test-btn ui-button-block" variant="secondary" disabled={testBusy} onClick={() => void onTest()}>
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
        {testMeta ? <div className="test-meta">{testMeta}</div> : null}
        {testStatus && <StatusNotice tone={testStatus.tone} message={testStatus.message} />}
      </div>
    </div>
  );
}
