import { useState } from 'react';
import { useAppServices } from '../../ports/app-services-context';
import type {
  AppAspectRatio,
  AppGenerationSettings,
  AppProviderInputSizePreset,
  AppOutputFormat,
  AppOutputSizePreset,
} from '../../ports/app-generation-settings';
import type { GenerationSettingsSaveState } from '../hooks/use-generation-settings';
import { useAppPathInfo } from '../hooks/use-app-path-info';
import { StatusNotice } from '../components/status-notice';
import { useToast } from '../components/toast-host';
import { FieldLabel, HelpText } from '../primitives/native-controls';
import { TextSelect } from '../components/text-select';
import { Icon } from '../components/icons';
import { IconButton } from '../primitives/icon-button';
import { useI18n } from '../i18n/i18n-context';
import { canSelectOutputSize, OUTPUT_SIZE_PRESETS, outputSizeLabel, type OutputSizeSelectionContext } from '../output-size';

interface GlobalGenerationSettingsPageProps {
  readonly settings: AppGenerationSettings;
  readonly loading: boolean;
  readonly error: string | null;
  readonly saveState: GenerationSettingsSaveState;
  readonly outputSizeContext: OutputSizeSelectionContext;
  readonly onSave: (settings: AppGenerationSettings) => Promise<void>;
  readonly onNav: (view: string) => void;
}

type MenuId = 'size' | 'format' | 'aspect' | 'provider-input-size' | null;

const SIZE_OPTIONS: ReadonlyArray<{ readonly id: AppOutputSizePreset; readonly label: string }> = OUTPUT_SIZE_PRESETS.map((size) => ({
  id: size,
  label: outputSizeLabel(size),
}));

const FORMAT_OPTIONS: ReadonlyArray<{ readonly id: AppOutputFormat; readonly label: string }> = [
  { id: 'png', label: 'PNG' },
  { id: 'jpeg', label: 'JPEG' },
  { id: 'webp', label: 'WebP' },
];

const ASPECT_OPTIONS: ReadonlyArray<{ readonly id: AppAspectRatio; readonly label: string }> = [
  { id: 'auto', label: 'Auto' },
  { id: '1:1', label: '1:1' },
  { id: '16:9', label: '16:9' },
  { id: '9:16', label: '9:16' },
];

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
  outputSizeContext,
  onSave,
  onNav,
}: GlobalGenerationSettingsPageProps) {
  const services = useAppServices();
  const { messages: t } = useI18n();
  const { show } = useToast();
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
  const selectOutputSize = (value: AppOutputSizePreset) => {
    const result = canSelectOutputSize(outputSizeContext, value, t);
    if (!result.ok) {
      show(result.reason, 'warning', { key: `global-output-size-rejected:${value}` });
      return;
    }
    updateSettings({ outputSizePreset: result.nextSize });
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
          onClick={() => onNav('settings')}
        />
        <div className="hdr-title">{t.settings.globalGeneration}</div>
        <div style={{ width: 32 }} />
      </header>
      <div className="scroll">
        <div className="settings-detail-layout scroll-footer-pad generation-settings-layout">
          <section className="section generation-settings-section">
            <div className="section-title settings-section-heading">{t.settings.outputGroup}</div>
            <div className="generation-settings-section-intro">
              <HelpText className="field-hint generation-settings-section-hint">
                {t.settings.outputSize} / {t.settings.outputFormat} / {t.settings.aspectRatio}
              </HelpText>
            </div>
            <div className="generation-settings-grid">
              <div className="field">
                <FieldLabel htmlFor="global-output-size-trigger">{t.settings.outputSize}</FieldLabel>
                <TextSelect
                  testId="global-output-size-selector"
                  triggerId="global-output-size-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-compact"
                  label={t.settings.outputSize}
                  value={labelFor(SIZE_OPTIONS, settings.outputSizePreset)}
                  disabled={loading}
                  open={openMenu === 'size'}
                  onOpenChange={(open) => setOpenMenu(open ? 'size' : null)}
                  options={SIZE_OPTIONS}
                  isOptionSelectable={(value) => canSelectOutputSize(outputSizeContext, value as AppOutputSizePreset, t).ok}
                  selectedId={settings.outputSizePreset}
                  onSelect={(value) => selectOutputSize(value as AppOutputSizePreset)}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="global-output-format-trigger">{t.settings.outputFormat}</FieldLabel>
                <TextSelect
                  testId="global-output-format-selector"
                  triggerId="global-output-format-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-compact"
                  label={t.settings.outputFormat}
                  value={labelFor(FORMAT_OPTIONS, settings.outputFormat)}
                  disabled={loading}
                  open={openMenu === 'format'}
                  onOpenChange={(open) => setOpenMenu(open ? 'format' : null)}
                  options={FORMAT_OPTIONS}
                  selectedId={settings.outputFormat}
                  onSelect={(value) => updateSettings({ outputFormat: value as AppOutputFormat })}
                />
              </div>
              <div className="field">
                <FieldLabel htmlFor="global-aspect-ratio-trigger">{t.settings.aspectRatio}</FieldLabel>
                <TextSelect
                  testId="global-aspect-ratio-selector"
                  triggerId="global-aspect-ratio-trigger"
                  containerClassName="cmp-select settings-select"
                  menuClassName="cmp-select-menu cmp-select-menu-compact"
                  label={t.settings.aspectRatio}
                  value={labelFor(ASPECT_OPTIONS, settings.aspectRatio)}
                  disabled={loading}
                  open={openMenu === 'aspect'}
                  onOpenChange={(open) => setOpenMenu(open ? 'aspect' : null)}
                  options={ASPECT_OPTIONS}
                  selectedId={settings.aspectRatio}
                  onSelect={(value) => updateSettings({ aspectRatio: value as AppAspectRatio })}
                />
              </div>
            </div>
          </section>
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
              <HelpText className="field-hint">{t.settings.providerInputSizePresetHint}</HelpText>
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
              <div data-testid="global-settings-path-status">
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
              <div data-testid="global-settings-error-notice">
                <StatusNotice tone="negative" message={error} copyText={error} />
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
