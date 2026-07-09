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
  readonly wrapInSection?: boolean;
  readonly onAuthModeMenuOpenChange: (open: boolean) => void;
  readonly onPathChange: (next: Partial<ApiPathDraft>) => void;
}

interface ProviderModelSelectionSectionProps {
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly canCreateModelConfig?: boolean;
  readonly wrapInSection?: boolean;
  readonly modelMenuOpen: boolean;
  readonly modelOptions: readonly { readonly id: string; readonly label: string }[];
  readonly selectedModelId: string;
  readonly triggerValue: string;
  readonly modelFieldHelp?: {
    readonly id: string;
    readonly message: string;
    readonly tone?: 'neutral' | 'negative';
    readonly testId?: string;
  } | null;
  readonly emptyStateNotice?: {
    readonly tone: 'info' | 'warning';
    readonly message: string;
    readonly description?: string | null;
    readonly detail?: string | null;
    readonly copyText?: string | null;
    readonly actionLabel?: string;
    readonly onAction?: () => void;
  } | null;
  readonly onCreateModelConfig?: () => void;
  readonly onModelMenuOpenChange: (open: boolean) => void;
  readonly onModelSelect: (id: string) => void;
}

interface ProviderSettingsFooterProps {
  readonly footerClassName?: string;
  readonly innerClassName?: string;
  readonly saveGroupClassName?: string;
  readonly testBusy: boolean;
  readonly saveBusy: boolean;
  readonly testSupported: boolean;
  readonly saveDisabled: boolean;
  readonly onTestMouseDown?: () => void;
  readonly onTest: () => void;
  readonly onSaveMouseDown?: () => void;
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
  wrapInSection = true,
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
  const content = (
    <>
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
    </>
  );
  return wrapInSection ? <div className="section">{content}</div> : <div className="provider-embedded-section">{content}</div>;
}

export function ProviderModelSelectionSection({
  disabled,
  loading,
  canCreateModelConfig = false,
  wrapInSection = true,
  modelMenuOpen,
  modelOptions,
  selectedModelId,
  triggerValue,
  modelFieldHelp = null,
  emptyStateNotice = null,
  onCreateModelConfig,
  onModelMenuOpenChange,
  onModelSelect,
}: ProviderModelSelectionSectionProps) {
  const { messages: t } = useI18n();
  const describedBy = modelFieldHelp?.id;
  const content = (
    <>
      <div className="settings-section-header">
        <div className="section-title settings-section-heading">{t.settings.selectedModel}</div>
        <div className="settings-section-header-actions">
          {canCreateModelConfig ? (
            <IconButton
              data-testid="provider-add-model-config-button"
              className="settings-icon-button"
              compactSquare
              disabled={disabled}
              icon={<Icon name="add" size={16} />}
              tooltip={t.settings.createModelConfiguration}
              aria-label={t.settings.createModelConfiguration}
              onClick={onCreateModelConfig}
            />
          ) : null}
        </div>
      </div>
      <div className="field">
        <TextSelect
          label={t.settings.selectedModel}
          value={triggerValue}
          disabled={disabled || loading || modelOptions.length === 0}
          open={modelMenuOpen}
          onOpenChange={onModelMenuOpenChange}
          options={modelOptions}
          selectedId={selectedModelId}
          onSelect={onModelSelect}
          testId="provider-model-selector"
          triggerId="provider-model-selector"
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
      {emptyStateNotice ? (
        <div className="status-empty-state" data-testid="provider-model-empty-notice">
          <StatusNotice
            tone={emptyStateNotice.tone}
            message={emptyStateNotice.message}
            description={emptyStateNotice.description ?? null}
            detail={emptyStateNotice.detail ?? null}
            copyText={emptyStateNotice.copyText ?? null}
            action={emptyStateNotice.actionLabel && emptyStateNotice.onAction
              ? {
                  label: emptyStateNotice.actionLabel,
                  onAction: emptyStateNotice.onAction,
                }
              : null}
          />
        </div>
      ) : null}
    </>
  );
  return wrapInSection ? <div className="section">{content}</div> : <div className="provider-embedded-section">{content}</div>;
}

export function ProviderSettingsFooter({
  footerClassName,
  innerClassName,
  saveGroupClassName,
  testBusy,
  saveBusy,
  testSupported,
  saveDisabled,
  onTestMouseDown,
  onTest,
  onSaveMouseDown,
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
            onMouseDownCapture={onTestMouseDown}
            onClick={onTest}
          />
        </div>
        {saveGroupClassName ? (
          <div className={saveGroupClassName}>
            <Button
              data-testid="provider-save-button"
              className="btn-save"
              variant="accent"
              disabled={saveDisabled}
              onMouseDownCapture={onSaveMouseDown}
              onClick={onSave}
            >
              {saveBusy ? t.settings.saving : t.common.save}
            </Button>
          </div>
        ) : (
          <Button
            data-testid="provider-save-button"
            className="btn-save"
            variant="accent"
            disabled={saveDisabled}
            onMouseDownCapture={onSaveMouseDown}
            onClick={onSave}
          >
            {saveBusy ? t.settings.saving : t.common.save}
          </Button>
        )}
      </div>
    </footer>
  );
}
