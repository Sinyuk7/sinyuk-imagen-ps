import { useState } from 'react';
import { useAppServices } from '../../ports/app-services-context';
import type {
  AppGenerationSettings,
  AppProviderInputSizePreset,
} from '../../ports/app-generation-settings';
import type { GenerationSettingsSaveState } from '../hooks/use-generation-settings';
import { useAppPathInfo } from '../hooks/use-app-path-info';
import { StatusNotice } from '../components/status-notice';
import { FieldLabel, HelpText } from '../primitives/native-controls';
import { TextSelect } from '../components/text-select';
import { Icon } from '../components/icons';
import { IconButton } from '../primitives/icon-button';
import { useI18n } from '../i18n/i18n-context';

interface GlobalGenerationSettingsPageProps {
  readonly settings: AppGenerationSettings;
  readonly loading: boolean;
  readonly error: string | null;
  readonly saveState: GenerationSettingsSaveState;
  readonly onSave: (settings: AppGenerationSettings) => Promise<void>;
  readonly onBack: () => void;
}

type MenuId = 'provider-input-size' | null;

const PROVIDER_INPUT_SIZE_OPTIONS: ReadonlyArray<{ readonly id: AppProviderInputSizePreset; readonly label: string }> = [
  { id: '1k', label: '1K' },
  { id: '2k', label: '2K' },
  { id: '4k', label: '4K' },
];

function labelFor<T extends string>(options: ReadonlyArray<{ readonly id: T; readonly label: string }>, id: T): string {
  return options.find((option) => option.id === id)?.label ?? id;
}

async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && typeof navigator.clipboard?.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return true;
  }
  return false;
}

export function GlobalGenerationSettingsPage({
  settings,
  loading,
  error,
  saveState,
  onSave,
  onBack,
}: GlobalGenerationSettingsPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const pathInfo = useAppPathInfo(services);
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const updateSettings = (next: Partial<AppGenerationSettings>) => {
    void onSave({ ...settings, ...next });
  };

  const copyPath = async (key: string, value: string) => {
    const ok = await copyText(value).catch(() => false);
    if (!ok) {
      setCopiedKey(null);
      return;
    }
    setCopiedKey(key);
    window.setTimeout(() => {
      setCopiedKey((current) => (current === key ? null : current));
    }, 1200);
  };
  const saveStatusIcon = saveState === 'saving'
    ? <Icon name="spinner" size={14} className="spin" />
    : saveState === 'saved'
      ? <Icon name="check" size={14} />
      : saveState === 'error'
        ? <Icon name="error" size={14} />
        : null;
  const saveStatusLabel = saveState === 'saving'
    ? t.settings.saving
    : saveState === 'saved'
      ? t.settings.saved
      : saveState === 'error'
        ? error
        : null;
  const saveStatusClassName = saveState === 'saving'
    ? 'save-status save-status-busy'
    : saveState === 'saved'
      ? 'save-status save-status-saved'
      : saveState === 'error'
        ? 'save-status'
        : null;

  return (
    <div className="page page-enter settings-page" onClick={() => setOpenMenu(null)}>
      <header className="hdr">
        <IconButton
          data-testid="global-settings-back-button"
          className="hdr-btn"
          quiet
          icon={<Icon name="chevron-left" />}
          tooltip={t.common.back}
          onClick={onBack}
        />
        <div className="hdr-title">{t.settings.globalSettings}</div>
        <div style={{ width: 32 }} />
      </header>
      <div className="scroll">
        <div className="settings-detail-layout scroll-footer-pad generation-settings-layout">
          <section className="section generation-settings-section">
            <div className="section-title settings-section-heading">{t.settings.inputGroup}</div>
            <div className="field">
              <FieldLabel htmlFor="provider-input-size-trigger">{t.settings.providerInputSizePreset}</FieldLabel>
              <TextSelect
                testId="provider-input-size-selector"
                triggerId="provider-input-size-trigger"
                containerClassName="cmp-select settings-select"
                menuClassName="cmp-select-menu cmp-select-menu-compact"
                label={t.settings.providerInputSizePreset}
                value={labelFor(PROVIDER_INPUT_SIZE_OPTIONS, settings.providerInputSizePreset)}
                disabled={loading}
                open={openMenu === 'provider-input-size'}
                onOpenChange={(open) => setOpenMenu(open ? 'provider-input-size' : null)}
                options={PROVIDER_INPUT_SIZE_OPTIONS}
                selectedId={settings.providerInputSizePreset}
                onSelect={(value) => updateSettings({ providerInputSizePreset: value as AppProviderInputSizePreset })}
              />
              <HelpText
                className="field-hint"
                data-testid="global-settings-provider-input-size-hint"
              >
                {`${t.settings.providerInputSizePresetHint} ${t.settings.useInputSizeNormalizedHint}`}
              </HelpText>
            </div>
          </section>
          <section className="section generation-settings-section generation-settings-secondary-section">
            <div className="section-title settings-section-heading">{t.settings.storageGroup}</div>
            <div className="generation-settings-section-intro">
              <HelpText className="field-hint generation-settings-section-hint">
                {t.settings.storageGroupHint}
              </HelpText>
            </div>
            {pathInfo.value ? (
              <div className="settings-path-list generation-settings-path-list">
                <div className="field">
                  <FieldLabel htmlFor="global-settings-copy-log-path">{t.settings.logPath}</FieldLabel>
                  <div className="field-input-affordance settings-path-affordance">
                    <code
                      className="settings-path-block field-input-embedded"
                      data-testid="global-settings-log-path"
                      title={pathInfo.value.logPath}
                    >
                      {pathInfo.value.logPath}
                    </code>
                    <IconButton
                      id="global-settings-copy-log-path"
                      data-testid="global-settings-copy-log-path"
                      className={`field-input-action settings-path-copy${copiedKey === 'logPath' ? ' cp' : ''}`}
                      quiet
                      icon={copiedKey === 'logPath' ? <Icon name="check" /> : <Icon name="copy" />}
                      tooltip={copiedKey === 'logPath' ? t.common.copied : t.common.copy}
                      onClick={() => void copyPath('logPath', pathInfo.value!.logPath)}
                    />
                  </div>
                </div>
                <div className="field">
                  <FieldLabel htmlFor="global-settings-copy-generated-image-path">{t.settings.generatedImagePath}</FieldLabel>
                  <div className="field-input-affordance settings-path-affordance">
                    <code
                      className="settings-path-block field-input-embedded"
                      data-testid="global-settings-generated-image-path"
                      title={pathInfo.value.generatedImagePath}
                    >
                      {pathInfo.value.generatedImagePath}
                    </code>
                    <IconButton
                      id="global-settings-copy-generated-image-path"
                      data-testid="global-settings-copy-generated-image-path"
                      className={`field-input-action settings-path-copy${copiedKey === 'generatedImagePath' ? ' cp' : ''}`}
                      quiet
                      icon={copiedKey === 'generatedImagePath' ? <Icon name="check" /> : <Icon name="copy" />}
                      tooltip={copiedKey === 'generatedImagePath' ? t.common.copied : t.common.copy}
                      onClick={() => void copyPath('generatedImagePath', pathInfo.value!.generatedImagePath)}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="status-replacement-slot" data-testid="global-settings-path-status">
                <StatusNotice
                  tone={pathInfo.error ? 'warning' : 'info'}
                  message={pathInfo.loading ? t.common.loading : pathInfo.error ?? t.settings.pathInfoUnavailable}
                  detail={pathInfo.error}
                  copyText={pathInfo.error ?? null}
                />
              </div>
            )}
          </section>
          <section className="section generation-settings-section generation-settings-meta-section generation-settings-secondary-section">
            <div
              data-testid="global-settings-footer-statement"
              className="generation-settings-meta"
            >
              {t.settings.footerStatement}
            </div>
            {saveStatusClassName && saveStatusLabel ? (
              <div
                data-testid="global-settings-save-status"
                className={saveStatusClassName}
              >
                {saveStatusIcon}
                <span>{saveStatusLabel}</span>
              </div>
            ) : null}
          </section>
          {error && (
            <section className="section generation-settings-section generation-settings-secondary-section">
              <div className="status-warning-slot" data-testid="global-settings-error-notice">
                <StatusNotice tone="negative" message={error} copyText={error} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
