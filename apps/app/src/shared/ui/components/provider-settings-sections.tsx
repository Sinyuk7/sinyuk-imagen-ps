import type { ReactNode } from 'react';
import type { ApiFormat } from '@imagen-ps/application';
import { useI18n } from '../i18n/i18n-context';
import { Button, FieldLabel, HelpText, TextField } from '../primitives/native-controls';
import { IconButton } from '../primitives/icon-button';
import { TextSelect } from './text-select';
import { Icon } from './icons';
import { FieldHelp } from './field-help';
import { StatusNotice } from './status-notice';
import type { ApiPathDraft } from '../hooks/use-provider-settings';

interface ProviderAdvancedPathSectionProps {
  readonly apiFormat: ApiFormat | null;
  readonly paths: ApiPathDraft;
  readonly authModeMenuOpen: boolean;
  readonly disabled: boolean;
  readonly onAuthModeMenuOpenChange: (open: boolean) => void;
  readonly onPathChange: (next: Partial<ApiPathDraft>) => void;
}

interface ProviderDefaultModelSectionProps {
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly discoverySupported: boolean;
  readonly modelMenuOpen: boolean;
  readonly modelOptions: readonly { readonly id: string; readonly label: string }[];
  readonly defaultModel: string;
  readonly triggerValue: string;
  readonly modelFieldHelp?: {
    readonly id: string;
    readonly message: string;
    readonly tone?: 'neutral' | 'negative';
    readonly testId?: string;
  } | null;
  readonly listNotice?: {
    readonly tone: 'info' | 'warning';
    readonly message: string;
    readonly detail?: string | null;
    readonly copyText?: string | null;
  } | null;
  readonly modelStatusNotice?: {
    readonly tone: 'info' | 'warning';
    readonly message: string;
  } | null;
  readonly onRefresh: () => void;
  readonly onModelMenuOpenChange: (open: boolean) => void;
  readonly onDefaultModelSelect: (id: string) => void;
}

interface ProviderSettingsFooterProps {
  readonly footerClassName?: string;
  readonly innerClassName?: string;
  readonly saveGroupClassName?: string;
  readonly testBusy: boolean;
  readonly saveBusy: boolean;
  readonly testSupported: boolean;
  readonly saveDisabled: boolean;
  readonly onTest: () => void;
  readonly onSave: () => void;
}

interface ProviderSettingsPageHeaderProps {
  readonly backButtonTestId?: string;
  readonly title: ReactNode;
  readonly onBack: () => void;
  readonly rightSlot?: ReactNode;
}

export function ProviderSettingsPageHeader({
  backButtonTestId,
  title,
  onBack,
  rightSlot,
}: ProviderSettingsPageHeaderProps) {
  const { messages: t } = useI18n();
  return (
    <header className="hdr">
      <IconButton
        data-testid={backButtonTestId}
        className="hdr-btn"
        quiet
        icon={<Icon name="chevron-left" />}
        tooltip={t.common.back}
        onClick={onBack}
      />
      {typeof title === 'string' ? <div className="hdr-title">{title}</div> : title}
      {rightSlot ?? <div style={{ width: 32 }} />}
    </header>
  );
}

export function ProviderAdvancedPathSection({
  apiFormat,
  paths,
  authModeMenuOpen,
  disabled,
  onAuthModeMenuOpenChange,
  onPathChange,
}: ProviderAdvancedPathSectionProps) {
  const { messages: t } = useI18n();
  if (!apiFormat) {
    return null;
  }
  const authOptions = [
    { id: 'x-goog-api-key', label: 'x-goog-api-key' },
    { id: 'bearer', label: 'Bearer' },
    { id: 'none', label: 'None' },
  ];
  return (
    <div className="section">
      <div className="section-title settings-section-heading">{t.settings.advancedSettings}</div>
      {apiFormat === 'openai-images' ? (
        <>
          <div className="field">
            <FieldLabel htmlFor="provider-generation-path-input">{t.settings.generationPath}</FieldLabel>
            <TextField
              data-testid="provider-generation-path-input"
              id="provider-generation-path-input"
              className="field-input mono ui-field-control"
              value={paths.generation}
              disabled={disabled}
              onValue={(value) => onPathChange({ generation: value })}
            />
          </div>
          <div className="field">
            <FieldLabel htmlFor="provider-edit-path-input">{t.settings.editPath}</FieldLabel>
            <TextField
              data-testid="provider-edit-path-input"
              id="provider-edit-path-input"
              className="field-input mono ui-field-control"
              value={paths.edit}
              disabled={disabled}
              onValue={(value) => onPathChange({ edit: value })}
            />
          </div>
          <HelpText className="field-hint">{t.settings.authModeFixedBearer}</HelpText>
        </>
      ) : null}
      {apiFormat === 'openai-chat-completions' ? (
        <>
          <div className="field">
            <FieldLabel htmlFor="provider-invoke-path-input">{t.settings.invokePath}</FieldLabel>
            <TextField
              data-testid="provider-invoke-path-input"
              id="provider-invoke-path-input"
              className="field-input mono ui-field-control"
              value={paths.invoke}
              disabled={disabled}
              onValue={(value) => onPathChange({ invoke: value })}
            />
          </div>
          <HelpText className="field-hint">{t.settings.authModeFixedBearer}</HelpText>
        </>
      ) : null}
      {apiFormat === 'gemini-generate-content' ? (
        <>
          <div className="field">
            <FieldLabel htmlFor="provider-invoke-template-input">{t.settings.invokePathTemplate}</FieldLabel>
            <TextField
              data-testid="provider-invoke-template-input"
              id="provider-invoke-template-input"
              className="field-input mono ui-field-control"
              value={paths.invokeTemplate}
              disabled={disabled}
              onValue={(value) => onPathChange({ invokeTemplate: value })}
            />
          </div>
          <div className="field">
            <FieldLabel htmlFor="provider-auth-mode-selector">{t.settings.authMode}</FieldLabel>
            <TextSelect
              label={t.settings.authMode}
              value={authOptions.find((option) => option.id === paths.authMode)?.label ?? paths.authMode}
              disabled={disabled}
              open={authModeMenuOpen}
              onOpenChange={onAuthModeMenuOpenChange}
              options={authOptions}
              selectedId={paths.authMode}
              onSelect={(id) => {
                onPathChange({ authMode: id as ApiPathDraft['authMode'] });
                onAuthModeMenuOpenChange(false);
              }}
              testId="provider-auth-mode-selector"
              triggerId="provider-auth-mode-selector"
              containerClassName="cmp-select cmp-select-model provider-model-select"
              menuClassName="cmp-select-menu cmp-select-menu-model"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

export function ProviderDefaultModelSection({
  disabled,
  loading,
  discoverySupported,
  modelMenuOpen,
  modelOptions,
  defaultModel,
  triggerValue,
  modelFieldHelp = null,
  listNotice = null,
  modelStatusNotice = null,
  onRefresh,
  onModelMenuOpenChange,
  onDefaultModelSelect,
}: ProviderDefaultModelSectionProps) {
  const { messages: t } = useI18n();
  const describedBy = modelFieldHelp?.id;
  return (
    <div className="section">
      <div className="settings-section-header">
        <div className="section-title settings-section-heading">{t.settings.defaultModel}</div>
        <IconButton
          data-testid="provider-refresh-models-button"
          className="settings-icon-button"
          compactSquare
          disabled={loading || disabled || !discoverySupported}
          icon={<Icon name="refresh" size={16} className={loading ? 'spin' : undefined} />}
          tooltip={!discoverySupported ? t.settings.modelDiscoveryUnsupported : loading ? t.settings.refreshingModels : t.settings.refreshModels}
          aria-label={!discoverySupported ? t.settings.modelDiscoveryUnsupported : loading ? t.settings.refreshingModels : t.settings.refreshModels}
          onClick={onRefresh}
        />
      </div>
      <div className="field">
        <TextSelect
          label={t.settings.defaultModel}
          value={triggerValue}
          disabled={disabled || loading || modelOptions.length === 0}
          open={modelMenuOpen}
          onOpenChange={onModelMenuOpenChange}
          options={modelOptions}
          selectedId={defaultModel}
          onSelect={onDefaultModelSelect}
          testId="provider-default-model-selector"
          triggerId="provider-default-model-selector"
          ariaDescribedBy={describedBy}
          containerClassName="cmp-select cmp-select-model provider-model-select"
          menuClassName="cmp-select-menu cmp-select-menu-model"
        />
        {modelFieldHelp ? (
          <FieldHelp
            id={modelFieldHelp.id}
            tone={modelFieldHelp.tone}
            className="provider-model-field-help"
            testId={modelFieldHelp.testId}
          >
            {modelFieldHelp.message}
          </FieldHelp>
        ) : null}
      </div>
      {listNotice ? (
        <div data-testid="provider-model-list-notice">
          <StatusNotice
            tone={listNotice.tone}
            message={listNotice.message}
            detail={listNotice.detail ?? null}
            copyText={listNotice.copyText ?? null}
          />
        </div>
      ) : null}
      {modelStatusNotice ? (
        <div data-testid="provider-model-status-notice">
          <StatusNotice tone={modelStatusNotice.tone} message={modelStatusNotice.message} />
        </div>
      ) : null}
    </div>
  );
}

export function ProviderSettingsFooter({
  footerClassName,
  innerClassName,
  saveGroupClassName,
  testBusy,
  saveBusy,
  testSupported,
  saveDisabled,
  onTest,
  onSave,
}: ProviderSettingsFooterProps) {
  const { messages: t } = useI18n();
  return (
    <footer className={footerClassName ?? 'det-footer'}>
      <div className={innerClassName ?? 'settings-detail-footer-inner'}>
        <div className="settings-detail-footer-actions">
          <IconButton
            data-testid="provider-test-button"
            className="settings-icon-button"
            compactSquare
            disabled={saveBusy || testBusy || !testSupported}
            icon={testBusy ? <Icon name="spinner" size={16} className="spin" /> : <Icon name="network" size={16} />}
            tooltip={!testSupported ? t.settings.providerConnectionUnsupported : testBusy ? t.settings.testingConnection : t.settings.testConnection}
            aria-label={!testSupported ? t.settings.providerConnectionUnsupported : testBusy ? t.settings.testingConnection : t.settings.testConnection}
            onClick={onTest}
          />
        </div>
        {saveGroupClassName ? (
          <div className={saveGroupClassName}>
            <Button data-testid="provider-save-button" className="btn-save" variant="accent" disabled={saveDisabled} onClick={onSave}>
              {saveBusy ? t.settings.saving : t.common.save}
            </Button>
          </div>
        ) : (
          <Button data-testid="provider-save-button" className="btn-save" variant="accent" disabled={saveDisabled} onClick={onSave}>
            {saveBusy ? t.settings.saving : t.common.save}
          </Button>
        )}
      </div>
    </footer>
  );
}
